import { parseCSV } from './csv';
import { renderChart, destroyChart } from './chart';
import {
  getAllSeries,
  addSeries,
  removeSeries as removeSeriesFromStorage,
  updateSeries,
  getActiveSeriesId,
  setActiveSeriesId,
  deduplicateSeriesName,
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
  renderSeriesList,
} from './ui';
import type { Series, Waypoint } from './types';
import './style.css';

// ── Default series colors (cycled on upload) ─────────────────────

const SERIES_PALETTE = ['#56b4e9', '#e69f00', '#009e73', '#cc79a7', '#0072b2'];

function nextSeriesColor(): string {
  const series = getAllSeries();
  const usedColors = new Set(series.map(s => s.color));
  for (const c of SERIES_PALETTE) {
    if (!usedColors.has(c)) return c;
  }
  return SERIES_PALETTE[series.length % SERIES_PALETTE.length];
}

// ── DOM references ───────────────────────────────────────────────

const fileInput = document.getElementById('csv-upload') as HTMLInputElement;
const uploadBtn = document.getElementById('btn-upload') as HTMLButtonElement;
const clearBtn = document.getElementById('btn-clear') as HTMLButtonElement;
const chartCanvas = document.getElementById('stress-chart') as HTMLCanvasElement;
const seriesContainer = document.getElementById('series-list') as HTMLElement;
const segmentContainer = document.getElementById('segment-cards') as HTMLElement;
const waypointContainer = document.getElementById('waypoint-list') as HTMLElement;
const comparisonContainer = document.getElementById('comparison-panel') as HTMLElement;
const addWaypointBtn = document.getElementById('btn-add-waypoint') as HTMLButtonElement;
const wpDateInput = document.getElementById('wp-date') as HTMLInputElement;
const wpLabelInput = document.getElementById('wp-label') as HTMLInputElement;
const wpColorInput = document.getElementById('wp-color') as HTMLInputElement;
const dataStatus = document.getElementById('data-status') as HTMLElement;
const comparisonTitle = document.getElementById('comparison-title') as HTMLElement;
const fredBtn = document.getElementById('fred-btn') as HTMLButtonElement | null;

// ── State ────────────────────────────────────────────────────────

let selectedWaypointId: string | null = null;
let fredPhrasePool: string[] = [];

