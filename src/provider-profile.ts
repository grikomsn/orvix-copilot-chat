import { randomUUID } from "node:crypto";
import { credentialReference } from "./auth/auth";

export function entryIdFromConfiguration(configuration: Readonly<Record<string, unknown>>): string {
  const value = configuration.entryId;
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) {
    throw new Error("Set a unique entryId in Manage Language Models: 1-64 lowercase letters, numbers, dots, underscores, or hyphens");
  }
  return value;
}

export function apiKeyFromConfiguration(configuration: Readonly<Record<string, unknown>>): string | undefined {
  const value = configuration.apiKey;
  const apiKey = typeof value === "string" ? value.trim() : "";
  return apiKey.startsWith("orv-sk_live_") ? apiKey : undefined;
}

export function qualifiedModelId(entryId: string, modelId: string): string { return `${entryId}::${modelId}`; }
export interface NativeEntry {
  readonly entryId: string;
  readonly credentialRef: string;
  readonly generation: string;
}

/** VS Code owns the secrets. A rotation retires every previously issued model handle. */
export class NativeEntries {
  private readonly entries = new Map<string, NativeEntry & { apiKey: string }>();
  private readonly forgotten: Set<string>;

  constructor(forgotten: readonly string[] = []) {
    this.forgotten = new Set(forgotten.filter((id) => /^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)));
  }

  register(configuration: Readonly<Record<string, unknown>>): NativeEntry {
    const entryId = entryIdFromConfiguration(configuration);
    if (this.forgotten.has(entryId)) throw new Error("This Orvix entry was forgotten. Restore it explicitly in Manage Connection.");
    const apiKey = apiKeyFromConfiguration(configuration);
    if (!apiKey) throw new Error("Set a valid Orvix API key in Manage Language Models");
    const previous = this.entries.get(entryId);
    const credentialRef = `${entryId}:${credentialReference(apiKey)}`;
    const generation = previous?.credentialRef === credentialRef ? previous.generation : randomUUID();
    this.entries.set(entryId, { entryId, credentialRef, generation, apiKey });
    return { entryId, credentialRef, generation };
  }

  list(): NativeEntry[] {
    return [...this.entries.values()].map(({ entryId, credentialRef, generation }) => ({ entryId, credentialRef, generation }));
  }
  matches(entry: NativeEntry): boolean {
    const current = this.entries.get(entry.entryId);
    return current?.credentialRef === entry.credentialRef && current.generation === entry.generation;
  }
  key(entry: NativeEntry): string {
    if (!this.matches(entry)) throw new Error("This Orvix entry changed or was forgotten. Reselect its model in Manage Language Models.");
    return this.entries.get(entry.entryId)!.apiKey;
  }
  get(entryId: string): NativeEntry {
    const entry = this.entries.get(entryId);
    if (!entry) throw new Error("Select an available Orvix entry in Manage Connection");
    return { entryId, credentialRef: entry.credentialRef, generation: entry.generation };
  }
  isForgotten(entryId: string): boolean { return this.forgotten.has(entryId); }
  forgottenIds(): string[] { return [...this.forgotten]; }
  restore(entryId: string): void { this.forgotten.delete(entryIdFromConfiguration({ entryId })); }
  forget(entryId: string): void {
    entryIdFromConfiguration({ entryId });
    this.entries.delete(entryId);
    this.forgotten.add(entryId);
  }
}
