import type { SyncState } from "./types";

/**
 * Demo switches for enterprise states the mock tenant can't reach on its own
 * (offline, empty balance, session held elsewhere, device removed).
 *
 * Persisted in localStorage under {@link SIMULATION_STORAGE_KEY}; a
 * `?entSim=offline,tenant-exhausted,session-lock,revoked` query string sets
 * it once on load (`?entSim=` clears it). Remove with the mock layer.
 */

export type BillingSimulation = "ok" | "tenant-exhausted" | "quota-exceeded";

export interface EnterpriseSimulation {
  sync: SyncState;
  billing: BillingSimulation;
  sessionLock: boolean;
  revoked: boolean;
}

export const SIMULATION_STORAGE_KEY = "tabby:enterprise-sim";

export const DEFAULT_SIMULATION: EnterpriseSimulation = {
  sync: "synced",
  billing: "ok",
  sessionLock: false,
  revoked: false,
};

function parseTokens(raw: string): EnterpriseSimulation {
  const tokens = new Set(
    raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
  return {
    sync: tokens.has("offline")
      ? "offline"
      : tokens.has("pending")
      ? "pending"
      : "synced",
    billing: tokens.has("tenant-exhausted")
      ? "tenant-exhausted"
      : tokens.has("quota-exceeded")
      ? "quota-exceeded"
      : "ok",
    sessionLock: tokens.has("session-lock"),
    revoked: tokens.has("revoked"),
  };
}

function readStored(): EnterpriseSimulation {
  try {
    const raw = localStorage.getItem(SIMULATION_STORAGE_KEY);
    if (!raw) return DEFAULT_SIMULATION;
    return {
      ...DEFAULT_SIMULATION,
      ...(JSON.parse(raw) as Partial<EnterpriseSimulation>),
    };
  } catch {
    return DEFAULT_SIMULATION;
  }
}

function writeStored(sim: EnterpriseSimulation) {
  try {
    localStorage.setItem(SIMULATION_STORAGE_KEY, JSON.stringify(sim));
  } catch {
    // Storage unavailable (private mode) — the in-memory value still applies.
  }
}

let current: EnterpriseSimulation | null = null;
const listeners = new Set<(sim: EnterpriseSimulation) => void>();

export function getSimulation(): EnterpriseSimulation {
  if (current) return current;
  current = readStored();
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.has("entSim")) {
      current = parseTokens(params.get("entSim") ?? "");
      writeStored(current);
    }
  }
  return current;
}

export function setSimulation(patch: Partial<EnterpriseSimulation>) {
  current = { ...getSimulation(), ...patch };
  writeStored(current);
  listeners.forEach((fn) => fn(current as EnterpriseSimulation));
}

export function subscribeSimulation(
  fn: (sim: EnterpriseSimulation) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