const FRED_PHRASES = [
  'You are doing better than you think.',
  'One tiny step still counts as progress.',
  'You survived one hundred percent of your hardest days.',
  'Keep going, your future self is cheering for you.',
  'You do not need perfect. You need consistent.',
  'You can do hard things, especially this one.',
  'Breathe in, shoulders down, onward.',
  'Today is a great day to start small and win big.',
  'Momentum beats motivation. Keep moving.',
  'You have got this. Truly.',
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function nextFredPhrase(): string {
  if (fredPhrasePool.length === 0) {
    fredPhrasePool = shuffle(FRED_PHRASES);
  }
  return fredPhrasePool.pop() || FRED_PHRASES[0];
}

function speakFredPhrase(text: string): void {
  if (!('speechSynthesis' in window)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => /^en(-|_)/i.test(v.lang));
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = 0.96;
  utterance.pitch = 1.06;
  utterance.volume = 0.95;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function launchFredConfetti(originX: number, originY: number): void {
  const colors = ['#56b4e9', '#e69f00', '#009e73', '#cc79a7', '#f2efe6'];
  const pieces: {
    el: HTMLSpanElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vr: number;
  }[] = [];

  for (let i = 0; i < 36; i += 1) {
    const el = document.createElement('span');
    el.className = 'fred-confetti';
    const size = 6 + Math.random() * 6;
    el.style.width = `${size}px`;
    el.style.height = `${size * 1.4}px`;
    el.style.background = colors[i % colors.length];
    document.body.appendChild(el);

    const angle = (Math.PI * 2 * i) / 36 + (Math.random() - 0.5) * 0.35;
    const speed = 2 + Math.random() * 4;
    pieces.push({
      el,
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.2,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 22,
    });
  }

  let ticks = 0;
  const gravity = 0.14;

  const step = () => {
    ticks += 1;
    for (const p of pieces) {
      p.vy += gravity;
      p.vx *= 0.99;
      p.vy *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`;
      p.el.style.opacity = `${Math.max(0, 1 - ticks / 90)}`;
    }

    if (ticks < 90) {
      requestAnimationFrame(step);
    } else {
      for (const p of pieces) p.el.remove();
    }
  };

  requestAnimationFrame(step);
}

// ── Render everything ────────────────────────────────────────────

function refresh(): void {
  const seriesList = getAllSeries();
  let activeId = getActiveSeriesId();
  if (!activeId && seriesList.length > 0) {
    activeId = seriesList[0].id;
    setActiveSeriesId(activeId);
  }
  const waypoints = getWaypoints();
  const activeSeries = seriesList.find(s => s.id === activeId) ?? null;

  // Status
  const totalDays = seriesList.reduce((sum, s) => sum + s.entries.length, 0);
  if (totalDays > 0) {
    dataStatus.textContent = `${seriesList.length} series, ${totalDays} total days`;
    dataStatus.className = 'data-status has-data';
  } else {
    dataStatus.textContent = 'No data loaded';
    dataStatus.className = 'data-status no-data';
  }

  // Series list
  renderSeriesList(seriesContainer, seriesList, activeId, {
    onRename: handleSeriesRename,
    onColorChange: handleSeriesColorChange,
    onSetActive: handleSetActive,
    onRemove: handleSeriesRemove,
  });

  // Chart
  if (activeSeries && activeSeries.entries.length > 0) {
    renderChart(chartCanvas, seriesList, activeId, waypoints);
  } else {
    destroyChart();
  }

  // Segments & comparison use the active series
  if (activeSeries && activeSeries.entries.length > 0) {
    const segments = buildSegments(activeSeries.entries, waypoints);
    const segStats = segments.map(computeSegmentStats);
    renderSegmentCards(segmentContainer, segStats);
  } else {
    renderSegmentCards(segmentContainer, []);
  }

  // Waypoint list
  renderWaypointList(waypointContainer, waypoints, handleRemoveWaypoint, handleSelectWaypoint, handleWaypointColorChange);

  // Comparison
  if (selectedWaypointId && activeSeries) {
    const wp = waypoints.find(w => w.id === selectedWaypointId);
    if (wp) {
      comparisonTitle.textContent = `Comparing: ${wp.label} (${activeSeries.name})`;
      const comparison = computeWaypointComparison(activeSeries.entries, wp);
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

  // Update waypoint date input range using all series dates
  const allDates = seriesList.flatMap(s => s.entries.map(e => e.date)).sort();
  if (allDates.length > 0) {
    wpDateInput.min = allDates[0];
    wpDateInput.max = allDates[allDates.length - 1];
  }
}

// ── CSV upload → create series ───────────────────────────────────

function handleCSVUpload(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result as string;
    const parsed = parseCSV(text);

    if (parsed.length === 0) {
      alert('No valid stress data found in the CSV. Expected format:\ndate,stress_score\n2024-01-01,42');
      return;
    }

    // Derive name from filename, deduplicate
    const baseName = file.name.replace(/\.\w+$/, '') || 'Data';
    const name = deduplicateSeriesName(baseName);

    const series: Series = {
      id: `series-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      color: nextSeriesColor(),
      entries: parsed.sort((a, b) => a.date.localeCompare(b.date)),
      visible: true,
    };

    addSeries(series);
    refresh();
  };
  reader.readAsText(file);
}

// ── Series handlers ──────────────────────────────────────────────

function handleSeriesRename(id: string, name: string): void {
  const seriesList = getAllSeries();
  const s = seriesList.find(s => s.id === id);
  if (s) {
    updateSeries({ ...s, name });
    refresh();
  }
}

function handleSeriesColorChange(id: string, color: string): void {
  const seriesList = getAllSeries();
  const s = seriesList.find(s => s.id === id);
  if (s) {
    updateSeries({ ...s, color });
    refresh();
  }
}

function handleSetActive(id: string): void {
  setActiveSeriesId(id);
  refresh();
}

function handleSeriesRemove(id: string): void {
  if (!confirm('Remove this data series? This cannot be undone.')) return;
  removeSeriesFromStorage(id);
  refresh();
}

// ── Event handlers ───────────────────────────────────────────────

uploadBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  handleCSVUpload(file);
  fileInput.value = '';
});

clearBtn.addEventListener('click', () => {
  if (confirm('Clear all data, series, and waypoints? This cannot be undone.')) {
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

function handleWaypointColorChange(id: string, color: string): void {
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
  handleCSVUpload(file);
});

if (fredBtn) {
  fredBtn.addEventListener('click', () => {
    const rect = fredBtn.getBoundingClientRect();
    launchFredConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
    speakFredPhrase(nextFredPhrase());
  });
}

// ── Init ─────────────────────────────────────────────────────────

refresh();
