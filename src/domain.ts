namespace Ivent {
  export type EventStatus = 'PREPARATION' | 'LOBBY' | 'PLAYING' | 'BREAK' | 'RESULT' | 'FINISHED';
  export type StageStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'FINISHED';
  export type StageType = 'GAME' | 'BREAK' | 'CEREMONY' | 'CUSTOM';
  export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  export type ActivationWindow = 'BEFORE_STAGE' | 'DURING_STAGE' | 'BEFORE_RESULT' | 'AFTER_RESULT' | 'ANYTIME' | 'MANUAL_ONLY';
  export type TargetRule = 'SELF' | 'ONE_PLAYER' | 'ANY_PLAYER' | 'TWO_PLAYERS' | 'TEAM' | 'ALL' | 'STAGE';

  export interface EventConfig {
    startTokens: number;
    maxActiveItems: number;
    autoSave: boolean;
    seed: number;
  }

  export interface Player {
    id: string;
    name: string;
    avatar: string;
    displayColor: string;
    teamId: string | null;
    walletBalance: number;
    totalEarned: number;
    totalSpent: number;
    wins: number;
    losses: number;
    inventoryItemIds: string[];
    activeItemIds: string[];
    achievements: string[];
    visibilityLevel: number;
    customFacts: string[];
    negativeEffectsUsed: number;
    timesTargeted: number;
  }

  export interface StageResult {
    winnerIds: string[];
    loserIds: string[];
    notes?: string;
  }

  export interface Stage {
    id: string;
    moduleId: string;
    title: string;
    type: StageType;
    status: StageStatus;
    plannedDurationSeconds: number;
    elapsedSeconds: number;
    participants: string[];
    teams: string[];
    rewards: Record<string, number>;
    penalties: Record<string, number>;
    itemsAllowed: boolean;
    aiEnabled: boolean;
    result: StageResult | null;
    startedAt: number | null;
    resumedAt: number | null;
    finishedAt: number | null;
  }

  export interface ItemTemplate {
    templateId: string;
    name: string;
    rarity: Rarity;
    price: number;
    description: string;
    effectType: string;
    effectPayload: Record<string, unknown>;
    activationWindow: ActivationWindow;
    targetRule: TargetRule;
    uses: number;
    durationRule: string;
    transferable: boolean;
    sellable: boolean;
    hiddenEffect: boolean;
    enabled: boolean;
  }

  export interface ItemInstance extends ItemTemplate {
    id: string;
    ownerId: string | null;
    usesRemaining: number;
    active: boolean;
  }

  export interface EventLogEntry {
    id: string;
    type: string;
    timestamp: number;
    message: string;
    payload: Record<string, unknown>;
  }

  export interface UndoEntry {
    commandType: string;
    snapshot: EventStateSnapshot;
    label: string;
  }

  export interface EventStatistics {
    completedStages: number;
    itemActivations: number;
  }

  export interface EventStateSnapshot {
    status: EventStatus;
    players: Player[];
    stages: Stage[];
    currentStageIndex: number;
    inventory: ItemInstance[];
    statistics: EventStatistics;
    gameRuntime: { auction: AuctionState | null };
  }

  export interface EventState extends EventStateSnapshot {
    id: string;
    title: string;
    schemaVersion: number;
    createdAt: number;
    updatedAt: number;
    configuration: EventConfig;
    teams: Array<{ id: string; name: string }>;
    eventLog: EventLogEntry[];
    randomSeed: number;
    undoStack: UndoEntry[];
    sequence: number;
  }

  export interface CreateEventConfig {
    startTokens?: number;
    maxActiveItems?: number;
    autoSave?: boolean;
    seed?: number;
    now?: number;
  }

  export function createEvent(title: string, config: CreateEventConfig = {}): EventState {
    const cleanTitle = title.trim() || 'Новое мероприятие';
    const seed = (config.seed ?? Date.now()) >>> 0;
    const now = config.now ?? Date.now();
    return {
      id: `event-${seed.toString(36)}`,
      title: cleanTitle,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      status: 'PREPARATION',
      configuration: {
        startTokens: config.startTokens ?? 5,
        maxActiveItems: config.maxActiveItems ?? 1,
        autoSave: config.autoSave ?? true,
        seed,
      },
      players: [],
      teams: [],
      stages: [],
      currentStageIndex: -1,
      inventory: [],
      eventLog: [],
      statistics: { completedStages: 0, itemActivations: 0 },
      gameRuntime: { auction: null },
      randomSeed: seed,
      undoStack: [],
      sequence: 0,
    };
  }
}
