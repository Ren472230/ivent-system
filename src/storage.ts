namespace Ivent {
  export type SaveSlot = 'slot-1' | 'slot-2' | 'slot-3';

  export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  }

  export interface SlotMetadata {
    slot: SaveSlot;
    empty: boolean;
    title?: string;
    updatedAt?: number;
    playerCount?: number;
    checksum?: string;
  }

  export interface StorageAdapter {
    save(slot: SaveSlot, state: EventState): void;
    load(slot: SaveSlot): EventState;
    list(): SlotMetadata[];
    export(slot: SaveSlot): string;
    import(slot: SaveSlot, json: string): void;
  }

  const SLOT_LIST: SaveSlot[] = ['slot-1', 'slot-2', 'slot-3'];
  const STORAGE_PREFIX = 'ivent:v1';

  function assertSlot(slot: SaveSlot): void {
    if (!SLOT_LIST.includes(slot)) throw new IventError('Неизвестная ячейка сохранения.');
  }

  function key(slot: SaveSlot, kind: 'primary' | 'backup' | 'meta'): string {
    return `${STORAGE_PREFIX}:${slot}:${kind}`;
  }

  export function checksumText(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function validateState(value: unknown): EventState {
    if (!value || typeof value !== 'object') throw new IventError('Файл импорта не содержит состояние мероприятия.');
    const state = value as Partial<EventState>;
    if (state.schemaVersion !== 1) throw new IventError(`Версия сохранения ${String(state.schemaVersion)} пока не поддерживается.`);
    if (typeof state.title !== 'string' || !Array.isArray(state.players) || !Array.isArray(state.stages) || !Array.isArray(state.eventLog)) {
      throw new IventError('Файл импорта имеет неверную структуру.');
    }
    const migrated = JSON.parse(JSON.stringify(state)) as EventState;
    const legacy = migrated as unknown as { gameRuntime?: { auction?: AuctionState | null } };
    if (!legacy.gameRuntime || typeof legacy.gameRuntime !== 'object') legacy.gameRuntime = { auction: null };
    else if (!('auction' in legacy.gameRuntime)) legacy.gameRuntime.auction = null;
    return migrated;
  }

  function wrapState(state: EventState): { checksum: string; payload: string } {
    const payload = JSON.stringify(state);
    return { checksum: checksumText(payload), payload };
  }

  function decodeWrapped(raw: string): EventState {
    let wrapper: unknown;
    try {
      wrapper = JSON.parse(raw);
    } catch {
      throw new IventError('Сохранение повреждено: JSON не читается.');
    }
    if (!wrapper || typeof wrapper !== 'object') throw new IventError('Сохранение повреждено.');
    const record = wrapper as Record<string, unknown>;
    if (typeof record.payload !== 'string' || typeof record.checksum !== 'string') throw new IventError('Сохранение повреждено: нет контрольной суммы.');
    if (checksumText(record.payload) !== record.checksum) throw new IventError('Сохранение повреждено: контрольная сумма не совпадает.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(record.payload);
    } catch {
      throw new IventError('Сохранение повреждено: данные не читаются.');
    }
    return validateState(parsed);
  }

  export function createStorageAdapter(storage: StorageLike): StorageAdapter {
    function save(slot: SaveSlot, stateInput: EventState): void {
      assertSlot(slot);
      const state = validateState(stateInput);
      const current = storage.getItem(key(slot, 'primary'));
      if (current) {
        try {
          decodeWrapped(current);
          storage.setItem(key(slot, 'backup'), current);
        } catch {
          // Existing broken primary is intentionally not promoted to backup.
        }
      }
      const wrapped = wrapState(state);
      const raw = JSON.stringify(wrapped);
      storage.setItem(key(slot, 'primary'), raw);
      const meta = {
        slot,
        title: state.title,
        updatedAt: state.updatedAt,
        playerCount: state.players.length,
        checksum: wrapped.checksum,
      };
      storage.setItem(key(slot, 'meta'), JSON.stringify(meta));
    }

    function load(slot: SaveSlot): EventState {
      assertSlot(slot);
      const primary = storage.getItem(key(slot, 'primary'));
      if (primary) {
        try {
          return decodeWrapped(primary);
        } catch {
          // Fall through to backup.
        }
      }
      const backup = storage.getItem(key(slot, 'backup'));
      if (backup) return decodeWrapped(backup);
      throw new IventError('В этой ячейке нет рабочего сохранения.');
    }

    function list(): SlotMetadata[] {
      return SLOT_LIST.map((slot) => {
        const raw = storage.getItem(key(slot, 'meta'));
        if (!raw) return { slot, empty: true };
        try {
          const meta = JSON.parse(raw) as Record<string, unknown>;
          return {
            slot,
            empty: false,
            title: typeof meta.title === 'string' ? meta.title : '',
            updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : 0,
            playerCount: typeof meta.playerCount === 'number' ? meta.playerCount : 0,
            checksum: typeof meta.checksum === 'string' ? meta.checksum : '',
          };
        } catch {
          return { slot, empty: true };
        }
      });
    }

    function exportSlot(slot: SaveSlot): string {
      return JSON.stringify(load(slot), null, 2);
    }

    function importSlot(slot: SaveSlot, json: string): void {
      assertSlot(slot);
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new IventError('Файл импорта содержит некорректный JSON.');
      }
      const state = validateState(parsed);
      save(slot, state);
    }

    return { save, load, list, export: exportSlot, import: importSlot };
  }
}
