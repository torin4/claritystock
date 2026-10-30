/**
 * Applied on bulk ZIP publish when EXIF has no GPS or geocoding did not resolve a neighborhood.
 * Strip in {@link updatePhoto} when a canonical location is saved; removable in Edit.
 */
export const PHOTO_TAG_NEEDS_LOCATION = 'needs-location'

/**
 * Add {@link PHOTO_TAG_NEEDS_LOCATION} when there is no neighborhood, drop it when
 * there is one. Shared by bulk ZIP publish and server-to-server ingest.
 */
export function withNeedsLocationTag(tags: string[], neighborhood: string | null | undefined): string[] {
  const tagsWithout = tags.filter((t) => t !== PHOTO_TAG_NEEDS_LOCATION)
  const hasLocation = Boolean(neighborhood?.trim())
  return hasLocation ? tagsWithout : [...tagsWithout, PHOTO_TAG_NEEDS_LOCATION]
}
