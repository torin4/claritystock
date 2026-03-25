/**
 * Start of the current calendar month in UTC, as ISO 8601.
 * Use for `timestamptz` comparisons so “this month” matches server time (e.g. Vercel UTC)
 * instead of varying with the runtime’s local timezone.
 */
export function utcThisMonthStartIso(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString()
}
