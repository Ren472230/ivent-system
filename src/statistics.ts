namespace Ivent {
  export interface NominationResult {
    playerId: string;
    playerName: string;
    value: number;
  }

  export interface PartyStatistics {
    richestEarned: NominationResult | null;
    biggestSpender: NominationResult | null;
    collector: NominationResult | null;
    aggressor: NominationResult | null;
    mostTargeted: NominationResult | null;
    stageWinnerLeader: NominationResult | null;
    completedStages: number;
    itemActivations: number;
    eventCount: number;
  }

  function pickMax(players: Player[], valueOf: (player: Player) => number): NominationResult | null {
    if (!players.length) return null;
    let winner = players[0];
    let best = valueOf(winner);
    for (let i = 1; i < players.length; i += 1) {
      const value = valueOf(players[i]);
      if (value > best) {
        winner = players[i];
        best = value;
      }
    }
    return { playerId: winner.id, playerName: winner.name, value: best };
  }

  export function calculateStatistics(state: EventState): PartyStatistics {
    return {
      richestEarned: pickMax(state.players, (player) => player.totalEarned),
      biggestSpender: pickMax(state.players, (player) => player.totalSpent),
      collector: pickMax(state.players, (player) => player.inventoryItemIds.length),
      aggressor: pickMax(state.players, (player) => player.negativeEffectsUsed),
      mostTargeted: pickMax(state.players, (player) => player.timesTargeted),
      stageWinnerLeader: pickMax(state.players, (player) => player.wins),
      completedStages: state.statistics.completedStages,
      itemActivations: state.statistics.itemActivations,
      eventCount: state.eventLog.length,
    };
  }
}
