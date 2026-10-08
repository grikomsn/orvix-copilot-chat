import type { MetadataCache } from "./models/metadata";

const JOURNAL_KEY = "orvixCopilot.observedEntries.v1";
export interface EntryObservation { modelCount: number; updatedAt: number }
const mutations = new WeakMap<MetadataCache, Promise<void>>();
export function observedEntries(state: MetadataCache): Readonly<Record<string, EntryObservation>> {
  return state.get<Readonly<Record<string, EntryObservation>>>(JOURNAL_KEY) ?? {};
}
/** Counts and aliases record observations, never credential availability or billing ownership. */
export async function observeEntry(state: MetadataCache, entryId: string, modelCount: number | undefined): Promise<void> {
  const current = (mutations.get(state) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const entries = { ...observedEntries(state) };
    if (modelCount === undefined) delete entries[entryId];
    else entries[entryId] = { modelCount, updatedAt: Date.now() };
    await state.update(JOURNAL_KEY, entries);
  });
  mutations.set(state, current);
  try { await current; } finally { if (mutations.get(state) === current) mutations.delete(state); }
}
