namespace Ivent {
  export interface AuctionConfig {
    startPrice: number;
    bidStep: number;
    lotSeconds: number;
    revealEffectAfterPurchase: boolean;
  }

  export interface AuctionLot {
    id: string;
    itemTemplateId: string;
    currentBid: number;
    highestBidderId: string | null;
    closed: boolean;
  }

  export interface AuctionState {
    config: AuctionConfig;
    lots: AuctionLot[];
    currentLotIndex: number;
    finished: boolean;
  }

  export interface ClosedAuctionLot {
    auction: AuctionState;
    winnerId: string | null;
    amount: number;
    itemTemplateId: string;
  }

  function cloneAuction(state: AuctionState): AuctionState {
    return JSON.parse(JSON.stringify(state)) as AuctionState;
  }

  function validateAuctionConfig(config: AuctionConfig): void {
    if (!Number.isInteger(config.startPrice) || config.startPrice < 1 || config.startPrice > 10) {
      throw new IventError('Стартовая цена аукциона должна быть от 1 до 10 жетонов.');
    }
    if (!Number.isInteger(config.bidStep) || config.bidStep < 1 || config.bidStep > 5) {
      throw new IventError('Шаг ставки должен быть от 1 до 5 жетонов.');
    }
    if (!Number.isInteger(config.lotSeconds) || config.lotSeconds < 20 || config.lotSeconds > 60) {
      throw new IventError('Время лота должно быть от 20 до 60 секунд.');
    }
  }

  export function createAuction(itemTemplateIds: string[], config: AuctionConfig): AuctionState {
    validateAuctionConfig(config);
    if (!Array.isArray(itemTemplateIds) || itemTemplateIds.length < 1 || itemTemplateIds.length > 10) {
      throw new IventError('Аукцион должен содержать от 1 до 10 лотов.');
    }
    const known = new Set(createDefaultCatalog().map((item) => item.templateId));
    for (const templateId of itemTemplateIds) {
      if (!known.has(templateId)) throw new IventError(`Неизвестный предмет аукциона: ${templateId}.`);
    }
    return {
      config: { ...config },
      lots: itemTemplateIds.map((itemTemplateId, index) => ({
        id: `lot-${index + 1}`,
        itemTemplateId,
        currentBid: 0,
        highestBidderId: null,
        closed: false,
      })),
      currentLotIndex: 0,
      finished: false,
    };
  }

  function currentLot(state: AuctionState): AuctionLot {
    if (state.finished || state.currentLotIndex >= state.lots.length) throw new IventError('Аукцион уже завершён.');
    const lot = state.lots[state.currentLotIndex];
    if (!lot || lot.closed) throw new IventError('Текущий лот уже закрыт.');
    return lot;
  }

  export function placeAuctionBid(
    input: AuctionState,
    playerId: string,
    amount: number,
    balances: Record<string, number>,
  ): AuctionState {
    if (!playerId) throw new IventError('Игрок для ставки не выбран.');
    if (!Number.isInteger(amount) || amount <= 0) throw new IventError('Ставка должна быть целым положительным числом.');
    const balance = balances[playerId];
    if (typeof balance !== 'number') throw new IventError('Баланс игрока неизвестен.');
    if (amount > balance) throw new IventError('Для этой ставки недостаточно жетонов.');

    const state = cloneAuction(input);
    const lot = currentLot(state);
    const minimum = lot.highestBidderId === null ? state.config.startPrice : lot.currentBid + state.config.bidStep;
    if (amount < minimum) throw new IventError(`Минимальная ставка: ${minimum} жет.`);
    lot.currentBid = amount;
    lot.highestBidderId = playerId;
    return state;
  }

  export function closeAuctionLot(input: AuctionState): ClosedAuctionLot {
    const state = cloneAuction(input);
    const lot = currentLot(state);
    lot.closed = true;
    const result: ClosedAuctionLot = {
      auction: state,
      winnerId: lot.highestBidderId,
      amount: lot.highestBidderId ? lot.currentBid : 0,
      itemTemplateId: lot.itemTemplateId,
    };
    state.currentLotIndex += 1;
    if (state.currentLotIndex >= state.lots.length) state.finished = true;
    return result;
  }

  function validateAuctionState(value: unknown): AuctionState {
    if (!value || typeof value !== 'object') throw new IventError('Состояние аукциона повреждено.');
    const auction = value as AuctionState;
    if (!Array.isArray(auction.lots) || typeof auction.currentLotIndex !== 'number' || !auction.config) {
      throw new IventError('Состояние аукциона повреждено.');
    }
    return cloneAuction(auction);
  }

  export function executeAuctionCommand(state: EventState, command: Command, now: number, events: EventLogEntry[]): boolean {
    switch (command.type) {
      case 'SET_AUCTION_STATE': {
        const auction = validateAuctionState(command.auction);
        state.gameRuntime.auction = auction;
        const label = typeof command.label === 'string' && command.label.trim() ? command.label.trim() : 'Состояние аукциона обновлено';
        events.push(internalAppendEvent(state, 'AUCTION_STATE_UPDATED', label, { currentLotIndex: auction.currentLotIndex, finished: auction.finished }, now));
        return true;
      }
      case 'CLEAR_AUCTION_STATE': {
        state.gameRuntime.auction = null;
        events.push(internalAppendEvent(state, 'AUCTION_STATE_CLEARED', 'Аукцион сброшен', {}, now));
        return true;
      }
      default:
        return false;
    }
  }

  registerCommandHandler(executeAuctionCommand);

  registerGameModule({
    id: 'auction',
    name: 'Аукцион артефактов',
    version: '1.0',
    type: 'GAME',
    minPlayers: 3,
    maxPlayers: 30,
    estimatedMinutes: 15,
    mode: 'individual',
    resultMode: 'auction',
    defaultWinnerReward: 0,
    itemsAllowed: false,
    rulesSummary: 'Игроки торгуются жетонами за предметы. Эффект некоторых лотов можно скрыть до покупки.',
    aiCapabilities: [],
    requiredProps: [],
  });
}
