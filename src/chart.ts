import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import 'chartjs-adapter-date-fns';
import type { Series, Waypoint } from './types';
import { movingAverage, buildSegments, linearRegression } from './stats';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  Legend,
  annotationPlugin,
);

let chartInstance: Chart | null = null;

const COLORS = {
  waypoint: '#f08068',
  grid: 'rgba(242, 239, 230, 0.08)',
  text: '#f2efe6',
  textMuted: 'rgba(242, 239, 230, 0.5)',
};

const TREND_COLORS = {
  rising: '#44ff44',
  falling: '#ff4444',
  flat: 'rgba(242, 239, 230, 0.45)',
};

/**
 * Lighten a hex color by mixing with white.
 * amount: 0 = original, 1 = white
 */
function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function renderChart(
  canvas: HTMLCanvasElement,
  seriesList: Series[],
  activeSeriesId: string | null,
  waypoints: Waypoint[],
): void {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const visibleSeries = seriesList.filter(s => s.visible);
  if (visibleSeries.length === 0) return;

  // Build a unified date label axis from all visible series
  const allDatesSet = new Set<string>();
  for (const s of visibleSeries) {
    for (const e of s.entries) allDatesSet.add(e.date);
  }
  const labels = Array.from(allDatesSet).sort();
  const totalDays = labels.length;

  // Create a date-to-index map
  const dateIndex = new Map<string, number>();
  labels.forEach((d, i) => dateIndex.set(d, i));

  const activeSeries = seriesList.find(s => s.id === activeSeriesId && s.visible) ?? null;

  // ── Build datasets ──────────────────────────────────────────

  const datasets: any[] = [];

  // One dataset per visible series
  for (const s of visibleSeries) {
    const data: (number | null)[] = new Array(labels.length).fill(null);
    for (const e of s.entries) {
      const idx = dateIndex.get(e.date);
      if (idx !== undefined) data[idx] = e.score;
    }

    const isActive = s.id === activeSeriesId;

    datasets.push({
      label: s.name,
      data,
      borderColor: s.color,
      backgroundColor: hexToRgba(s.color, 0.12),
      borderWidth: isActive ? 1.5 : 1,
      pointRadius: s.entries.length > 90 ? 0 : (isActive ? 2 : 1),
      pointHoverRadius: 4,
      fill: isActive && visibleSeries.length === 1,
      tension: 0.2,
      order: isActive ? 3 : 4,
      spanGaps: false,
    });
  }

  // MAs and trendlines only for the active series
  if (activeSeries) {
    const ma7 = movingAverage(activeSeries.entries, 7);
    const ma30 = movingAverage(activeSeries.entries, 30);

    // Map MA values onto the unified label axis
    const ma7Data: (number | null)[] = new Array(labels.length).fill(null);
    const ma30Data: (number | null)[] = new Array(labels.length).fill(null);
    activeSeries.entries.forEach((e, i) => {
      const idx = dateIndex.get(e.date);
      if (idx !== undefined) {
        ma7Data[idx] = ma7[i];
        ma30Data[idx] = ma30[i];
      }
    });

    const ma7Color = lightenColor(activeSeries.color, 0.3);
    const ma30Color = lightenColor(activeSeries.color, 0.5);

    datasets.push(
      {
        label: '7-Day Avg',
        data: ma7Data,
        borderColor: ma7Color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
        fill: false,
        tension: 0.3,
        order: 2,
        spanGaps: false,
      },
      {
        label: '30-Day Avg',
        data: ma30Data,
        borderColor: ma30Color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
        fill: false,
        tension: 0.3,
        borderDash: [4, 2],
        order: 1,
        spanGaps: false,
      },
    );

    // Per-segment trendlines for active series
    const segments = buildSegments(activeSeries.entries, waypoints);
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (seg.entries.length < 2) continue;

      const segScores = seg.entries.map(e => e.score);
      const { slope, intercept } = linearRegression(segScores);
      const yStart = intercept;
      const yEnd = intercept + slope * (segScores.length - 1);

      const trendData: (number | null)[] = new Array(labels.length).fill(null);
      const startIdx = dateIndex.get(seg.entries[0].date);
      const endIdx = dateIndex.get(seg.entries[seg.entries.length - 1].date);
      if (startIdx !== undefined) trendData[startIdx] = yStart;
      if (endIdx !== undefined) trendData[endIdx] = yEnd;

      const trendColor = Math.abs(slope) < 0.01 ? TREND_COLORS.flat
        : slope > 0 ? TREND_COLORS.rising : TREND_COLORS.falling;

      datasets.push({
        label: si === 0 ? 'Trend' : '',
        data: trendData,
        borderColor: trendColor,
        borderWidth: 2,
        borderDash: [8, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
        spanGaps: true,
        order: 0,
        isTrendline: true,
      });
    }
  }

  // ── Build waypoint annotations ──────────────────────────────

  const annotations: Record<string, object> = {};
  for (const wp of waypoints) {
    annotations[`wp-${wp.id}`] = {
      type: 'line' as const,
      xMin: wp.date,
      xMax: wp.date,
      borderColor: wp.color || COLORS.waypoint,
      borderWidth: 2,
      label: {
        display: true,
        content: wp.label,
        position: 'start' as const,
        backgroundColor: 'rgba(20, 40, 20, 0.9)',
        color: COLORS.text,
        font: {
          family: "'Futura', 'Nunito Sans', sans-serif",
          size: 11,
        },
        padding: { top: 4, bottom: 4, left: 6, right: 6 },
      },
    };
  }

  // ── Create chart ────────────────────────────────────────────

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: totalDays > 180 ? 'month' : totalDays > 30 ? 'week' : 'day',
            displayFormats: {
              day: 'MMM d',
              week: 'MMM d',
              month: 'MMM yyyy',
            },
          },
          grid: {
            color: COLORS.grid,
          },
          ticks: {
            color: COLORS.textMuted,
            font: {
              family: "'Futura', 'Nunito Sans', sans-serif",
              size: 11,
            },
            maxRotation: 45,
          },
        },
        y: {
          min: 0,
          max: 100,
          grid: {
            color: COLORS.grid,
          },
          ticks: {
            color: COLORS.textMuted,
            font: {
              family: "'Futura', 'Nunito Sans', sans-serif",
              size: 11,
            },
          },
          title: {
            display: true,
            text: 'Stress Score',
            color: COLORS.text,
            font: {
              family: "'Futura', 'Nunito Sans', sans-serif",
              size: 13,
            },
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: COLORS.text,
            font: {
              family: "'Futura', 'Nunito Sans', sans-serif",
              size: 12,
            },
            usePointStyle: true,
            pointStyle: 'line',
            filter: (item) => {
              return item.text !== '';
            },
          },
          onClick: (_evt, legendItem, legend) => {
            const chart = legend.chart;
            const ci = legendItem.datasetIndex!;
            const clickedDataset = chart.data.datasets[ci] as any;

            if (clickedDataset.isTrendline) {
              const trendVisible = chart.isDatasetVisible(ci);
              chart.data.datasets.forEach((ds: any, idx: number) => {
                if (ds.isTrendline) {
                  chart.setDatasetVisibility(idx, !trendVisible);
                }
              });
            } else {
              chart.setDatasetVisibility(ci, !chart.isDatasetVisible(ci));
            }
            chart.update();
          },
        },
        tooltip: {
          backgroundColor: 'rgba(20, 40, 20, 0.95)',
          titleColor: '#f0c050',
          bodyColor: COLORS.text,
          titleFont: {
            family: "'Futura', 'Nunito Sans', sans-serif",
          },
          bodyFont: {
            family: "'SF Mono', 'Fira Code', monospace",
          },
          borderColor: 'rgba(126, 216, 126, 0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y;
              if (val === null || val === undefined) return '';
              return ` ${ctx.dataset.label}: ${val.toFixed(1)}`;
            },
          },
        },
        annotation: {
          annotations,
        },
      },
    },
  });
}

export function destroyChart(): void {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}
