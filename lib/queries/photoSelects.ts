export const BROWSE_PAGE_SIZE = 60

/**
 * Fields needed for grid cards + lightbox.
 * Intentionally excludes heavier text/location columns like notes/description/lat/lng.
 */
export const PHOTO_CARD_SELECT = `
  id,
  title,
  photographer_id,
  collection_id,
  category,
  neighborhood,
  subarea,
  captured_date,
  tags,
  storage_path,
  thumbnail_path,
  downloads_count,
  created_at,
  photographer:users!photographer_id(id, name, initials, avatar_url),
  collection:collections!collection_id(id, name, category)
`

/** Full row for edit/detail views that actually need the entire photo payload. */
export const PHOTO_DETAIL_SELECT = `
  *,
  photographer:users!photographer_id(id, name, initials, avatar_url),
  collection:collections!collection_id(id, name, category)
`
