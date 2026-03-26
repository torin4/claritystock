/**
 * Applied on bulk ZIP publish when EXIF has no GPS or geocoding did not resolve a neighborhood.
 * Strip in {@link updatePhoto} when a canonical location is saved; removable in Edit.
 */
export const PHOTO_TAG_NEEDS_LOCATION = 'needs-location'
