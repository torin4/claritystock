/** Alphabetical by display name (case- and numeric-aware). */
export function sortCollectionsByName<T extends { name: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, {
      sensitivity: 'base',
      numeric: true,
    }),
  )
}
