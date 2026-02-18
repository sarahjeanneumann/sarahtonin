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
import type { StressEntry, Waypoint } from './types';
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
  stress: '#7ed87e',
  stressFill: 'rgba(126, 216, 126, 0.12)',
  ma7: '#f0c050',
  ma30: '#6ab8d4',
  waypoint: '#f08068',
  grid: 'rgba(242, 239, 230, 0.08)',
  text: '#f2efe6',
  textMuted: 'rgba(242, 239, 230, 0.5)',
};

const TREND_COLORS = ['#b8a0d8', '#f08068', '#6ab8d4', '#f0c050', '#7ed87e'];

export function renderChart(
  canvas: HTMLCanvasElement,
  entries: StressEntry[],
  waypoints: Waypoint[],
): void {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (entries.length === 0) return;

  const labels = entries.map(e => e.date);
  const scores = entries.map(e => e.score);
  const ma7 = movingAverage(entries, 7);
  const ma30 = movingAverage(entries, 30);

  // Build per-segment trendline datasets
  const segments = buildSegments(entries, waypoints);
  const trendDatasets: Array<{
    label: string;
    data: (number | null)[];
    borderColor: string;
    borderWidth: number;
    borderDash: number[];
    pointRadius: number;
    pointHoverRadius: number;
    fill: boolean;
    tension: number;
    spanGaps: boolean;
    order: number;
    isTrendline: boolean;
  }> = [];

  // Create a date-to-index map for fast lookup
  const dateIndex = new Map<string, number>();
  labels.forEach((d, i) => dateIndex.set(d, i));

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (seg.entries.length < 2) continue;

    const segScores = seg.entries.map(e => e.score);
    const { slope, intercept } = linearRegression(segScores);
    const yStart = intercept;
    const yEnd = intercept + slope * (segScores.length - 1);

    // Build a sparse data array: null everywhere except the segment endpoints
    const trendData: (number | null)[] = new Array(labels.length).fill(null);
    const startIdx = dateIndex.get(seg.entries[0].date);
    const endIdx = dateIndex.get(seg.entries[seg.entries.length - 1].date);
    if (startIdx !== undefined) trendData[startIdx] = yStart;
    if (endIdx !== undefined) trendData[endIdx] = yEnd;

    const color = TREND_COLORS[si % TREND_COLORS.length];

    trendDatasets.push({
      label: si === 0 ? 'Trend' : '',
      data: trendData,
      borderColor: color,
      borderWidth: 2,
      borderDash: [8, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: true,
      order: 0,
      // Custom metadata to identify trendline datasets
      isTrendline: true,
    });
  }

  // Build waypoint annotation lines
  const annotations: Record<string, object> = {};
  for (const wp of waypoints) {
    annotations[`wp-${wp.id}`] = {
      type: 'line' as const,
      xMin: wp.date,
      xMax: wp.date,
      borderColor: wp.color || COLORS.waypoint,
      borderWidth: 2,
      borderDash: [6, 4],
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

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Daily Stress',
          data: scores,
          borderColor: COLORS.stress,
          backgroundColor: COLORS.stressFill,
          borderWidth: 1.5,
          pointRadius: entries.length > 90 ? 0 : 2,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.2,
          order: 3,
        },
        {
          label: '7-Day Avg',
          data: ma7,
          borderColor: COLORS.ma7,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          fill: false,
          tension: 0.3,
          order: 2,
        },
        {
          label: '30-Day Avg',
          data: ma30,
          borderColor: COLORS.ma30,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          fill: false,
          tension: 0.3,
          borderDash: [4, 2],
          order: 1,
        },
        ...trendDatasets,
      ],
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
            unit: entries.length > 180 ? 'month' : entries.length > 30 ? 'week' : 'day',
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
              // Hide unlabeled trendline datasets from the legend
              return item.text !== '';
            },
          },
          onClick: (_evt, legendItem, legend) => {
            const chart = legend.chart;
            const ci = legendItem.datasetIndex!;
            const clickedDataset = chart.data.datasets[ci] as any;

            if (clickedDataset.isTrendline) {
              // Toggle ALL trendline datasets together
              const trendVisible = chart.isDatasetVisible(ci);
              chart.data.datasets.forEach((ds: any, idx: number) => {
                if (ds.isTrendline) {
                  chart.setDatasetVisibility(idx, !trendVisible);
                }
              });
            } else {
              // Default toggle behavior for non-trendline datasets
              chart.setDatasetVisibility(ci, !chart.isDatasetVisible(ci));
            }
            chart.update();
          },
        },
        tooltip: {
          backgroundColor: 'rgba(20, 40, 20, 0.95)',
          titleColor: COLORS.ma7,
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
