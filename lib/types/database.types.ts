export type Category = 'neighborhood' | 'community' | 'amenity'
export type Role = 'photographer' | 'admin'
export type QuickFilter = 'all' | 'mine' | 'new' | 'fav'
export type SortOption = 'new' | 'used'

export interface User {
  id: string
  name: string | null
  initials: string | null
  role: Role
  avatar_url: string | null
  /** Workspace email when synced from OAuth (public.users.email). */
  email?: string | null
  created_at: string
}

export interface Collection {
  id: string
  name: string
  category: Category | null
  created_by: string | null
  created_at: string
  photo_count?: number
  photos?: Array<{ storage_path: string | null; thumbnail_path: string | null }>
}

export interface Photo {
  id: string
  title: string
  photographer_id: string | null
  collection_id: string | null
  category: Category | null
  neighborhood: string | null
  subarea: string | null
  lat: number | null
  lng: number | null
  captured_date: string | null
  tags: string[] | null
  notes: string | null
  description: string | null
  storage_path: string | null
  thumbnail_path: string | null
  downloads_count: number
  created_at: string
  // Joined fields
  photographer?: User
  collection?: Collection
  public_url?: string
  thumbnail_url?: string
  is_favorited?: boolean
  is_downloaded_by_me?: boolean
}

export interface Download {
  id: string
  photo_id: string
  downloaded_by: string
  job_ref: string | null
  created_at: string
  // Joined
  downloader?: User
  photo?: Photo
}

export interface Favorite {
  id: string
  photo_id: string
  user_id: string
  created_at: string
}

export interface PhotoFormValues {
  title: string
  category: Category | null
  collection_id: string | null
  new_collection_name: string | null
  neighborhood: string | null
  subarea: string | null
  captured_date: string | null
  tags: string[]
  notes: string | null
}

export interface AiTagResult {
  title: string
  tags: string[]
  category: Category
  description: string
}

export interface ExifResult {
  lat: number | null
  lng: number | null
}

export interface InsightsStats {
  totalPhotos: number
  totalDownloads: number
  thisMonthDownloads: number
  favoritedCount: number
}

export interface DownloadByUser {
  userId: string
  userName: string
  initials: string
  count: number
}

/** Admin team analytics — top library asset with owner. */
export interface AdminTopPhoto {
  id: string
  title: string
  downloads_count: number
  storage_path: string | null
  thumbnail_path?: string | null
  photographer?: { name: string | null; initials: string | null } | null
  collection?: { name: string } | null
}

/** Per photographer: volume in library + cumulative download counter on their photos. */
export interface PhotographerImpact {
  userId: string
  userName: string
  initials: string
  downloadUses: number
  photoCount: number
}

/** Admin roster row with aggregate photo count. */
export interface AdminUserRow {
  id: string
  name: string | null
  initials: string | null
  role: string
  created_at: string
  libraryPhotos: number
  email: string | null
}

/** Give (uploads to library) vs take (download events) — sorted worst-first for admin. */
export interface UsageLedgerRow {
  userId: string
  name: string | null
  initials: string | null
  role: string
  email: string | null
  uploads: number
  downloads: number
  /** downloads / max(uploads, 1) */
  ratio: number
}

export interface Notification {
  id: string
  photoId: string
  photoThumbUrl: string | null
  downloaderName: string
  createdAt: string
  read: boolean
}

export interface BrowseFilters {
  search: string
  category: Category | null
  neighborhood: string | null
  sort: SortOption
  quickFilter: QuickFilter
  collectionId: string | null
}
