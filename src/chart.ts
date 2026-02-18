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
import { movingAverage } from './stats';

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
  stress: '#6abf69',
  stressFill: 'rgba(106, 191, 105, 0.15)',
  ma7: '#d4a843',
  ma30: '#c07838',
  waypoint: '#e8725a',
  grid: 'rgba(232, 228, 217, 0.1)',
  text: '#e8e4d9',
  textMuted: 'rgba(232, 228, 217, 0.5)',
};

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
          borderColor: 'rgba(106, 191, 105, 0.3)',
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
