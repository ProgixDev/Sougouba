import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PersistedTable<T> {
  /** Await before any read or write — the first load is asynchronous. */
  ready: Promise<void>;
  rows: () => T[];
  /** Append and persist. */
  add: (row: T) => Promise<void>;
  /** Persist a row that was just mutated in place. */
  save: (id: string) => Promise<void>;
  /** Drop a row and remember that it is gone, seeded or not. */
  remove: (id: string) => Promise<void>;
}

interface Snapshot<T> {
  rows: T[];
  /** Ids removed by the app. Needed because a deleted *seed* row would otherwise return on the next launch. */
  deleted: string[];
}

/**
 * A mock "backend" table that survives an app restart.
 *
 * Without this, anything created during a demo — an account, an order — vanishes
 * on relaunch and the app looks broken rather than mocked.
 *
 * **Only rows the app actually wrote are persisted.** The seeds are re-read from
 * code on every launch and the stored rows are layered on top by id. Writing the
 * whole table instead would freeze the seeds into storage the first time
 * anything was saved — and since seeded orders are dated relative to launch (see
 * `data/utils/time.ts`), that would pin a shop's entire history to whichever day
 * the demo first ran, which is the exact failure this data is shaped to avoid.
 * It also means editing a seed file is no longer masked by a stale snapshot.
 */
export function createPersistedTable<T extends { id: string }>(
  storageKey: string,
  seed: readonly T[]
): PersistedTable<T> {
  const fresh = () => seed.map((row) => ({ ...row }));

  let rows: T[] = fresh();
  /** Ids written by the app this install — the only rows that go to storage. */
  const owned = new Set<string>();
  const deleted = new Set<string>();

  const ready = (async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Snapshot<T> | T[];
      // A bare array is the legacy format, written when this helper persisted
      // the *whole* table. Those snapshots contain a frozen copy of every seed
      // row as it stood on the day they were written — including order dates,
      // which are now relative to launch. Adopting them would pin an existing
      // install's shop history to that day forever, so only rows the seed does
      // not know about (accounts, orders and products created in the app) are
      // carried across; the rest are re-read from code.
      const seedIds = new Set(seed.map((row) => row.id));
      const stored = Array.isArray(parsed)
        ? { rows: parsed.filter((row) => row?.id && !seedIds.has(row.id)), deleted: [] }
        : parsed;
      if (!Array.isArray(stored?.rows)) return;

      for (const id of stored.deleted ?? []) deleted.add(id);
      for (const row of stored.rows) {
        if (!row?.id || deleted.has(row.id)) continue;
        owned.add(row.id);
        const index = rows.findIndex((r) => r.id === row.id);
        if (index >= 0) rows[index] = row;
        else rows.push(row);
      }
      if (deleted.size > 0) rows = rows.filter((row) => !deleted.has(row.id));
    } catch {
      // A corrupted snapshot just means the demo starts from the seeds again.
      rows = fresh();
      owned.clear();
      deleted.clear();
    }
  })();

  async function persist() {
    try {
      const payload: Snapshot<T> = {
        rows: rows.filter((row) => owned.has(row.id)),
        deleted: [...deleted],
      };
      await AsyncStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Non-fatal: the in-memory table is still correct for this session.
    }
  }

  return {
    ready,
    rows: () => rows,
    add: async (row) => {
      rows.push(row);
      owned.add(row.id);
      deleted.delete(row.id);
      await persist();
    },
    save: async (id) => {
      owned.add(id);
      await persist();
    },
    remove: async (id) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index !== -1) rows.splice(index, 1);
      owned.delete(id);
      deleted.add(id);
      await persist();
    },
  };
}
