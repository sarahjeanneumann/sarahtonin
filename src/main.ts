import { parseCSV } from './csv';
import { renderChart, destroyChart } from './chart';
import {
  getEntries,
  mergeEntries,
  getWaypoints,
  addWaypoint,
  removeWaypoint,
  updateWaypoint,
  clearAll,
} from './storage';
import {
  buildSegments,
  computeSegmentStats,
  computeWaypointComparison,
} from './stats';
import {
  renderSegmentCards,
  renderComparisonPanel,
  renderWaypointList,
} from './ui';
import type { Waypoint } from './types';
import './style.css';

// ── DOM references ───────────────────────────────────────────────

const fileInput = document.getElementById('csv-upload') as HTMLInputElement;
const uploadBtn = document.getElementById('btn-upload') as HTMLButtonElement;
const clearBtn = document.getElementById('btn-clear') as HTMLButtonElement;
const chartCanvas = document.getElementById('stress-chart') as HTMLCanvasElement;
const segmentContainer = document.getElementById('segment-cards') as HTMLElement;
const waypointContainer = document.getElementById('waypoint-list') as HTMLElement;
const comparisonContainer = document.getElementById('comparison-panel') as HTMLElement;
const addWaypointBtn = document.getElementById('btn-add-waypoint') as HTMLButtonElement;
const wpDateInput = document.getElementById('wp-date') as HTMLInputElement;
const wpLabelInput = document.getElementById('wp-label') as HTMLInputElement;
const wpColorInput = document.getElementById('wp-color') as HTMLInputElement;
const dataStatus = document.getElementById('data-status') as HTMLElement;
const comparisonTitle = document.getElementById('comparison-title') as HTMLElement;

// ── State ────────────────────────────────────────────────────────

let selectedWaypointId: string | null = null;

// ── Render everything ────────────────────────────────────────────

function refresh(): void {
  const entries = getEntries();
  const waypoints = getWaypoints();

  // Status
  if (entries.length > 0) {
    const first = entries[0].date;
    const last = entries[entries.length - 1].date;
    dataStatus.textContent = `${entries.length} days loaded (${first} to ${last})`;
    dataStatus.className = 'data-status has-data';
  } else {
    dataStatus.textContent = 'No data loaded';
    dataStatus.className = 'data-status no-data';
  }

  // Chart
  if (entries.length > 0) {
    renderChart(chartCanvas, entries, waypoints);
  } else {
    destroyChart();
  }

  // Segments
  const segments = buildSegments(entries, waypoints);
  const segStats = segments.map(computeSegmentStats);
  renderSegmentCards(segmentContainer, segStats);

  // Waypoint list
  renderWaypointList(waypointContainer, waypoints, handleRemoveWaypoint, handleSelectWaypoint, handleColorChange);

  // Comparison
  if (selectedWaypointId) {
    const wp = waypoints.find(w => w.id === selectedWaypointId);
    if (wp) {
      comparisonTitle.textContent = `Comparing: ${wp.label}`;
      const comparison = computeWaypointComparison(entries, wp);
      renderComparisonPanel(comparisonContainer, comparison);
    } else {
      selectedWaypointId = null;
      comparisonTitle.textContent = 'Waypoint Comparison';
      renderComparisonPanel(comparisonContainer, null);
    }
  } else {
    comparisonTitle.textContent = 'Waypoint Comparison';
    renderComparisonPanel(comparisonContainer, null);
  }

  // Update waypoint date input range
  if (entries.length > 0) {
    wpDateInput.min = entries[0].date;
    wpDateInput.max = entries[entries.length - 1].date;
  }
}

// ── Event handlers ───────────────────────────────────────────────

uploadBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result as string;
    const parsed = parseCSV(text);

    if (parsed.length === 0) {
      alert('No valid stress data found in the CSV. Expected format:\ndate,stress_score\n2024-01-01,42');
      return;
    }

    mergeEntries(parsed);
    refresh();
    fileInput.value = '';
  };
  reader.readAsText(file);
});

clearBtn.addEventListener('click', () => {
  if (confirm('Clear all data and waypoints? This cannot be undone.')) {
    clearAll();
    selectedWaypointId = null;
    refresh();
  }
});

addWaypointBtn.addEventListener('click', () => {
  const date = wpDateInput.value;
  const label = wpLabelInput.value.trim();
  const color = wpColorInput.value;

  if (!date) {
    alert('Please select a date for the waypoint.');
    return;
  }
  if (!label) {
    alert('Please enter a label for the waypoint.');
    return;
  }

  const wp: Waypoint = {
    id: `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    label,
    color,
  };

  addWaypoint(wp);
  wpLabelInput.value = '';
  refresh();
});

function handleRemoveWaypoint(id: string): void {
  removeWaypoint(id);
  if (selectedWaypointId === id) selectedWaypointId = null;
  refresh();
}

function handleColorChange(id: string, color: string): void {
  const waypoints = getWaypoints();
  const wp = waypoints.find(w => w.id === id);
  if (wp) {
    updateWaypoint({ ...wp, color });
    refresh();
  }
}

function handleSelectWaypoint(id: string): void {
  selectedWaypointId = id;
  refresh();

  // Scroll to comparison panel
  comparisonContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Allow pressing Enter in the label field to add waypoint
wpLabelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addWaypointBtn.click();
  }
});

// ── Drag and drop support ────────────────────────────────────────

const dropZone = document.getElementById('drop-zone') as HTMLElement;

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null || !(e.relatedTarget instanceof Node) || !document.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const file = e.dataTransfer?.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result as string;
    const parsed = parseCSV(text);

    if (parsed.length === 0) {
      alert('No valid stress data found in the CSV.');
      return;
    }

    mergeEntries(parsed);
    refresh();
  };
  reader.readAsText(file);
});

// ── Init ─────────────────────────────────────────────────────────

refresh();
