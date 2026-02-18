import type { StressEntry } from './types';

export function parseCSV(raw: string): StressEntry[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const hasHeader = header.includes('date') || header.includes('stress');

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const entries: StressEntry[] = [];

  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Support comma or tab delimited
    const parts = trimmed.split(/[,\t]/);
    if (parts.length < 2) continue;

    const dateStr = parts[0].trim();
    const scoreStr = parts[1].trim();

    // Parse date - support YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
    const date = normalizeDate(dateStr);
    const score = parseFloat(scoreStr);

    if (date && !isNaN(score) && score >= 0 && score <= 100) {
      entries.push({ date, score });
    }
  }

  // Sort by date ascending
  entries.sort((a, b) => a.date.localeCompare(b.date));

  // Deduplicate by date (keep last occurrence)
  const seen = new Map<string, StressEntry>();
  for (const entry of entries) {
    seen.set(entry.date, entry);
  }

  return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeDate(input: string): string | null {
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const d = new Date(input + 'T00:00:00');
    if (!isNaN(d.getTime())) return input;
  }

  // Try MM/DD/YYYY
  const slashMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const date = new Date(iso + 'T00:00:00');
    if (!isNaN(date.getTime())) return iso;
  }

  // Try DD-MM-YYYY or DD.MM.YYYY
  const dashDotMatch = input.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
  if (dashDotMatch) {
    const [, d, m, y] = dashDotMatch;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const date = new Date(iso + 'T00:00:00');
    if (!isNaN(date.getTime())) return iso;
  }

  return null;
}
