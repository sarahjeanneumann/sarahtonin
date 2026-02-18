export interface StressEntry {
  date: string; // ISO date string YYYY-MM-DD
  score: number;
}

export interface Waypoint {
  id: string;
  date: string; // ISO date string YYYY-MM-DD
  label: string;
  color?: string;
}

export interface Segment {
  label: string;
  startDate: string;
  endDate: string;
  entries: StressEntry[];
}

export interface SegmentStats {
  label: string;
  startDate: string;
  endDate: string;
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  coefficientOfVariation: number;
  p25: number;
  p75: number;
  trendSlope: number; // positive = increasing stress
  trendDirection: 'rising' | 'falling' | 'flat';
}

export interface WaypointComparison {
  waypoint: Waypoint;
  before: SegmentStats;
  after: SegmentStats;
  deltaMean: number;
  percentChange: number;
  tTestPValue: number;
  cohensD: number;
  significanceLabel: string;
  effectSizeLabel: string;
}

export interface Series {
  id: string;
  name: string;
  color: string;
  entries: StressEntry[];
  visible: boolean;
}

export interface AppState {
  series: Series[];
  waypoints: Waypoint[];
  activeSeriesId: string | null;
}
