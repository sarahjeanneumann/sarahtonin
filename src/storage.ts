import type { AppState, Series, Waypoint } from './types';

const STORAGE_KEY = 'garmin-stress-analyzer';

// ── Migration & Loading ──────────────────────────────────────────

interface LegacyAppState {
  entries?: { date: string; score: number }[];
  waypoints?: Waypoint[];
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);

      // Migrate from old single-entries format
      if (parsed.entries && !parsed.series) {
        const legacy = parsed as LegacyAppState;
        const migrated: AppState = {
          series: [{
            id: 'migrated',
            name: 'Imported Data',
            color: '#56b4e9',
            entries: (legacy.entries || []).sort((a, b) => a.date.localeCompare(b.date)),
            visible: true,
          }],
          waypoints: legacy.waypoints || [],
          activeSeriesId: 'migrated',
        };
        saveState(migrated);
        return migrated;
      }

      return {
        series: parsed.series || [],
        waypoints: parsed.waypoints || [],
        activeSeriesId: parsed.activeSeriesId ?? null,
      };
    }
  } catch {
    // Corrupted storage, reset
  }
  return { series: [], waypoints: [], activeSeriesId: null };
}

function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Series CRUD ──────────────────────────────────────────────────

export function getAllSeries(): Series[] {
  return loadState().series;
}

export function addSeries(series: Series): void {
  const state = loadState();
  state.series.push(series);
  state.activeSeriesId = series.id;
  saveState(state);
}

export function removeSeries(id: string): void {
  const state = loadState();
  state.series = state.series.filter(s => s.id !== id);
  if (state.activeSeriesId === id) {
    state.activeSeriesId = state.series.length > 0 ? state.series[0].id : null;
  }
  saveState(state);
}

export function updateSeries(series: Series): void {
  const state = loadState();
  const idx = state.series.findIndex(s => s.id === series.id);
  if (idx >= 0) {
    state.series[idx] = series;
  }
  saveState(state);
}

export function getActiveSeriesId(): string | null {
  return loadState().activeSeriesId;
}

export function setActiveSeriesId(id: string | null): void {
  const state = loadState();
  state.activeSeriesId = id;
  saveState(state);
}

/**
 * Generate a unique series name by appending (2), (3), etc. if needed.
 */
export function deduplicateSeriesName(baseName: string): string {
  const state = loadState();
  const existing = new Set(state.series.map(s => s.name));
  if (!existing.has(baseName)) return baseName;

  let n = 2;
  while (existing.has(`${baseName} (${n})`)) n++;
  return `${baseName} (${n})`;
}

// ── Waypoint CRUD ────────────────────────────────────────────────

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

// ── Clear ────────────────────────────────────────────────────────

export function clearAll(): void {
  localStorage.removeItem(STORAGE_KEY);
}
