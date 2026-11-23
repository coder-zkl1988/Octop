/** Number formatting shared by enterprise surfaces (points, tokens, sizes). */

const pointsFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFmt = new Intl.NumberFormat("en-US");

/** 128450 → "128,450.00"; negative balances keep their sign. */
export function formatPoints(points: number): string {
  return pointsFmt.format(points);
}

export function formatInt(n: number): string {
  return intFmt.format(n);
}

/** 2_150_000 → "2.15M", 150_000 → "150.0K", 950 → "950". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Share of `used` in `total` as a percentage with one decimal ("41.2"). */
export function formatPercent(used: number, total: number): string {
  if (total <= 0) return "0.0";
  return ((used / total) * 100).toFixed(1);
}

/** Bytes → "1.28 GB" / "12.4 MB" / "86 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Whole minutes since an ISO timestamp (never negative). */
export function minutesSince(iso: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60_000),
  );
}
