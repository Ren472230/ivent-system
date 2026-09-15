namespace Ivent {
  export type ExtensionCommandHandler = (state: EventState, command: Command, now: number, createdEvents: EventLogEntry[]) => boolean;
  const extensionCommandHandlers: ExtensionCommandHandler[] = [];

  export function registerCommandHandler(handler: ExtensionCommandHandler): void {
    extensionCommandHandlers.push(handler);
  }
  export interface Command {
    type: string;
    [key: string]: unknown;
  }

  export interface ExecuteResult {
    state: EventState;
    events: EventLogEntry[];
  }

  export class IventError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'IventError';
    }
  }

  const PLAYER_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#c084fc'];

  function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function snapshotState(state: EventState): EventStateSnapshot {
    return deepClone({
      status: state.status,
      players: state.players,
      stages: state.stages,
      currentStageIndex: state.currentStageIndex,
      inventory: state.inventory,
      statistics: state.statistics,
      gameRuntime: state.gameRuntime,
    });
  }

  function restoreSnapshot(state: EventState, snapshot: EventStateSnapshot): void {
    state.status = snapshot.status;
    state.players = deepClone(snapshot.players);
    state.stages = deepClone(snapshot.stages);
    state.currentStageIndex = snapshot.currentStageIndex;
    state.inventory = deepClone(snapshot.inventory);
    state.statistics = deepClone(snapshot.statistics);
    state.gameRuntime = deepClone(snapshot.gameRuntime);
  }

  export function internalAllocateId(state: EventState, prefix: string): string {
    state.sequence += 1;
    return `${prefix}-${state.sequence.toString(36)}`;
  }

  function commandNow(state: EventState, command: Command): number {
    const raw = command.now;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : state.updatedAt + 1;
  }

  function requireString(command: Command, key: string, label = key): string {
    const value = command[key];
    if (typeof value !== 'string') throw new IventError(`Поле «${label}» должно быть строкой.`);
    return value;
  }

  function requirePositiveAmount(command: Command): number {
    const value = command.amount;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new IventError('Количество жетонов должно быть положительным числом.');
    }
    if (!Number.isInteger(value)) throw new IventError('Количество жетонов должно быть целым числом.');
    return value;
  }

  export function internalFindPlayer(state: EventState, playerId: string): Player {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new IventError('Игрок не найден.');
    return player;
  }

  export function internalAppendEvent(
    state: EventState,
    type: string,
    message: string,
    payload: Record<string, unknown>,
    now: number,
  ): EventLogEntry {
    const event: EventLogEntry = {
      id: internalAllocateId(state, 'log'),
      type,
      timestamp: now,
      message,
      payload,
    };
    state.eventLog.push(event);
    return event;
  }

  function pushUndo(state: EventState, before: EventStateSnapshot, commandType: string, label: string): void {
    state.undoStack.push({ commandType, snapshot: before, label });
    if (state.undoStack.length > 100) state.undoStack.shift();
  }

  function validateStatusTransition(from: EventStatus, to: EventStatus): void {
    const allowed: Record<EventStatus, EventStatus[]> = {
      PREPARATION: ['LOBBY'],
      LOBBY: ['PLAYING'],
      PLAYING: ['RESULT', 'BREAK'],
      BREAK: ['PLAYING'],
      RESULT: ['PLAYING', 'FINISHED'],
      FINISHED: [],
    };
    if (!allowed[from].includes(to)) {
      throw new IventError(`Недопустимый переход состояния: ${from} → ${to}.`);
    }
  }

  function executeBaseCommand(state: EventState, command: Command, now: number, createdEvents: EventLogEntry[]): boolean {
    switch (command.type) {
      case 'ADD_PLAYER': {
        const name = requireString(command, 'name', 'имя').trim();
        if (!name) throw new IventError('Имя игрока обязательно.');
        const id = internalAllocateId(state, 'player');
        const player: Player = {
          id,
          name,
          avatar: '',
          displayColor: PLAYER_COLORS[state.players.length % PLAYER_COLORS.length],
          teamId: null,
          walletBalance: state.configuration.startTokens,
          totalEarned: 0,
          totalSpent: 0,
          wins: 0,
          losses: 0,
          inventoryItemIds: [],
          activeItemIds: [],
          achievements: [],
          visibilityLevel: 1,
          customFacts: [],
          negativeEffectsUsed: 0,
          timesTargeted: 0,
        };
        state.players.push(player);
        createdEvents.push(internalAppendEvent(state, 'PLAYER_ADDED', `${name} присоединяется к игре`, { playerId: id }, now));
        return true;
      }
      case 'UPDATE_PLAYER': {
        const playerId = requireString(command, 'playerId');
        const player = internalFindPlayer(state, playerId);
        const patch = command.patch;
        if (!patch || typeof patch !== 'object') throw new IventError('Изменения игрока не заданы.');
        const allowed = patch as Record<string, unknown>;
        if (typeof allowed.name === 'string') {
          const name = allowed.name.trim();
          if (!name) throw new IventError('Имя игрока обязательно.');
          player.name = name;
        }
        if (typeof allowed.avatar === 'string') player.avatar = allowed.avatar;
        if (typeof allowed.displayColor === 'string') player.displayColor = allowed.displayColor;
        if (typeof allowed.visibilityLevel === 'number') player.visibilityLevel = Math.max(0, Math.min(3, Math.trunc(allowed.visibilityLevel)));
        createdEvents.push(internalAppendEvent(state, 'PLAYER_UPDATED', `Данные игрока ${player.name} обновлены`, { playerId }, now));
        return true;
      }
      case 'SET_STATUS': {
        const status = requireString(command, 'status') as EventStatus;
        const valid: EventStatus[] = ['PREPARATION', 'LOBBY', 'PLAYING', 'BREAK', 'RESULT', 'FINISHED'];
        if (!valid.includes(status)) throw new IventError('Неизвестное состояние мероприятия.');
        validateStatusTransition(state.status, status);
        const previous = state.status;
        state.status = status;
        createdEvents.push(internalAppendEvent(state, 'STATUS_CHANGED', `Состояние: ${previous} → ${status}`, { previous, status }, now));
        return true;
      }
      case 'AWARD_TOKENS': {
        const playerId = requireString(command, 'playerId');
        const amount = requirePositiveAmount(command);
        const player = internalFindPlayer(state, playerId);
        player.walletBalance += amount;
        player.totalEarned += amount;
        createdEvents.push(internalAppendEvent(state, 'TOKENS_AWARDED', `${player.name} получает ${amount} жет.`, {
          playerId, amount, reason: typeof command.reason === 'string' ? command.reason : '',
        }, now));
        return true;
      }
      case 'SPEND_TOKENS': {
        const playerId = requireString(command, 'playerId');
        const amount = requirePositiveAmount(command);
        const player = internalFindPlayer(state, playerId);
        if (player.walletBalance < amount) throw new IventError(`У игрока ${player.name} недостаточно жетонов.`);
        player.walletBalance -= amount;
        player.totalSpent += amount;
        createdEvents.push(internalAppendEvent(state, 'TOKENS_SPENT', `${player.name} тратит ${amount} жет.`, {
          playerId, amount, reason: typeof command.reason === 'string' ? command.reason : '',
        }, now));
        return true;
      }
      case 'TRANSFER_TOKENS': {
        const fromPlayerId = requireString(command, 'fromPlayerId');
        const toPlayerId = requireString(command, 'toPlayerId');
        if (fromPlayerId === toPlayerId) throw new IventError('Нельзя передать жетоны самому себе.');
        const amount = requirePositiveAmount(command);
        const from = internalFindPlayer(state, fromPlayerId);
        const to = internalFindPlayer(state, toPlayerId);
        if (from.walletBalance < amount) throw new IventError(`У игрока ${from.name} недостаточно жетонов.`);
        from.walletBalance -= amount;
        from.totalSpent += amount;
        to.walletBalance += amount;
        to.totalEarned += amount;
        createdEvents.push(internalAppendEvent(state, 'TOKENS_TRANSFERRED', `${from.name} передаёт ${amount} жет. игроку ${to.name}`, {
          fromPlayerId, toPlayerId, amount, reason: typeof command.reason === 'string' ? command.reason : '',
        }, now));
        return true;
      }
      default:
        return false;
    }
  }

  export function execute(input: EventState, command: Command): ExecuteResult {
    if (!command || typeof command.type !== 'string') throw new IventError('Команда не распознана.');
    const now = commandNow(input, command);

    if (command.type === 'UNDO_LAST_ACTION') {
      if (input.undoStack.length === 0) throw new IventError('Нет действий, которые можно отменить.');
      const state = deepClone(input);
      const undo = state.undoStack.pop() as UndoEntry;
      restoreSnapshot(state, undo.snapshot);
      state.updatedAt = now;
      const event = internalAppendEvent(state, 'ACTION_UNDONE', `Отменено: ${undo.label}`, { commandType: undo.commandType }, now);
      return { state, events: [event] };
    }

    const state = deepClone(input);
    const before = snapshotState(input);
    const createdEvents: EventLogEntry[] = [];
    let handled = executeBaseCommand(state, command, now, createdEvents);
    if (!handled) {
      for (const handler of extensionCommandHandlers) {
        if (handler(state, command, now, createdEvents)) {
          handled = true;
          break;
        }
      }
    }

    if (!handled) throw new IventError(`Команда ${command.type} пока не поддерживается.`);

    state.updatedAt = now;
    pushUndo(state, before, command.type, createdEvents[0]?.message ?? command.type);
    return { state, events: createdEvents };
  }
}
