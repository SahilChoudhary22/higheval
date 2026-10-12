/** Placeholder for values that do not exist (not zero). */
export const MISSING = '—';
const MINUS = '−';

export function formatScore(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? MISSING : value.toFixed(digits);
}

/** Signed difference with a true minus sign, e.g. "+0.125" / "−0.125". */
export function formatSigned(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined) return MISSING;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? '+' : MINUS}${Math.abs(rounded).toFixed(digits)}`;
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? MISSING : `${String(Math.round(value * 100))}%`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return MISSING;
  if (ms < 1_000) return `${String(Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return `${String(minutes)} m ${String(seconds).padStart(2, '0')} s`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return MISSING;
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return MISSING;
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatPValue(p: number | null | undefined): string {
  if (p === null || p === undefined) return MISSING;
  return p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`;
}

export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return MISSING;
  const seconds = Math.round((now - Date.parse(iso)) / 1_000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  const days = Math.round(hours / 24);
  return `${String(days)} d ago`;
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
