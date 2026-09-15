namespace Ivent {
  const DEFAULT_ITEM_CATALOG: ItemTemplate[] = [
    {
      templateId: 'redirect', name: 'Перенаправление', rarity: 'RARE', price: 8,
      description: 'Перенаправь направленный на тебя эффект на другого игрока.',
      effectType: 'redirect', effectPayload: {}, activationWindow: 'ANYTIME', targetRule: 'ONE_PLAYER',
      uses: 1, durationRule: 'instant', transferable: true, sellable: true, hiddenEffect: false, enabled: true,
    },
    {
      templateId: 'shield', name: 'Щит', rarity: 'UNCOMMON', price: 5,
      description: 'Отмени один негативный эффект, направленный на тебя.',
      effectType: 'shield', effectPayload: {}, activationWindow: 'ANYTIME', targetRule: 'SELF',
      uses: 1, durationRule: 'instant', transferable: true, sellable: true, hiddenEffect: false, enabled: true,
    },
    {
      templateId: 'swap_result', name: 'Переворот результата', rarity: 'EPIC', price: 12,
      description: 'После этапа поменяй местами результаты двух игроков до выдачи наград.',
      effectType: 'swap_result', effectPayload: {}, activationWindow: 'BEFORE_RESULT', targetRule: 'TWO_PLAYERS',
      uses: 1, durationRule: 'instant', transferable: true, sellable: true, hiddenEffect: false, enabled: true,
    },
    {
      templateId: 'steal_tokens', name: 'Карманник', rarity: 'RARE', price: 9,
      description: 'Забери 2 жетона у выбранного игрока, если у него хватает жетонов.',
      effectType: 'steal_tokens', effectPayload: { amount: 2 }, activationWindow: 'ANYTIME', targetRule: 'ONE_PLAYER',
      uses: 1, durationRule: 'instant', transferable: true, sellable: true, hiddenEffect: false, enabled: true,
    },
    {
      templateId: 'double_reward', name: 'Двойная ставка', rarity: 'RARE', price: 8,
      description: 'Удвой награду за следующий выигранный этап.',
      effectType: 'double_reward', effectPayload: { multiplier: 2 }, activationWindow: 'BEFORE_STAGE', targetRule: 'SELF',
      uses: 1, durationRule: 'one_stage', transferable: true, sellable: true, hiddenEffect: false, enabled: true,
    },
    {
      templateId: 'reveal_balance', name: 'Рентген кошелька', rarity: 'COMMON', price: 3,
      description: 'Открой точный баланс жетонов любого игрока.',
      effectType: 'reveal_balance', effectPayload: {}, activationWindow: 'ANYTIME', targetRule: 'ANY_PLAYER',
      uses: 1, durationRule: 'instant', transferable: true, sellable: true, hiddenEffect: false, enabled: true,
    },
    {
      templateId: 'big_lollipop', name: 'Большой чупачупс', rarity: 'UNCOMMON', price: 6,
      description: 'Физический приз. Один раз потребуй переигровку короткого раунда текущего этапа.',
      effectType: 'replay_round', effectPayload: {}, activationWindow: 'DURING_STAGE', targetRule: 'STAGE',
      uses: 1, durationRule: 'instant', transferable: true, sellable: false, hiddenEffect: true, enabled: true,
    },
    {
      templateId: 'emerald_heart', name: 'Изумрудное сердце', rarity: 'LEGENDARY', price: 15,
      description: 'Физический приз. Один раз защити себя от поражения и переведи решение ведущему.',
      effectType: 'second_chance', effectPayload: {}, activationWindow: 'BEFORE_RESULT', targetRule: 'SELF',
      uses: 1, durationRule: 'instant', transferable: false, sellable: false, hiddenEffect: true, enabled: true,
    },
  ];

  export function createDefaultCatalog(): ItemTemplate[] {
    return JSON.parse(JSON.stringify(DEFAULT_ITEM_CATALOG)) as ItemTemplate[];
  }

  function catalogTemplate(templateId: string): ItemTemplate {
    const template = DEFAULT_ITEM_CATALOG.find((entry) => entry.templateId === templateId);
    if (!template) throw new IventError('Предмет с таким шаблоном не найден.');
    return JSON.parse(JSON.stringify(template)) as ItemTemplate;
  }

  function itemById(state: EventState, itemId: string): ItemInstance {
    const item = state.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new IventError('Предмет не найден.');
    return item;
  }

  function removeId(list: string[], value: string): void {
    const index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
  }

  export function executeItemCommand(state: EventState, command: Command, now: number, events: EventLogEntry[]): boolean {
    switch (command.type) {
      case 'REGISTER_ITEM': {
        const templateId = String(command.templateId ?? '');
        const template = catalogTemplate(templateId);
        const item: ItemInstance = {
          ...template,
          id: internalAllocateId(state, 'item'),
          ownerId: null,
          usesRemaining: template.uses,
          active: false,
        };
        state.inventory.push(item);
        events.push(internalAppendEvent(state, 'ITEM_REGISTERED', `В магазин добавлен предмет «${item.name}»`, { itemId: item.id, templateId }, now));
        return true;
      }
      case 'CLAIM_AUCTION_ITEM': {
        const templateId = String(command.templateId ?? '');
        const playerId = String(command.playerId ?? '');
        const amount = Number(command.amount);
        if (!Number.isInteger(amount) || amount <= 0) throw new IventError('Сумма лота должна быть положительным целым числом.');
        const template = catalogTemplate(templateId);
        const player = internalFindPlayer(state, playerId);
        if (player.walletBalance < amount) throw new IventError(`У игрока ${player.name} недостаточно жетонов.`);
        const item: ItemInstance = {
          ...template,
          id: internalAllocateId(state, 'item'),
          ownerId: playerId,
          usesRemaining: template.uses,
          active: false,
        };
        player.walletBalance -= amount;
        player.totalSpent += amount;
        player.inventoryItemIds.push(item.id);
        state.inventory.push(item);
        events.push(internalAppendEvent(state, 'AUCTION_ITEM_CLAIMED', `${player.name} выигрывает «${item.name}» за ${amount} жет.`, { itemId: item.id, templateId, playerId, amount }, now));
        return true;
      }
      case 'BUY_ITEM': {
        const itemId = String(command.itemId ?? '');
        const playerId = String(command.playerId ?? '');
        const item = itemById(state, itemId);
        const player = internalFindPlayer(state, playerId);
        if (!item.enabled) throw new IventError('Этот предмет сейчас недоступен.');
        if (item.ownerId) throw new IventError('У предмета уже есть владелец.');
        if (player.walletBalance < item.price) throw new IventError(`У игрока ${player.name} недостаточно жетонов.`);
        player.walletBalance -= item.price;
        player.totalSpent += item.price;
        item.ownerId = playerId;
        player.inventoryItemIds.push(item.id);
        events.push(internalAppendEvent(state, 'ITEM_PURCHASED', `${player.name} покупает «${item.name}» за ${item.price} жет.`, { itemId, playerId, price: item.price }, now));
        return true;
      }
      case 'GIVE_ITEM': {
        const itemId = String(command.itemId ?? '');
        const toPlayerId = String(command.toPlayerId ?? '');
        const item = itemById(state, itemId);
        const to = internalFindPlayer(state, toPlayerId);
        if (!item.ownerId) throw new IventError('У предмета нет владельца для передачи.');
        if (!item.transferable) throw new IventError('Этот предмет нельзя передавать.');
        if (item.active) throw new IventError('Сначала деактивируй предмет.');
        const from = internalFindPlayer(state, item.ownerId);
        if (command.fromPlayerId && String(command.fromPlayerId) !== from.id) throw new IventError('Владелец предмета не совпадает.');
        if (from.id === to.id) throw new IventError('Предмет уже принадлежит этому игроку.');
        removeId(from.inventoryItemIds, item.id);
        removeId(from.activeItemIds, item.id);
        to.inventoryItemIds.push(item.id);
        item.ownerId = to.id;
        events.push(internalAppendEvent(state, 'ITEM_GIVEN', `${from.name} передаёт «${item.name}» игроку ${to.name}`, { itemId, fromPlayerId: from.id, toPlayerId: to.id }, now));
        return true;
      }
      case 'ACTIVATE_ITEM': {
        const itemId = String(command.itemId ?? '');
        const playerId = String(command.playerId ?? '');
        const item = itemById(state, itemId);
        const player = internalFindPlayer(state, playerId);
        if (item.ownerId !== playerId) throw new IventError('Предмет принадлежит другому игроку.');
        if (item.active) throw new IventError('Предмет уже активен.');
        if (item.usesRemaining <= 0) throw new IventError('Использования предмета закончились.');
        if (player.activeItemIds.length >= state.configuration.maxActiveItems) throw new IventError('Достигнут лимит активных предметов.');
        item.active = true;
        item.usesRemaining -= 1;
        player.activeItemIds.push(item.id);
        state.statistics.itemActivations += 1;
        if (['redirect', 'steal_tokens', 'swap_result'].includes(item.effectType)) player.negativeEffectsUsed += 1;
        events.push(internalAppendEvent(state, 'ITEM_ACTIVATED', `${player.name} активирует «${item.name}»`, { itemId, playerId, effectType: item.effectType }, now));
        if (item.effectType === 'steal_tokens') {
          const targetPlayerId = String(command.targetPlayerId ?? '');
          if (!targetPlayerId) throw new IventError('Для Карманника выбери цель.');
          if (targetPlayerId === playerId) throw new IventError('Нельзя украсть жетоны у самого себя.');
          const target = internalFindPlayer(state, targetPlayerId);
          const amount = Number(item.effectPayload.amount ?? 2);
          if (target.walletBalance < amount) throw new IventError(`У игрока ${target.name} недостаточно жетонов для эффекта.`);
          target.walletBalance -= amount;
          target.timesTargeted += 1;
          player.walletBalance += amount;
          player.totalEarned += amount;
          item.active = false;
          const activeIndex = player.activeItemIds.indexOf(item.id);
          if (activeIndex >= 0) player.activeItemIds.splice(activeIndex, 1);
          events.push(internalAppendEvent(state, 'ITEM_EFFECT_APPLIED', `${player.name} забирает ${amount} жет. у игрока ${target.name}`, { itemId, playerId, targetPlayerId, amount, effectType: item.effectType }, now));
        }
        return true;
      }
      case 'DEACTIVATE_ITEM': {
        const itemId = String(command.itemId ?? '');
        const playerId = String(command.playerId ?? '');
        const item = itemById(state, itemId);
        const player = internalFindPlayer(state, playerId);
        if (item.ownerId !== playerId) throw new IventError('Предмет принадлежит другому игроку.');
        if (!item.active) throw new IventError('Предмет уже выключен.');
        item.active = false;
        removeId(player.activeItemIds, item.id);
        events.push(internalAppendEvent(state, 'ITEM_DEACTIVATED', `${player.name} деактивирует «${item.name}»`, { itemId, playerId }, now));
        return true;
      }
      default:
        return false;
    }
  }

  registerCommandHandler(executeItemCommand);
}
