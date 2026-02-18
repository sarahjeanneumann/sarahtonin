import type { AppState, StressEntry, Waypoint } from './types';

const STORAGE_KEY = 'garmin-stress-analyzer';

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      return {
        entries: parsed.entries || [],
        waypoints: parsed.waypoints || [],
      };
    }
  } catch {
    // Corrupted storage, reset
  }
  return { entries: [], waypoints: [] };
}

function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getEntries(): StressEntry[] {
  return loadState().entries;
}

export function setEntries(entries: StressEntry[]): void {
  const state = loadState();
  state.entries = entries;
  saveState(state);
}

export function mergeEntries(newEntries: StressEntry[]): StressEntry[] {
  const state = loadState();
  const map = new Map<string, StressEntry>();

  for (const e of state.entries) map.set(e.date, e);
  for (const e of newEntries) map.set(e.date, e); // new overwrites old

  const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  state.entries = merged;
  saveState(state);
  return merged;
}

export function getWaypoints(): Waypoint[] {
  return loadState().waypoints;
}

export function addWaypoint(wp: Waypoint): void {
  const state = loadState();
  state.waypoints.push(wp);
  state.waypoints.sort((a, b) => a.date.localeCompare(b.date));
  saveState(state);
}

export function removeWaypoint(id: string): void {
  const state = loadState();
  state.waypoints = state.waypoints.filter(w => w.id !== id);
  saveState(state);
}

export function updateWaypoint(wp: Waypoint): void {
  const state = loadState();
  const idx = state.waypoints.findIndex(w => w.id === wp.id);
  if (idx >= 0) {
    state.waypoints[idx] = wp;
    state.waypoints.sort((a, b) => a.date.localeCompare(b.date));
  }
  saveState(state);
}

export function clearAll(): void {
  localStorage.removeItem(STORAGE_KEY);
}
