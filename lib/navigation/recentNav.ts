import type { Collection } from '@/lib/types/database.types'
import type { SidebarPhotoRow } from '@/lib/queries/sidebarRecents.queries'

export type RecentNavCollectionItem = {
  kind: 'collection'
  id: string
  name: string
  at: string
  photos: Collection['photos']
}

export type RecentNavPhotoItem = {
  kind: 'photo'
  id: string
  title: string
  collectionId: string | null
  at: string
  thumbnail_path: string | null
  storage_path: string | null
  thumbnail_url?: string | null
}

export type RecentNavItem = RecentNavCollectionItem | RecentNavPhotoItem

function collectionLastActivity(c: Collection): string {
  const p0 = c.photos?.[0] as { created_at?: string } | undefined
  const pAt = p0?.created_at
  if (pAt && c.created_at) return pAt > c.created_at ? pAt : c.created_at
  return pAt ?? c.created_at
}

export function mergeRecentNavItems(
  collections: Collection[],
  photos: Array<SidebarPhotoRow & { thumbnail_url?: string | null }>,
  limit: number,
): RecentNavItem[] {
  const cItems: RecentNavItem[] = collections.map((c) => ({
    kind: 'collection',
    id: c.id,
    name: c.name,
    at: collectionLastActivity(c),
    photos: c.photos,
  }))
  const pItems: RecentNavItem[] = photos.map((p) => ({
    kind: 'photo',
    id: p.id,
    title: p.title?.trim() ? p.title : 'Untitled',
    collectionId: p.collection_id,
    at: p.created_at,
    thumbnail_path: p.thumbnail_path,
    storage_path: p.storage_path,
    thumbnail_url: p.thumbnail_url,
  }))
  return [...cItems, ...pItems]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
}
