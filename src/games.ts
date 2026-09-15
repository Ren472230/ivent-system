namespace Ivent {
  export interface GameModule {
    id: string;
    name: string;
    version: string;
    type: StageType;
    minPlayers: number;
    maxPlayers: number;
    estimatedMinutes: number;
    mode: string;
    rulesSummary: string;
    resultMode: string;
    defaultWinnerReward: number;
    itemsAllowed: boolean;
    aiCapabilities: string[];
    requiredProps: string[];
  }

  const GAME_REGISTRY: Record<string, GameModule> = {
    alias: {
      id: 'alias', name: 'Элиас', version: '1.0', type: 'GAME', minPlayers: 4, maxPlayers: 30,
      estimatedMinutes: 25, mode: 'teams', resultMode: 'winners', defaultWinnerReward: 3, itemsAllowed: true,
      rulesSummary: 'Объясняйте слова без однокоренных слов. Система ведёт этап, результаты и награды.',
      aiCapabilities: [], requiredProps: ['карточки или список слов'],
    },
    uno: {
      id: 'uno', name: 'Уно', version: '1.0', type: 'GAME', minPlayers: 2, maxPlayers: 10,
      estimatedMinutes: 20, mode: 'individual', resultMode: 'single-winner', defaultWinnerReward: 4, itemsAllowed: true,
      rulesSummary: 'Классическое Уно. Первый избавившийся от карт получает основную награду.',
      aiCapabilities: [], requiredProps: ['колода Уно'],
    },
    durak: {
      id: 'durak', name: 'Дурак', version: '1.0', type: 'GAME', minPlayers: 2, maxPlayers: 6,
      estimatedMinutes: 25, mode: 'individual', resultMode: 'winners-and-loser', defaultWinnerReward: 3, itemsAllowed: true,
      rulesSummary: 'Карточный Дурак. Ведущий фиксирует победителей и последнего оставшегося игрока.',
      aiCapabilities: [], requiredProps: ['колода карт'],
    },
    'old-maid': {
      id: 'old-maid', name: 'Пиковая дама', version: '1.0', type: 'GAME', minPlayers: 3, maxPlayers: 10,
      estimatedMinutes: 15, mode: 'individual', resultMode: 'single-loser', defaultWinnerReward: 2, itemsAllowed: true,
      rulesSummary: 'Игрок, оставшийся с Пиковой дамой, проигрывает; остальные считаются победителями.',
      aiCapabilities: [], requiredProps: ['колода карт'],
    },
    solnyshko: {
      id: 'solnyshko', name: 'Солнышко', version: '1.0', type: 'GAME', minPlayers: 3, maxPlayers: 20,
      estimatedMinutes: 15, mode: 'individual', resultMode: 'single-winner', defaultWinnerReward: 4, itemsAllowed: true,
      rulesSummary: 'Быстрая компанейская игра с одним победителем.',
      aiCapabilities: [], requiredProps: [],
    },
    break: {
      id: 'break', name: 'Перерыв', version: '1.0', type: 'BREAK', minPlayers: 0, maxPlayers: 30,
      estimatedMinutes: 15, mode: 'system', resultMode: 'none', defaultWinnerReward: 0, itemsAllowed: false,
      rulesSummary: 'Пауза между игровыми этапами.',
      aiCapabilities: [], requiredProps: [],
    },
  };

  export function registerGameModule(module: GameModule): void {
    if (!module.id || !module.name) throw new IventError('Игровой модуль должен иметь id и название.');
    GAME_REGISTRY[module.id] = JSON.parse(JSON.stringify(module)) as GameModule;
  }

  export function getGameRegistry(): Record<string, GameModule> {
    return JSON.parse(JSON.stringify(GAME_REGISTRY)) as Record<string, GameModule>;
  }

  function getModule(moduleId: string): GameModule {
    const module = GAME_REGISTRY[moduleId];
    if (!module) throw new IventError(`Игровой модуль «${moduleId}» не найден.`);
    return module;
  }

  export function createStage(moduleId: string, overrides: Partial<Stage> = {}): Stage {
    const module = getModule(moduleId);
    const base: Stage = {
      id: `draft-${moduleId}`,
      moduleId,
      title: module.name,
      type: module.type,
      status: 'PENDING',
      plannedDurationSeconds: module.estimatedMinutes * 60,
      elapsedSeconds: 0,
      participants: [],
      teams: [],
      rewards: { winner: module.defaultWinnerReward },
      penalties: {},
      itemsAllowed: module.itemsAllowed,
      aiEnabled: false,
      result: null,
      startedAt: null,
      resumedAt: null,
      finishedAt: null,
    };
    return { ...base, ...JSON.parse(JSON.stringify(overrides)) as Partial<Stage> };
  }

  function stageById(state: EventState, stageId: string): { stage: Stage; index: number } {
    const index = state.stages.findIndex((candidate) => candidate.id === stageId);
    if (index < 0) throw new IventError('Этап не найден.');
    return { stage: state.stages[index], index };
  }

  function elapsedDeltaSeconds(from: number | null, to: number): number {
    if (from === null || to <= from) return 0;
    return Math.floor((to - from) / 1000);
  }

  function normalizeResult(state: EventState, raw: unknown): StageResult {
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const winnerIds = Array.isArray(record.winnerIds) ? record.winnerIds.map(String) : [];
    const loserIds = Array.isArray(record.loserIds) ? record.loserIds.map(String) : [];
    for (const id of [...winnerIds, ...loserIds]) internalFindPlayer(state, id);
    return {
      winnerIds,
      loserIds,
      ...(typeof record.notes === 'string' ? { notes: record.notes } : {}),
    };
  }

  export function executeStageCommand(state: EventState, command: Command, now: number, events: EventLogEntry[]): boolean {
    switch (command.type) {
      case 'ADD_STAGE': {
        const moduleId = String(command.moduleId ?? '');
        const stage = createStage(moduleId, {
          ...(typeof command.title === 'string' && command.title.trim() ? { title: command.title.trim() } : {}),
          ...(typeof command.plannedDurationSeconds === 'number' && command.plannedDurationSeconds > 0
            ? { plannedDurationSeconds: Math.round(command.plannedDurationSeconds) } : {}),
        });
        stage.id = internalAllocateId(state, 'stage');
        state.stages.push(stage);
        if (state.currentStageIndex < 0) state.currentStageIndex = 0;
        events.push(internalAppendEvent(state, 'STAGE_ADDED', `Добавлен этап «${stage.title}»`, { stageId: stage.id, moduleId }, now));
        return true;
      }
      case 'SELECT_STAGE': {
        const stageId = String(command.stageId ?? '');
        const { stage, index } = stageById(state, stageId);
        if (stage.status !== 'PENDING') throw new IventError('Текущим можно выбрать только ожидающий этап.');
        state.currentStageIndex = index;
        events.push(internalAppendEvent(state, 'STAGE_SELECTED', `Выбран этап «${stage.title}»`, { stageId, index }, now));
        return true;
      }
      case 'START_STAGE': {
        if (state.status === 'FINISHED') throw new IventError('Завершённое мероприятие нельзя продолжить.');
        const stageId = String(command.stageId ?? '');
        const { stage, index } = stageById(state, stageId);
        if (stage.status !== 'PENDING') throw new IventError('Этап можно запустить только из состояния ожидания.');
        stage.status = 'ACTIVE';
        stage.startedAt = now;
        stage.resumedAt = now;
        state.currentStageIndex = index;
        state.status = stage.type === 'BREAK' ? 'BREAK' : 'PLAYING';
        events.push(internalAppendEvent(state, 'STAGE_STARTED', `Старт этапа «${stage.title}»`, { stageId }, now));
        return true;
      }
      case 'PAUSE_STAGE': {
        const stageId = String(command.stageId ?? '');
        const { stage } = stageById(state, stageId);
        if (stage.status !== 'ACTIVE') throw new IventError('Этап сейчас нельзя поставить на паузу.');
        stage.elapsedSeconds += elapsedDeltaSeconds(stage.resumedAt, now);
        stage.status = 'PAUSED';
        stage.resumedAt = null;
        events.push(internalAppendEvent(state, 'STAGE_PAUSED', `Пауза этапа «${stage.title}»`, { stageId }, now));
        return true;
      }
      case 'RESUME_STAGE': {
        const stageId = String(command.stageId ?? '');
        const { stage } = stageById(state, stageId);
        if (stage.status !== 'PAUSED') throw new IventError('Продолжить можно только приостановленный этап.');
        stage.status = 'ACTIVE';
        stage.resumedAt = now;
        state.status = stage.type === 'BREAK' ? 'BREAK' : 'PLAYING';
        events.push(internalAppendEvent(state, 'STAGE_RESUMED', `Этап «${stage.title}» продолжен`, { stageId }, now));
        return true;
      }
      case 'FINISH_STAGE': {
        const stageId = String(command.stageId ?? '');
        const { stage } = stageById(state, stageId);
        if (!['ACTIVE', 'PAUSED'].includes(stage.status)) throw new IventError('Этап сейчас нельзя завершить.');
        if (stage.status === 'ACTIVE') stage.elapsedSeconds += elapsedDeltaSeconds(stage.resumedAt, now);
        stage.status = 'FINISHED';
        stage.resumedAt = null;
        stage.finishedAt = now;
        const result = normalizeResult(state, command.result);
        stage.result = result;
        const reward = stage.rewards.winner ?? 0;
        if (stage.type === 'GAME') {
          for (const playerId of result.winnerIds) {
            const player = internalFindPlayer(state, playerId);
            player.wins += 1;
            const boosters = state.inventory.filter((item) => item.ownerId === playerId && item.active && item.effectType === 'double_reward');
            let multiplier = 1;
            for (const booster of boosters) {
              const raw = Number(booster.effectPayload.multiplier ?? 2);
              multiplier *= Number.isFinite(raw) && raw > 1 ? raw : 2;
              booster.active = false;
              const activeIndex = player.activeItemIds.indexOf(booster.id);
              if (activeIndex >= 0) player.activeItemIds.splice(activeIndex, 1);
              events.push(internalAppendEvent(state, 'ITEM_EFFECT_APPLIED', `«${booster.name}» удваивает награду игрока ${player.name}`, { itemId: booster.id, playerId, effectType: booster.effectType }, now));
            }
            const finalReward = reward * multiplier;
            if (finalReward > 0) {
              player.walletBalance += finalReward;
              player.totalEarned += finalReward;
              events.push(internalAppendEvent(state, 'TOKENS_AWARDED', `${player.name} получает ${finalReward} жет. за этап`, { playerId, amount: finalReward, reason: stageId }, now));
            }
          }
          for (const playerId of result.loserIds) internalFindPlayer(state, playerId).losses += 1;
        }
        state.statistics.completedStages += 1;
        state.status = 'RESULT';
        events.push(internalAppendEvent(state, 'STAGE_FINISHED', `Этап «${stage.title}» завершён`, { stageId, result }, now));
        return true;
      }
      case 'ADVANCE_STAGE': {
        if (state.stages.length === 0) throw new IventError('В программе нет этапов.');
        const next = state.currentStageIndex < 0 ? 0 : state.currentStageIndex + 1;
        if (next >= state.stages.length) throw new IventError('Это последний этап программы.');
        state.currentStageIndex = next;
        const stage = state.stages[next];
        events.push(internalAppendEvent(state, 'STAGE_ADVANCED', `Следующий этап: «${stage.title}»`, { stageId: stage.id, index: next }, now));
        return true;
      }
      default:
        return false;
    }
  }

  registerCommandHandler(executeStageCommand);
}
