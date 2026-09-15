namespace Ivent {
  type ViewName = 'dashboard' | 'shop' | 'program' | 'saves' | 'auction' | 'final';

  interface AppContext {
    doc: Document;
    win: Window;
    root: HTMLElement;
    storage: StorageAdapter;
    state: EventState | null;
    activeSlot: SaveSlot;
    view: ViewName;
    toastTimer: number | null;
  }

  class MemoryStorage implements StorageLike {
    private data = new Map<string, string>();
    getItem(key: string): string | null { return this.data.get(key) ?? null; }
    setItem(key: string, value: string): void { this.data.set(key, value); }
    removeItem(key: string): void { this.data.delete(key); }
  }

  function escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function nowMs(): number { return Date.now(); }

  function formatTime(timestamp: number): string {
    try { return new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  function formatDuration(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function getStorage(win: Window): StorageLike {
    try {
      const storage = win.localStorage;
      const probe = '__ivent_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      return new MemoryStorage();
    }
  }

  function showToast(ctx: AppContext, message: string, kind: 'ok' | 'error' = 'ok'): void {
    const old = ctx.doc.querySelector('.toast');
    old?.remove();
    const node = ctx.doc.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = message;
    ctx.doc.body.appendChild(node);
    if (ctx.toastTimer !== null) ctx.win.clearTimeout(ctx.toastTimer);
    ctx.toastTimer = ctx.win.setTimeout(() => node.remove(), 2800);
  }

  function autoSave(ctx: AppContext): void {
    if (!ctx.state?.configuration.autoSave) return;
    try { ctx.storage.save(ctx.activeSlot, ctx.state); }
    catch (error) { showToast(ctx, `Автосохранение: ${(error as Error).message}`, 'error'); }
  }

  function runCommand(ctx: AppContext, command: Command, renderAfter = true): boolean {
    if (!ctx.state) return false;
    try {
      ctx.state = execute(ctx.state, { ...command, now: command.now ?? nowMs() }).state;
      autoSave(ctx);
      if (renderAfter) render(ctx);
      return true;
    } catch (error) {
      showToast(ctx, (error as Error).message, 'error');
      return false;
    }
  }

  function navHtml(active: ViewName): string {
    const items: Array<[ViewName, string]> = [
      ['dashboard', 'Вечер'], ['program', 'Этапы'], ['shop', 'Магазин'], ['auction', 'Аукцион'], ['saves', 'Сохранения'], ['final', 'Итоги'],
    ];
    return `<nav class="nav">${items.map(([id, label]) => `<button class="nav-btn ${active === id ? 'active' : ''}" data-view="${id}">${label}</button>`).join('')}</nav>`;
  }

  function topbarHtml(state: EventState): string {
    return `<header class="topbar">
      <div class="brand"><strong>IVENT</strong> SYSTEM</div>
      <div class="event-name">${escapeHtml(state.title)}</div>
      <span class="status-pill ${state.status === 'PLAYING' ? 'playing' : ''}">${escapeHtml(state.status)}</span>
      <div class="top-spacer"></div>
      <button class="top-action" data-action="undo">↶ Отменить</button>
      <button class="top-action danger" data-action="finish-event">Завершить вечер</button>
    </header>`;
  }

  function activeStageElapsed(stage: Stage): number {
    let elapsed = stage.elapsedSeconds;
    if (stage.status === 'ACTIVE' && stage.resumedAt !== null) elapsed += Math.max(0, Math.floor((nowMs() - stage.resumedAt) / 1000));
    return elapsed;
  }

  function playersHtml(state: EventState): string {
    if (!state.players.length) return '<div class="empty">Игроков пока нет</div>';
    return `<div class="players-list">${state.players.map((player) => {
      const active = player.activeItemIds.map((id) => state.inventory.find((item) => item.id === id)).filter(Boolean) as ItemInstance[];
      return `<div class="player-card">
        <span class="player-dot" style="background:${escapeHtml(player.displayColor)}"></span>
        <div><div class="player-name">${escapeHtml(player.name)}</div><div class="player-meta">Победы ${player.wins} · Потрачено ${player.totalSpent}</div>${active.map((item) => `<span class="active-chip">${escapeHtml(item.name)}</span>`).join('')}</div>
        <div class="wallet"><button class="mini-btn" data-action="token-minus" data-player="${player.id}">−</button><span class="token">${player.walletBalance}</span><button class="mini-btn" data-action="token-plus" data-player="${player.id}">+</button></div>
      </div>`;
    }).join('')}</div>`;
  }

  function currentStageHtml(state: EventState): string {
    const stage = state.stages[state.currentStageIndex] ?? null;
    if (!stage) return '<div class="hero-stage"><div class="eyebrow">Программа пуста</div><h1 class="stage-title">Добавь первый этап</h1><p class="stage-summary">Открой раздел «Этапы» и собери программу вечера.</p></div>';
    const module = getGameRegistry()[stage.moduleId];
    const elapsed = activeStageElapsed(stage);
    const remaining = Math.max(0, stage.plannedDurationSeconds - elapsed);
    const controls: string[] = [];
    if (stage.status === 'PENDING') controls.push(`<button class="btn primary" data-action="start-stage" data-stage="${stage.id}">▶ Запустить этап</button>`);
    if (stage.status === 'ACTIVE') controls.push(`<button class="btn" data-action="pause-stage" data-stage="${stage.id}">Ⅱ Пауза</button>`, `<button class="btn primary" data-action="finish-stage" data-stage="${stage.id}">Завершить</button>`);
    if (stage.status === 'PAUSED') controls.push(`<button class="btn primary" data-action="resume-stage" data-stage="${stage.id}">Продолжить</button>`, `<button class="btn" data-action="finish-stage" data-stage="${stage.id}">Завершить</button>`);
    if (stage.status === 'FINISHED' && state.currentStageIndex < state.stages.length - 1) controls.push(`<button class="btn primary" data-action="advance-stage">Следующий этап →</button>`);
    return `<div class="hero-stage">
      <div class="eyebrow">Этап ${state.currentStageIndex + 1} / ${state.stages.length} · ${escapeHtml(stage.status)}</div>
      <h1 class="stage-title">${escapeHtml(stage.title)}</h1>
      <p class="stage-summary">${escapeHtml(module?.rulesSummary ?? 'Пользовательский этап')}</p>
      <div class="stage-stats"><div class="stat-box"><b>${formatDuration(elapsed)}</b><span>прошло</span></div><div class="stat-box"><b>${formatDuration(remaining)}</b><span>осталось</span></div><div class="stat-box"><b>${stage.rewards.winner ?? 0}</b><span>жет. победителю</span></div></div>
      <div class="button-row">${controls.join('')}</div>
    </div>`;
  }

  function programStripHtml(state: EventState): string {
    return `<div class="program-strip">${state.stages.map((stage, index) => `<div class="stage-chip ${index === state.currentStageIndex ? 'current' : ''} ${stage.status === 'FINISHED' ? 'done' : ''}"><b>${index + 1}. ${escapeHtml(stage.title)}</b><span>${escapeHtml(stage.status)}</span></div>`).join('')}</div>`;
  }

  function logHtml(state: EventState): string {
    const recent = state.eventLog.slice(-40);
    return `<div class="log-list">${recent.map((entry) => `<div class="log-entry"><span class="log-time">${formatTime(entry.timestamp)} · ${escapeHtml(entry.type)}</span>${escapeHtml(entry.message)}</div>`).join('') || '<div class="empty">События появятся здесь</div>'}</div>`;
  }

  function dashboardHtml(state: EventState): string {
    return `<main class="layout">
      <section class="panel"><div class="panel-head"><span class="panel-title">Игроки</span><span class="tiny-pill">Жетоны</span></div><div class="panel-body">${playersHtml(state)}</div></section>
      <section class="panel">${currentStageHtml(state)}${programStripHtml(state)}</section>
      <section class="panel"><div class="panel-head"><span class="panel-title">Хроника</span><span class="tiny-pill">${state.eventLog.length}</span></div><div class="panel-body">${logHtml(state)}</div></section>
    </main>`;
  }

  function playerOptions(state: EventState, selected = ''): string {
    return `<option value="">Выбери игрока</option>${state.players.map((player) => `<option value="${player.id}" ${player.id === selected ? 'selected' : ''}>${escapeHtml(player.name)} · ${player.walletBalance} жет.</option>`).join('')}`;
  }

  function shopHtml(state: EventState): string {
    const available = state.inventory.filter((item) => item.ownerId === null && item.enabled);
    const owned = state.inventory.filter((item) => item.ownerId !== null);
    return `<main class="workspace"><div class="workspace-head"><div><h1 class="workspace-title">Магазин</h1><p class="workspace-sub">Предметы должны заметно вмешиваться в игру. После активации эффект остаётся виден на карточке игрока.</p></div><span class="tiny-pill">Свободно ${available.length}</span></div>
      <div class="grid">${available.map((item) => `<article class="card"><span class="rarity">${item.rarity}</span><h3>${escapeHtml(item.name)}</h3><p>${item.hiddenEffect ? 'Эффект раскрывается после покупки.' : escapeHtml(item.description)}</p><div class="price">${item.price} жет.</div><select class="select" id="buyer-${item.id}">${playerOptions(state)}</select><div class="button-row"><button class="btn primary" data-action="buy-item" data-item="${item.id}">Купить</button></div></article>`).join('') || '<div class="card"><h3>Витрина пуста</h3><p>Все предметы уже нашли владельцев.</p></div>'}</div>
      <div class="workspace-head" style="margin-top:34px"><div><h2>Инвентарь игроков</h2><p class="workspace-sub">Активировать можно ограниченное число предметов одновременно.</p></div></div>
      <div class="grid">${owned.map((item) => {
        const owner = state.players.find((player) => player.id === item.ownerId);
        return `<article class="card"><span class="rarity">${item.rarity}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><p><b>Владелец:</b> ${escapeHtml(owner?.name ?? '?')} · Использований: ${item.usesRemaining}</p>${['ONE_PLAYER','ANY_PLAYER'].includes(item.targetRule) ? `<select class="select" id="target-${item.id}">${playerOptions(state)}</select>` : ''}<div class="button-row">${item.active ? `<button class="btn" data-action="deactivate-item" data-item="${item.id}" data-player="${item.ownerId}">Выключить</button>` : `<button class="btn purple" data-action="activate-item" data-item="${item.id}" data-player="${item.ownerId}" ${item.usesRemaining <= 0 ? 'disabled' : ''}>Активировать</button>`}</div></article>`;
      }).join('') || '<div class="card"><h3>Инвентарь пуст</h3><p>Купленные предметы появятся здесь.</p></div>'}</div>
    </main>`;
  }

  function programHtml(state: EventState): string {
    const registry = getGameRegistry();
    return `<main class="workspace"><div class="workspace-head"><div><h1 class="workspace-title">Этапы</h1><p class="workspace-sub">Программа вечера хранится вместе с прогрессом. Новые этапы можно добавлять в любой момент.</p></div><div style="display:flex;gap:8px"><select class="select" id="new-stage-module">${Object.values(registry).map((module) => `<option value="${module.id}">${escapeHtml(module.name)}</option>`).join('')}</select><button class="btn primary" data-action="add-stage">Добавить</button></div></div>
      <div class="grid">${state.stages.map((stage, index) => `<article class="card"><span class="rarity">${escapeHtml(stage.type)} · ${escapeHtml(stage.status)}</span><h3>${index + 1}. ${escapeHtml(stage.title)}</h3><p>${escapeHtml(registry[stage.moduleId]?.rulesSummary ?? '')}</p><div class="button-row">${stage.status === 'PENDING' ? `<button class="btn" data-action="select-stage" data-index="${index}">Сделать текущим</button>` : ''}</div></article>`).join('')}</div></main>`;
  }

  function savesHtml(ctx: AppContext, state: EventState): string {
    const slots = ctx.storage.list();
    return `<main class="workspace"><div class="workspace-head"><div><h1 class="workspace-title">Сохранения</h1><p class="workspace-sub">Три ячейки, автоматическая резервная копия и перенос прогресса файлом.</p></div><span class="tiny-pill">Автосохранение → ${ctx.activeSlot}</span></div>
      <div class="grid slots">${slots.map((slot) => `<article class="card"><span class="rarity">${slot.slot === ctx.activeSlot ? 'АКТИВНАЯ' : 'ЯЧЕЙКА'}</span><h3>${escapeHtml(slot.slot)}</h3><p>${slot.empty ? '<span class="slot-empty">Пустая</span>' : `${escapeHtml(slot.title)} · игроков ${slot.playerCount}`}</p><div class="button-row"><button class="btn primary" data-action="save-slot" data-slot="${slot.slot}">Сохранить</button><button class="btn" data-action="load-slot" data-slot="${slot.slot}" ${slot.empty ? 'disabled' : ''}>Загрузить</button><button class="btn ghost" data-action="export-slot" data-slot="${slot.slot}" ${slot.empty ? 'disabled' : ''}>Экспорт</button></div></article>`).join('')}</div>
      <div class="workspace-head" style="margin-top:34px"><div><h2>Импорт</h2><p class="workspace-sub">Выбери JSON-файл сохранения и ячейку назначения.</p></div></div><div class="card" style="max-width:620px;margin:0 auto"><select class="select" id="import-slot"><option value="slot-1">slot-1</option><option value="slot-2">slot-2</option><option value="slot-3">slot-3</option></select><input class="input" style="margin-top:10px" type="file" accept="application/json,.json" id="import-file"></div>
    </main>`;
  }

  function auctionHtml(ctx: AppContext, state: EventState): string {
    const catalog = createDefaultCatalog();
    const auction = state.gameRuntime.auction;
    if (!auction) {
      return `<main class="workspace"><div class="workspace-head"><div><h1 class="workspace-title">Аукцион артефактов</h1><p class="workspace-sub">Игроки тратят заработанные жетоны за сильные предметы. Часть эффектов раскрывается после покупки.</p></div></div><div class="card" style="max-width:760px;margin:70px auto;padding:34px"><h3>Быстрый аукцион · 6 лотов</h3><p>Рентген кошелька → Щит → Перенаправление → Карманник → Большой чупачупс → Изумрудное сердце.</p><button class="btn primary" data-action="start-auction">Запустить аукцион</button></div></main>`;
    }
    if (auction.finished) {
      return `<main class="workspace"><div class="workspace-head"><div><h1 class="workspace-title">Аукцион завершён</h1><p class="workspace-sub">Все выигранные предметы уже находятся в инвентарях игроков.</p></div><button class="btn primary" data-action="reset-auction">Новый аукцион</button></div></main>`;
    }
    const lot = auction.lots[auction.currentLotIndex];
    const item = catalog.find((entry) => entry.templateId === lot.itemTemplateId)!;
    const minimum = lot.highestBidderId ? lot.currentBid + auction.config.bidStep : auction.config.startPrice;
    const bidder = state.players.find((player) => player.id === lot.highestBidderId);
    return `<main class="workspace"><div class="workspace-head"><div><h1 class="workspace-title">Аукцион артефактов</h1><p class="workspace-sub">Лот ${auction.currentLotIndex + 1} / ${auction.lots.length}</p></div><button class="btn danger" data-action="close-lot">Закрыть лот</button></div>
      <div class="auction-stage"><section class="panel lot-card"><span class="rarity">${item.rarity}</span><div class="lot-name">${escapeHtml(item.name)}</div><p class="stage-summary">${item.hiddenEffect ? '??? Эффект будет раскрыт победителю после покупки.' : escapeHtml(item.description)}</p><div class="bid-value">${lot.currentBid || '–'}</div><div class="bidder">${bidder ? `Лидирует ${escapeHtml(bidder.name)}` : `Стартовая цена ${auction.config.startPrice} жет.`}</div></section>
      <section class="panel"><div class="panel-head"><span class="panel-title">Ставки</span><span class="tiny-pill">мин. ${minimum}</span></div><div class="panel-body"><div class="bid-list">${state.players.map((player) => `<div class="bid-player"><div><b>${escapeHtml(player.name)}</b><div class="player-meta">${player.walletBalance} жет.</div></div><button class="btn ${player.walletBalance >= minimum ? 'primary' : ''}" data-action="bid" data-player="${player.id}" data-amount="${minimum}" ${player.walletBalance < minimum ? 'disabled' : ''}>${minimum} жет.</button></div>`).join('')}</div></div></section></div></main>`;
  }

  function finalHtml(state: EventState): string {
    const stats = calculateStatistics(state);
    const cards: Array<[string, NominationResult | null, string]> = [
      ['ГЛАВНЫЙ ГЕРОЙ', stats.stageWinnerLeader, 'побед в этапах'],
      ['БОГАЧ ВЕЧЕРА', stats.richestEarned, 'заработано жетонов'],
      ['ШОПОГОЛИК', stats.biggestSpender, 'потрачено жетонов'],
      ['КОЛЛЕКЦИОНЕР', stats.collector, 'предметов'],
      ['ТИРАН', stats.aggressor, 'негативных эффектов'],
      ['ЖЕРТВА СИСТЕМЫ', stats.mostTargeted, 'раз был целью'],
    ];
    return `<main class="workspace"><div class="workspace-head"><div><h1 class="workspace-title">Итоги вечера</h1><p class="workspace-sub">${stats.completedStages} этапов · ${stats.itemActivations} активаций предметов · ${stats.eventCount} событий в хронике.</p></div></div><div class="grid final-grid">${cards.map(([title, result, unit]) => `<article class="card"><span class="rarity">${title}</span><h3>${escapeHtml(result?.playerName ?? '—')}</h3><p>${result ? `${result.value} · ${unit}` : 'Пока нет данных'}</p></article>`).join('')}</div></main>`;
  }


  function setupHtml(): string {
    return `<div class="setup-wrap"><section class="setup"><div class="setup-copy"><span class="setup-badge">PARTY CORE · 0.1</span><h1>Вечер,<br>который<br>помнит всё.</h1><p>Игры, жетоны, предметы, аукцион, сохранения и хроника связаны в одну систему. Начни с гостей, дальше приложение само держит состояние вечера.</p><div class="feature-list"><div class="feature">5 классических игр</div><div class="feature">Аукцион артефактов</div><div class="feature">Магазин и способности</div><div class="feature">3 ячейки сохранения</div></div></div><div class="setup-form"><div class="field"><label class="form-label">Название</label><input class="input" id="setup-title" value="День рождения"></div><div class="field"><label class="form-label">Гости · по одному имени на строку</label><textarea class="textarea" id="setup-players" placeholder="Саша&#10;Катя&#10;Володя&#10;Айгуль"></textarea></div><div class="field"><label class="form-label">Стартовые жетоны</label><input class="input" type="number" min="0" max="20" value="5" id="setup-tokens"></div><button class="btn primary" style="width:100%;margin-top:8px" data-action="create-event">Создать вечер</button></div></section></div>`;
  }

  function render(ctx: AppContext): void {
    if (!ctx.state) { ctx.root.innerHTML = setupHtml(); return; }
    let content = '';
    switch (ctx.view) {
      case 'shop': content = shopHtml(ctx.state); break;
      case 'program': content = programHtml(ctx.state); break;
      case 'saves': content = savesHtml(ctx, ctx.state); break;
      case 'auction': content = auctionHtml(ctx, ctx.state); break;
      case 'final': content = finalHtml(ctx.state); break;
      default: content = dashboardHtml(ctx.state); break;
    }
    ctx.root.innerHTML = `<div class="app-shell">${topbarHtml(ctx.state)}${content}${navHtml(ctx.view)}</div>`;
  }

  function initialProgram(): string[] {
    return ['alias', 'break', 'uno', 'durak', 'break', 'old-maid', 'solnyshko', 'auction'];
  }

  function initialShop(): string[] {
    return ['reveal_balance', 'reveal_balance', 'shield', 'shield', 'redirect', 'steal_tokens', 'double_reward', 'swap_result', 'big_lollipop', 'emerald_heart'];
  }

  function createFromSetup(ctx: AppContext): void {
    const title = (ctx.doc.getElementById('setup-title') as HTMLInputElement | null)?.value ?? 'День рождения';
    const playerText = (ctx.doc.getElementById('setup-players') as HTMLTextAreaElement | null)?.value ?? '';
    const tokens = Number((ctx.doc.getElementById('setup-tokens') as HTMLInputElement | null)?.value ?? 5);
    const names = playerText.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    if (names.length < 3) { showToast(ctx, 'Добавь минимум трёх игроков.', 'error'); return; }
    ctx.state = createEvent(title, { startTokens: Math.max(0, Math.min(20, Math.floor(tokens))), seed: Date.now() >>> 0, now: nowMs() });
    for (const name of names) ctx.state = execute(ctx.state, { type: 'ADD_PLAYER', name, now: nowMs() }).state;
    for (const templateId of initialShop()) ctx.state = execute(ctx.state, { type: 'REGISTER_ITEM', templateId, now: nowMs() }).state;
    for (const moduleId of initialProgram()) ctx.state = execute(ctx.state, { type: 'ADD_STAGE', moduleId, now: nowMs() }).state;
    ctx.activeSlot = 'slot-1';
    ctx.view = 'dashboard';
    autoSave(ctx);
    render(ctx);
  }

  function openFinishDialog(ctx: AppContext, stageId: string): void {
    if (!ctx.state) return;
    const stage = ctx.state.stages.find((candidate) => candidate.id === stageId);
    if (!stage) return;
    if (stage.type === 'BREAK') {
      runCommand(ctx, { type: 'FINISH_STAGE', stageId, result: { winnerIds: [], loserIds: [] } });
      return;
    }
    const modal = ctx.doc.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal"><span class="rarity">РЕЗУЛЬТАТ ЭТАПА</span><h2>${escapeHtml(stage.title)}</h2><p class="workspace-sub">Отметь победителей и проигравших. Для игр с одним победителем выбери одного.</p><h3>Победители</h3><div class="check-grid">${ctx.state.players.map((player) => `<label class="check"><input type="checkbox" name="winner" value="${player.id}">${escapeHtml(player.name)}</label>`).join('')}</div><h3>Проигравшие</h3><div class="check-grid">${ctx.state.players.map((player) => `<label class="check"><input type="checkbox" name="loser" value="${player.id}">${escapeHtml(player.name)}</label>`).join('')}</div><div class="button-row" style="margin-top:20px"><button class="btn primary" data-modal-action="confirm-result">Сохранить результат</button><button class="btn" data-modal-action="cancel">Отмена</button></div></div>`;
    ctx.doc.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
      const target = (event.target as Element).closest('[data-modal-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.modalAction;
      if (action === 'cancel') { modal.remove(); return; }
      const winners = Array.from(modal.querySelectorAll<HTMLInputElement>('input[name="winner"]:checked')).map((input) => input.value);
      const losers = Array.from(modal.querySelectorAll<HTMLInputElement>('input[name="loser"]:checked')).map((input) => input.value).filter((id) => !winners.includes(id));
      if (!winners.length && stage.moduleId !== 'durak' && stage.moduleId !== 'old-maid') {
        showToast(ctx, 'Выбери хотя бы одного победителя.', 'error'); return;
      }
      if (runCommand(ctx, { type: 'FINISH_STAGE', stageId, result: { winnerIds: winners, loserIds: losers } }, false)) {
        modal.remove(); render(ctx);
      }
    });
  }

  function handleClick(ctx: AppContext, event: Event): void {
    const target = (event.target as Element).closest('[data-action], [data-view]') as HTMLElement | null;
    if (!target) return;
    if (target.dataset.view) { ctx.view = target.dataset.view as ViewName; render(ctx); return; }
    const action = target.dataset.action;
    if (!action) return;
    if (action === 'create-event') { createFromSetup(ctx); return; }
    if (!ctx.state) return;
    switch (action) {
      case 'undo': runCommand(ctx, { type: 'UNDO_LAST_ACTION' }); break;
      case 'token-plus': runCommand(ctx, { type: 'AWARD_TOKENS', playerId: target.dataset.player, amount: 1, reason: 'Ручная корректировка' }); break;
      case 'token-minus': runCommand(ctx, { type: 'SPEND_TOKENS', playerId: target.dataset.player, amount: 1, reason: 'Ручная корректировка' }); break;
      case 'start-stage': runCommand(ctx, { type: 'START_STAGE', stageId: target.dataset.stage }); break;
      case 'pause-stage': runCommand(ctx, { type: 'PAUSE_STAGE', stageId: target.dataset.stage }); break;
      case 'resume-stage': runCommand(ctx, { type: 'RESUME_STAGE', stageId: target.dataset.stage }); break;
      case 'finish-stage': openFinishDialog(ctx, String(target.dataset.stage)); break;
      case 'advance-stage': runCommand(ctx, { type: 'ADVANCE_STAGE' }); break;
      case 'finish-event': {
        if (ctx.state.status !== 'RESULT') { showToast(ctx, 'Сначала заверши текущий этап.', 'error'); break; }
        if (runCommand(ctx, { type: 'SET_STATUS', status: 'FINISHED' }, false)) { ctx.view = 'final'; render(ctx); }
        break;
      }
      case 'buy-item': {
        const itemId = String(target.dataset.item);
        const select = ctx.doc.getElementById(`buyer-${itemId}`) as HTMLSelectElement | null;
        if (!select?.value) { showToast(ctx, 'Выбери покупателя.', 'error'); break; }
        if (runCommand(ctx, { type: 'BUY_ITEM', itemId, playerId: select.value }, false)) { showToast(ctx, 'Покупка проведена.'); render(ctx); }
        break;
      }
      case 'activate-item': {
        const itemId = String(target.dataset.item);
        const targetSelect = ctx.doc.getElementById(`target-${itemId}`) as HTMLSelectElement | null;
        const command: Command = { type: 'ACTIVATE_ITEM', itemId, playerId: target.dataset.player };
        if (targetSelect?.value) command.targetPlayerId = targetSelect.value;
        if (runCommand(ctx, command, false)) { showToast(ctx, 'Предмет активирован.'); render(ctx); }
        break;
      }
      case 'deactivate-item': runCommand(ctx, { type: 'DEACTIVATE_ITEM', itemId: target.dataset.item, playerId: target.dataset.player }); break;
      case 'add-stage': {
        const select = ctx.doc.getElementById('new-stage-module') as HTMLSelectElement | null;
        if (select?.value) runCommand(ctx, { type: 'ADD_STAGE', moduleId: select.value });
        break;
      }
      case 'select-stage': {
        const index = Number(target.dataset.index);
        const stage = Number.isInteger(index) ? ctx.state.stages[index] : null;
        if (stage) runCommand(ctx, { type: 'SELECT_STAGE', stageId: stage.id });
        break;
      }
      case 'save-slot': {
        const slot = target.dataset.slot as SaveSlot;
        try { ctx.storage.save(slot, ctx.state); ctx.activeSlot = slot; showToast(ctx, `Сохранено в ${slot}.`); render(ctx); }
        catch (error) { showToast(ctx, (error as Error).message, 'error'); }
        break;
      }
      case 'load-slot': {
        const slot = target.dataset.slot as SaveSlot;
        try { ctx.state = ctx.storage.load(slot); ctx.activeSlot = slot; ctx.view = 'dashboard'; showToast(ctx, `Загружено ${slot}.`); render(ctx); }
        catch (error) { showToast(ctx, (error as Error).message, 'error'); }
        break;
      }
      case 'export-slot': {
        const slot = target.dataset.slot as SaveSlot;
        try {
          const json = ctx.storage.export(slot);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = ctx.doc.createElement('a');
          a.href = url; a.download = `ivent-${slot}.json`; a.click(); URL.revokeObjectURL(url);
        } catch (error) { showToast(ctx, (error as Error).message, 'error'); }
        break;
      }
      case 'start-auction': {
        const auction = createAuction(['reveal_balance', 'shield', 'redirect', 'steal_tokens', 'big_lollipop', 'emerald_heart'], { startPrice: 2, bidStep: 1, lotSeconds: 30, revealEffectAfterPurchase: true });
        runCommand(ctx, { type: 'SET_AUCTION_STATE', auction, label: 'Аукцион начат' });
        break;
      }
      case 'reset-auction': runCommand(ctx, { type: 'CLEAR_AUCTION_STATE' }); break;
      case 'bid': {
        const auction = ctx.state.gameRuntime.auction;
        if (!auction) break;
        const balances = Object.fromEntries(ctx.state.players.map((player) => [player.id, player.walletBalance]));
        try {
          const nextAuction = placeAuctionBid(auction, String(target.dataset.player), Number(target.dataset.amount), balances);
          const bidder = ctx.state.players.find((player) => player.id === String(target.dataset.player));
          runCommand(ctx, { type: 'SET_AUCTION_STATE', auction: nextAuction, label: `${bidder?.name ?? 'Игрок'} делает ставку ${Number(target.dataset.amount)} жет.` });
        } catch (error) { showToast(ctx, (error as Error).message, 'error'); }
        break;
      }
      case 'close-lot': {
        const auction = ctx.state.gameRuntime.auction;
        if (!auction) break;
        try {
          const closed = closeAuctionLot(auction);
          if (closed.winnerId) {
            if (!runCommand(ctx, { type: 'CLAIM_AUCTION_ITEM', templateId: closed.itemTemplateId, playerId: closed.winnerId, amount: closed.amount }, false)) break;
            const player = ctx.state.players.find((p) => p.id === closed.winnerId);
            const item = createDefaultCatalog().find((entry) => entry.templateId === closed.itemTemplateId);
            showToast(ctx, `${player?.name ?? 'Игрок'} забирает «${item?.name ?? 'лот'}».`);
          } else showToast(ctx, 'Лот закрыт без ставок.');
          runCommand(ctx, { type: 'SET_AUCTION_STATE', auction: closed.auction, label: closed.winnerId ? `Лот продан за ${closed.amount} жет.` : 'Лот закрыт без ставок' });
        } catch (error) { showToast(ctx, (error as Error).message, 'error'); }
        break;
      }
    }
  }

  async function handleChange(ctx: AppContext, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.id !== 'import-file' || !input.files?.[0]) return;
    const slot = (ctx.doc.getElementById('import-slot') as HTMLSelectElement | null)?.value as SaveSlot;
    try {
      const text = await input.files[0].text();
      ctx.storage.import(slot, text);
      ctx.state = ctx.storage.load(slot);
      ctx.activeSlot = slot;
      ctx.view = 'dashboard';
      showToast(ctx, `Импортировано в ${slot}.`);
      render(ctx);
    } catch (error) { showToast(ctx, (error as Error).message, 'error'); }
  }

  export function mountHostApp(doc: Document, win: Window): void {
    const root = doc.getElementById('app');
    if (!root) throw new IventError('Корневой элемент приложения не найден.');
    const storage = createStorageAdapter(getStorage(win));
    const ctx: AppContext = { doc, win, root, storage, state: null, activeSlot: 'slot-1', view: 'dashboard', toastTimer: null };
    try {
      const slot = storage.list().find((entry) => !entry.empty)?.slot;
      if (slot) { ctx.state = storage.load(slot); ctx.activeSlot = slot; }
    } catch { ctx.state = null; }
    root.addEventListener('click', (event) => handleClick(ctx, event));
    root.addEventListener('change', (event) => { void handleChange(ctx, event); });
    win.setInterval(() => {
      if (ctx.state && ctx.view === 'dashboard') render(ctx);
    }, 1000);
    render(ctx);
  }
}
