import type { StressEntry, Segment, SegmentStats, Waypoint, WaypointComparison } from './types';

// ── Basic descriptive stats ───────────────────────────────────────

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const squaredDiffs = values.map(v => (v - m) ** 2);
  // Sample standard deviation (n-1)
  return Math.sqrt(squaredDiffs.reduce((s, v) => s + v, 0) / (values.length - 1));
}

export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return (stdDev(values) / m) * 100;
}

// ── Linear regression (OLS) ──────────────────────────────────────
// x = day index (0, 1, 2, ...), y = stress score
// Returns slope (units of stress per day)

export function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// Returns both slope and intercept for charting trendlines
export function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ── Welch's t-test ───────────────────────────────────────────────
// Two-sample t-test (unequal variances)
// Returns approximate two-tailed p-value

export function welchTTest(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 1;

  const meanA = mean(a);
  const meanB = mean(b);
  const varA = variance(a);
  const varB = variance(b);
  const nA = a.length;
  const nB = b.length;

  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) return 1;

  const t = (meanA - meanB) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = (varA / nA + varB / nB) ** 2;
  const denom = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
  const df = num / denom;

  // Approximate p-value using regularized incomplete beta function
  return tDistPValue(Math.abs(t), df) * 2; // two-tailed
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}

// Approximation of the cumulative t-distribution using the
// regularized incomplete beta function
function tDistPValue(t: number, df: number): number {
  // P(T > t) for t-distribution with df degrees of freedom
  const x = df / (df + t * t);
  return 0.5 * regularizedIncompleteBeta(x, df / 2, 0.5);
}

// Regularized incomplete beta function I_x(a, b)
// Using continued fraction approximation (Lentz's method)
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;

  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b - lnBeta
  ) / a;

  // Lentz's continued fraction
  let f = 1;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 200; m++) {
    // Even step
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= c * d;

    // Odd step
    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return front * f;
}

// Lanczos approximation of log(Gamma(x))
function logGamma(x: number): number {
  const g = 7;
  const coefs = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }

  x -= 1;
  let a = coefs[0];
  const t = x + g + 0.5;
  for (let i = 1; i < coefs.length; i++) {
    a += coefs[i] / (x + i);
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// ── Cohen's d ────────────────────────────────────────────────────

export function cohensD(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;

  const meanA = mean(a);
  const meanB = mean(b);
  const varA = variance(a);
  const varB = variance(b);

  // Pooled standard deviation
  const pooledSD = Math.sqrt(
    ((a.length - 1) * varA + (b.length - 1) * varB) /
    (a.length + b.length - 2)
  );

  if (pooledSD === 0) return 0;
  return (meanA - meanB) / pooledSD;
}

export function effectSizeLabel(d: number): string {
  const abs = Math.abs(d);
  if (abs < 0.2) return 'negligible';
  if (abs < 0.5) return 'small';
  if (abs < 0.8) return 'medium';
  return 'large';
}

export function significanceLabel(p: number): string {
  if (p < 0.001) return 'highly significant';
  if (p < 0.01) return 'very significant';
  if (p < 0.05) return 'significant';
  if (p < 0.1) return 'marginally significant';
  return 'not significant';
}

// ── Moving averages ──────────────────────────────────────────────

export function movingAverage(entries: StressEntry[], window: number): (number | null)[] {
  return entries.map((_, i) => {
    if (i < window - 1) return null;
    const slice = entries.slice(i - window + 1, i + 1).map(e => e.score);
    return mean(slice);
  });
}

// ── Segment analysis ─────────────────────────────────────────────

export function buildSegments(entries: StressEntry[], waypoints: Waypoint[]): Segment[] {
  if (entries.length === 0) return [];

  const sortedWps = [...waypoints].sort((a, b) => a.date.localeCompare(b.date));
  const segments: Segment[] = [];

  const firstDate = entries[0].date;
  const lastDate = entries[entries.length - 1].date;

  // Build boundaries: [start, wp1, wp2, ..., end]
  const boundaries = [firstDate, ...sortedWps.map(w => w.date), lastDate];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startDate = i === 0 ? boundaries[i] : boundaries[i];
    const endDate = boundaries[i + 1];

    const segEntries = entries.filter(e => {
      if (i === 0) return e.date < boundaries[1];
      if (i === boundaries.length - 2) return e.date >= boundaries[i];
      return e.date >= startDate && e.date < endDate;
    });

    if (segEntries.length === 0) continue;

    const label = i === 0
      ? `Before ${sortedWps[0]?.label || 'first waypoint'}`
      : i === boundaries.length - 2 && sortedWps.length > 0
        ? `After ${sortedWps[sortedWps.length - 1]?.label || 'last waypoint'}`
        : sortedWps[i - 1]?.label
          ? `${sortedWps[i - 1].label} to ${sortedWps[i]?.label || 'end'}`
          : `Segment ${i + 1}`;

    segments.push({
      label,
      startDate: segEntries[0].date,
      endDate: segEntries[segEntries.length - 1].date,
      entries: segEntries,
    });
  }

  // If no waypoints, return a single segment
  if (segments.length === 0) {
    segments.push({
      label: 'All Data',
      startDate: firstDate,
      endDate: lastDate,
      entries: [...entries],
    });
  }

  return segments;
}

export function computeSegmentStats(segment: Segment): SegmentStats {
  const scores = segment.entries.map(e => e.score);
  const slope = linearRegressionSlope(scores);

  return {
    label: segment.label,
    startDate: segment.startDate,
    endDate: segment.endDate,
    count: scores.length,
    mean: mean(scores),
    median: median(scores),
    stdDev: stdDev(scores),
    min: Math.min(...scores),
    max: Math.max(...scores),
    coefficientOfVariation: coefficientOfVariation(scores),
    p25: percentile(scores, 25),
    p75: percentile(scores, 75),
    trendSlope: slope,
    trendDirection: Math.abs(slope) < 0.01 ? 'flat' : slope > 0 ? 'rising' : 'falling',
  };
}

export function computeWaypointComparison(
  entries: StressEntry[],
  waypoint: Waypoint,
): WaypointComparison | null {
  const before = entries.filter(e => e.date < waypoint.date).map(e => e.score);
  const after = entries.filter(e => e.date >= waypoint.date).map(e => e.score);

  if (before.length < 2 || after.length < 2) return null;

  const beforeEntries = entries.filter(e => e.date < waypoint.date);
  const afterEntries = entries.filter(e => e.date >= waypoint.date);

  const beforeStats = computeSegmentStats({
    label: `Before ${waypoint.label}`,
    startDate: beforeEntries[0].date,
    endDate: beforeEntries[beforeEntries.length - 1].date,
    entries: beforeEntries,
  });

  const afterStats = computeSegmentStats({
    label: `After ${waypoint.label}`,
    startDate: afterEntries[0].date,
    endDate: afterEntries[afterEntries.length - 1].date,
    entries: afterEntries,
  });

  const delta = afterStats.mean - beforeStats.mean;
  const pct = beforeStats.mean !== 0 ? (delta / beforeStats.mean) * 100 : 0;
  const pValue = welchTTest(before, after);
  const d = cohensD(before, after);

  return {
    waypoint,
    before: beforeStats,
    after: afterStats,
    deltaMean: delta,
    percentChange: pct,
    tTestPValue: pValue,
    cohensD: d,
    significanceLabel: significanceLabel(pValue),
    effectSizeLabel: effectSizeLabel(d),
  };
}
