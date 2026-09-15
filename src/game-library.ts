// @ts-nocheck
namespace Ivent {
  const LIBRARY_KEY = 'ivent:v2:game-library';
  let guardsInstalled = false;
  let storageBundleInstalled = false;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function now() { return Date.now(); }
  function slug(value) {
    const s = String(value || 'game').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
    return s || 'game';
  }
  function colorPair(id) {
    let hash = 2166136261;
    for (const ch of String(id)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
    const hue = hash % 360;
    const hue2 = (hue + 48 + (hash % 80)) % 360;
    return [`hsl(${hue} 64% 34%)`, `hsl(${hue2} 72% 18%)`];
  }
  function iconFor(name, id) {
    const t = `${name} ${id}`.toLowerCase();
    if (t.includes('uno')) return '🃏';
    if (t.includes('дурак') || t.includes('пиков')) return '♠';
    if (t.includes('солныш')) return '☀';
    if (t.includes('аукцион')) return '⚖';
    if (t.includes('элиас') || t.includes('alias')) return '💬';
    if (t.includes('перерыв')) return '☕';
    return '✦';
  }
  function escapeXml(value) {
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }
  function defaultGameCover(manifest) {
    const [a,b] = colorPair(manifest.gameId || manifest.moduleId);
    const icon = iconFor(manifest.name, manifest.moduleId);
    const label = escapeXml(String(manifest.name || 'Игра').slice(0, 32));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="r"><stop stop-color="white" stop-opacity=".18"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><rect width="800" height="450" fill="url(#g)"/><circle cx="660" cy="80" r="210" fill="url(#r)"/><circle cx="100" cy="410" r="230" fill="url(#r)"/><text x="58" y="225" font-size="112" font-family="Arial, sans-serif">${icon}</text><text x="58" y="332" fill="white" font-size="48" font-weight="700" font-family="Arial, sans-serif">${label}</text><text x="60" y="382" fill="white" opacity=".68" font-size="18" letter-spacing="5" font-family="Arial, sans-serif">IVENT GAME</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function manifestFromModule(module) {
    const createdAt = 0;
    const manifest = {
      moduleId: module.id, gameId: module.id, revision: 1, name: module.name,
      summary: module.rulesSummary || '', rules: module.rulesSummary || '', goal: '',
      minPlayers: module.minPlayers, maxPlayers: module.maxPlayers, estimatedMinutes: module.estimatedMinutes,
      mode: module.mode, resultMode: module.resultMode, defaultWinnerReward: module.defaultWinnerReward,
      itemsPolicy: module.itemsAllowed ? 'allowed' : 'forbidden',
      aiCapabilities: clone(module.aiCapabilities || []), requiredProps: clone(module.requiredProps || []),
      hostNotes: '', tags: [], cover: '', source: 'system', active: true,
      createdAt, updatedAt: createdAt, supersedesModuleId: null, historical: false,
    };
    manifest.cover = defaultGameCover(manifest);
    return manifest;
  }

  function createGameLibrary() {
    const registry = Ivent.getGameRegistry();
    const manifests = {};
    for (const module of Object.values(registry)) manifests[module.id] = manifestFromModule(module);
    return { version: 2, manifests };
  }

  function normalizeManifest(raw) {
    const m = clone(raw);
    m.revision = Math.max(1, Number(m.revision) || 1);
    m.summary = String(m.summary || m.rules || '');
    m.rules = String(m.rules || m.summary || '');
    m.goal = String(m.goal || '');
    m.hostNotes = String(m.hostNotes || '');
    m.tags = Array.isArray(m.tags) ? m.tags.map(String) : [];
    m.aiCapabilities = Array.isArray(m.aiCapabilities) ? m.aiCapabilities.map(String) : [];
    m.requiredProps = Array.isArray(m.requiredProps) ? m.requiredProps.map(String) : [];
    m.itemsPolicy = ['allowed','before-after','forbidden'].includes(m.itemsPolicy) ? m.itemsPolicy : 'allowed';
    m.active = m.active !== false;
    m.source = m.source === 'custom' ? 'custom' : 'system';
    m.historical = Boolean(m.historical);
    if (!m.cover) m.cover = defaultGameCover(m);
    return m;
  }

  function reconcileSystemManifests(library) {
    const next = clone(library);
    next.version = 2;
    next.manifests = next.manifests || {};
    const registry = Ivent.getGameRegistry();
    for (const module of Object.values(registry)) if (!next.manifests[module.id]) next.manifests[module.id] = manifestFromModule(module);
    for (const [id, manifest] of Object.entries(next.manifests)) next.manifests[id] = normalizeManifest(manifest);
    return next;
  }

  function loadGameLibrary(storage = globalThis.localStorage) {
    try {
      const raw = storage?.getItem?.(LIBRARY_KEY);
      if (!raw) return createGameLibrary();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.manifests) return createGameLibrary();
      return reconcileSystemManifests(parsed);
    } catch { return createGameLibrary(); }
  }

  function saveGameLibrary(library, storage = globalThis.localStorage) {
    const normalized = reconcileSystemManifests(library);
    storage?.setItem?.(LIBRARY_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function findManifest(library, moduleId) {
    const manifest = library.manifests[moduleId];
    if (!manifest) throw new Ivent.IventError(`Игра «${moduleId}» не найдена в библиотеке.`);
    return manifest;
  }

  function setGameActive(library, moduleId, active) {
    const next = clone(library);
    const manifest = findManifest(next, moduleId);
    manifest.active = Boolean(active);
    manifest.updatedAt = now();
    return next;
  }

  function uniqueModuleId(name, revision, stamp) { return `custom-${slug(name)}-r${revision}-${Number(stamp).toString(36)}`; }

  function duplicateGameManifest(library, moduleId, stamp = now()) {
    const base = findManifest(library, moduleId);
    const next = clone(library);
    const gameId = `game-${slug(base.name)}-${Number(stamp).toString(36)}`;
    const newId = uniqueModuleId(base.name, 1, stamp);
    const manifest = normalizeManifest({
      ...clone(base), moduleId: newId, gameId, revision: 1, source: 'custom', active: true,
      createdAt: stamp, updatedAt: stamp, supersedesModuleId: null, historical: false,
      name: `${base.name} – копия`,
    });
    manifest.cover = base.cover || defaultGameCover(manifest);
    next.manifests[newId] = manifest;
    return { library: next, manifest: clone(manifest) };
  }

  function reviseGameManifest(library, moduleId, patch, stamp = now()) {
    const previous = findManifest(library, moduleId);
    if (previous.source !== 'custom') throw new Ivent.IventError('Системную игру сначала нужно дублировать.');
    const next = clone(library);
    next.manifests[moduleId].active = false;
    next.manifests[moduleId].historical = true;
    next.manifests[moduleId].updatedAt = stamp;
    const revision = previous.revision + 1;
    const name = String(patch?.name || previous.name).trim() || previous.name;
    const newId = uniqueModuleId(name, revision, stamp);
    const manifest = normalizeManifest({
      ...clone(previous), ...clone(patch || {}), moduleId: newId, gameId: previous.gameId,
      revision, source: 'custom', active: true, createdAt: previous.createdAt, updatedAt: stamp,
      supersedesModuleId: moduleId, historical: false,
    });
    if (!patch?.cover) manifest.cover = previous.cover || defaultGameCover(manifest);
    next.manifests[newId] = manifest;
    return { library: next, manifest: clone(manifest) };
  }

  function createCustomGameManifest(input, stamp = now()) {
    const name = String(input?.name || '').trim();
    if (!name) throw new Ivent.IventError('Укажи название игры.');
    const rules = String(input?.rules || input?.summary || '').trim();
    if (!rules) throw new Ivent.IventError('Добавь правила или краткое описание игры.');
    const minutes = Math.max(1, Math.min(240, Math.round(Number(input?.estimatedMinutes) || 10)));
    const minPlayers = Math.max(1, Math.round(Number(input?.minPlayers) || 2));
    const maxPlayers = Math.max(minPlayers, Math.min(100, Math.round(Number(input?.maxPlayers) || 30)));
    const reward = Math.max(0, Math.min(999, Math.round(Number(input?.defaultWinnerReward) || 0)));
    const gameId = `game-${slug(name)}-${Number(stamp).toString(36)}`;
    const moduleId = uniqueModuleId(name, 1, stamp);
    const manifest = normalizeManifest({
      moduleId, gameId, revision: 1, name, summary: String(input?.summary || rules).trim(), rules,
      goal: String(input?.goal || '').trim(), minPlayers, maxPlayers, estimatedMinutes: minutes,
      mode: String(input?.mode || 'individual'), resultMode: String(input?.resultMode || 'single-winner'),
      defaultWinnerReward: reward, itemsPolicy: input?.itemsPolicy || 'allowed',
      aiCapabilities: input?.aiCapabilities || [], requiredProps: input?.requiredProps || [],
      hostNotes: String(input?.hostNotes || ''), tags: input?.tags || [], cover: String(input?.cover || ''),
      source: 'custom', active: true, createdAt: stamp, updatedAt: stamp,
      supersedesModuleId: null, historical: false,
    });
    if (!manifest.cover) manifest.cover = defaultGameCover(manifest);
    return manifest;
  }

  function upsertGameManifest(library, manifest) {
    const next = clone(library);
    const normalized = normalizeManifest(manifest);
    next.manifests[normalized.moduleId] = normalized;
    return next;
  }

  function moduleFromManifest(manifest) {
    return {
      id: manifest.moduleId, name: manifest.name, version: `1.${manifest.revision - 1}`, type: 'GAME',
      minPlayers: manifest.minPlayers, maxPlayers: manifest.maxPlayers, estimatedMinutes: manifest.estimatedMinutes,
      mode: manifest.mode, rulesSummary: manifest.summary || manifest.rules, resultMode: manifest.resultMode,
      defaultWinnerReward: manifest.defaultWinnerReward, itemsAllowed: manifest.itemsPolicy !== 'forbidden',
      aiCapabilities: clone(manifest.aiCapabilities), requiredProps: clone(manifest.requiredProps),
    };
  }

  function registerLibraryModules(library) {
    for (const manifest of Object.values(library.manifests)) if (manifest.source === 'custom') Ivent.registerGameModule(moduleFromManifest(manifest));
  }

  function installGameLibraryGuards() {
    if (guardsInstalled) return;
    const original = Ivent.execute;
    Ivent.execute = function(state, command) {
      if (command?.type === 'ADD_STAGE') {
        const library = loadGameLibrary();
        const manifest = library.manifests[String(command.moduleId || '')];
        if (manifest && !manifest.active) return { state, events: [] };
      }
      return original(state, command);
    };
    guardsInstalled = true;
  }

  function installLibraryStorageBundle() {
    if (storageBundleInstalled || typeof Ivent.createStorageAdapter !== 'function') return;
    const originalFactory = Ivent.createStorageAdapter;
    Ivent.createStorageAdapter = function(storage) {
      const base = originalFactory(storage);
      return {
        ...base,
        export(slot) {
          const state = JSON.parse(base.export(slot));
          return JSON.stringify({ iventBundleVersion: 2, state, gameLibrary: loadGameLibrary(storage) }, null, 2);
        },
        import(slot, json) {
          let parsed;
          try { parsed = JSON.parse(json); } catch { return base.import(slot, json); }
          if (parsed && parsed.iventBundleVersion === 2 && parsed.state && parsed.gameLibrary) {
            saveGameLibrary(parsed.gameLibrary, storage);
            registerLibraryModules(loadGameLibrary(storage));
            return base.import(slot, JSON.stringify(parsed.state));
          }
          return base.import(slot, json);
        },
      };
    };
    storageBundleInstalled = true;
  }

  async function readAndResizeGameCover(file, doc = globalThis.document) {
    if (!file) throw new Ivent.IventError('Выбери изображение.');
    if (typeof FileReader === 'undefined' || !doc) throw new Ivent.IventError('Обработка изображений доступна только в браузере.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Ivent.IventError('Не удалось прочитать изображение.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Ivent.IventError('Файл не похож на поддерживаемое изображение.'));
      img.onload = () => resolve(img);
      img.src = dataUrl;
    });
    const canvas = doc.createElement('canvas');
    canvas.width = 800; canvas.height = 450;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Ivent.IventError('Браузер не поддерживает обработку изображения.');
    const ratio = 16 / 9; const srcRatio = image.width / image.height;
    let sx = 0, sy = 0, sw = image.width, sh = image.height;
    if (srcRatio > ratio) { sw = image.height * ratio; sx = (image.width - sw) / 2; }
    else { sh = image.width / ratio; sy = (image.height - sh) / 2; }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, 800, 450);
    return canvas.toDataURL('image/jpeg', 0.78);
  }

  Ivent.createGameLibrary = createGameLibrary;
  Ivent.loadGameLibrary = loadGameLibrary;
  Ivent.saveGameLibrary = saveGameLibrary;
  Ivent.setGameActive = setGameActive;
  Ivent.duplicateGameManifest = duplicateGameManifest;
  Ivent.reviseGameManifest = reviseGameManifest;
  Ivent.createCustomGameManifest = createCustomGameManifest;
  Ivent.upsertGameManifest = upsertGameManifest;
  Ivent.registerLibraryModules = registerLibraryModules;
  Ivent.installGameLibraryGuards = installGameLibraryGuards;
  Ivent.installLibraryStorageBundle = installLibraryStorageBundle;
  Ivent.defaultGameCover = defaultGameCover;
  Ivent.readAndResizeGameCover = readAndResizeGameCover;
  Ivent.getGameLibraryStorageKey = () => LIBRARY_KEY;
}
