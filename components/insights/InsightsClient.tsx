'use client'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import { useInView } from '@/lib/hooks/useInView'
import UploadModal from '@/components/modals/UploadModal'
import { PlusIcon } from '@/components/icons/PlusIcon'
import { PhotoAddIcon } from '@/components/icons/PhotoAddIcon'
import type { InsightsStats, DownloadByUser } from '@/lib/types/database.types'

interface TopPhoto {
  id: string
  title: string
  downloads_count: number
  storage_path: string | null
  thumbnail_path?: string | null
  thumbnail_url?: string | null
  public_url?: string | null
  collection?: { name: string } | null
}

interface Props {
  stats: InsightsStats
  topPhotos: TopPhoto[]
  downloadsByUser: DownloadByUser[]
  userId: string
}

const AVATAR_COLORS = [
  { bg: '#1a7a47', text: '#6ee8a2' },
  { bg: '#362a14', text: '#c49060' },
  { bg: '#16283a', text: '#6a9ec4' },
  { bg: '#2a1a28', text: '#c46a9e' },
  { bg: '#1a2832', text: '#6ab4c4' },
]

export default function InsightsClient({ stats, topPhotos, downloadsByUser, userId }: Props) {
  const router = useRouter()
  const { openUpload } = useUIStore()
  const heroCandidate = topPhotos[0] ?? null
  /** Leaderboard is sorted by downloads_count; only show hero when someone has actually downloaded. */
  const hasTopPerforming = (heroCandidate?.downloads_count ?? 0) > 0
  const heroPhoto = hasTopPerforming ? heroCandidate : null
  const maxDownloads = downloadsByUser[0]?.count ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Page header */}
      <div className="ph">
        <div>
          <div className="ph-title">Insights</div>
          <div className="ph-sub">Your Library contribution · all time</div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm btn-with-icon ph-header-upload-btn"
          onClick={openUpload}
          title="Add photos"
        >
          <span className="flex md:hidden items-center justify-center">
            <PhotoAddIcon size={18} />
            <span className="sr-only">Add photos</span>
          </span>
          <span className="hidden md:inline-flex items-center gap-1.5">
            <PlusIcon size={15} />
            Add Photos
          </span>
        </button>
      </div>

      {/* Stat cards */}
      <div
        id="insight-cards"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)', padding: '16px 20px 0' }}
      >
        <StatCard value={stats.totalPhotos} label="Photos added" />
        <StatCard value={stats.totalDownloads} label="Total downloads" />
        <StatCard value={stats.thisMonthDownloads} label="This month" />
        <StatCard value={stats.favoritedCount} label="Favorited" />
      </div>

      {/* Hero: top photo when there are downloads; otherwise explain empty state */}
      <div
        id="insights-hero"
        className={hasTopPerforming ? 'insights-hero' : 'insights-hero insights-hero--empty'}
        style={{
          margin: '14px 20px 0',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--surface-2)',
          cursor: 'default',
          border: hasTopPerforming ? undefined : '1px solid var(--border)',
        }}
      >
        {hasTopPerforming ? (
          <>
            <div className="insights-hero-bg">
              <InsightsHeroBackdrop
                storagePath={heroPhoto?.storage_path}
                initialUrl={heroPhoto?.public_url ?? null}
              />
            </div>
            <div
              className="insights-hero-overlay"
              style={{
                background:
                  'linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)',
                display: 'flex',
                alignItems: 'flex-start',
                padding: 28,
              }}
            >
              <div className="insights-hero-copy">
                <div
                  className="insights-hero-kicker"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    fontFamily: 'var(--font-mono)',
                    marginBottom: 8,
                  }}
                >
                  Your top performing photo
                </div>
                <div
                  className="insights-hero-title"
                  style={{
                    fontFamily: 'var(--font-head)',
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#fff',
                    lineHeight: 1.15,
                    marginBottom: 8,
                  }}
                >
                  {heroPhoto?.title}
                </div>
                <div
                  className="insights-hero-meta"
                  style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}
                >
                  {heroPhoto?.collection?.name ?? '—'}
                </div>
                <div className="insights-hero-dl" style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span
                    className="insights-hero-dl-num"
                    style={{
                      fontFamily: 'var(--font-head)',
                      fontSize: 48,
                      fontWeight: 700,
                      color: '#fff',
                      lineHeight: 1,
                    }}
                  >
                    {heroPhoto!.downloads_count}
                  </span>
                  <span
                    style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-mono)' }}
                  >
                    downloads
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div
            className="insights-hero-overlay insights-hero-overlay--empty"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '22px 24px 24px',
              position: 'relative',
            }}
          >
            <div className="insights-hero-copy">
              <div
                className="insights-hero-kicker"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)',
                  marginBottom: 8,
                }}
              >
                Top performing photo
              </div>
              <div
                className="insights-hero-title"
                style={{
                  fontFamily: 'var(--font-head)',
                  fontSize: 22,
                  fontWeight: 700,
                  color: 'var(--text)',
                  lineHeight: 1.2,
                  marginBottom: 8,
                }}
              >
                {!heroCandidate ? 'Nothing to show yet' : 'No downloads yet'}
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-2)',
                  lineHeight: 1.45,
                  margin: 0,
                  maxWidth: 440,
                }}
              >
                {!heroCandidate
                  ? 'Add photos to your library first. Once they’re in the pool, download counts and your leader shot will show up here.'
                  : 'None of your photos have been downloaded yet. When teammates save your work from the library, your most-used photo will appear here.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Charts row — stacks to one column on narrow screens (see globals.css) */}
      <div
        className="insights-charts-row"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '14px 20px 0' }}
      >
        {/* Who used your photos */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Who used your photos</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {stats.totalDownloads} total uses
            </span>
          </div>
          <div className="bar-chart">
            {downloadsByUser.length === 0 ? (
              <div style={{ padding: '16px 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                No downloads yet
              </div>
            ) : downloadsByUser.map((u, i) => {
              const pct = Math.round((u.count / maxDownloads) * 100)
              const colors = AVATAR_COLORS[i % AVATAR_COLORS.length]
              return (
                <div key={u.userId} className="bar-row">
                  <div
                    className="bar-av"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    {u.initials}
                  </div>
                  <div className="bar-name">{u.userName.split(' ')[0]}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${pct}%`, background: `color-mix(in srgb, var(--accent) 70%, ${colors.text})` }}
                    >
                      <span className="bar-fill-lbl">{u.count}</span>
                    </div>
                  </div>
                  <div className="bar-count" style={{ color: 'var(--text-2)' }}>{u.count}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top photos — table on desktop, full-width list on mobile */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>
            Your top photos
          </div>
          <table className="utbl insights-top-photos-table-desktop">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Collection</th>
                <th>Uses</th>
              </tr>
            </thead>
            <tbody>
              {topPhotos.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No photos yet</td></tr>
              ) : topPhotos.map(p => (
                <tr key={p.id}>
                  <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </td>
                  <td style={{ color: 'var(--text-3)' }}>{p.collection?.name ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{p.downloads_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TopPhotosMobileList photos={topPhotos} />
        </div>
      </div>

      {/* Added vs. download balance + recent activity */}
      <div
        className="insights-bottom-row"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '14px 20px 32px' }}
      >
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>
            Added vs. download balance
          </div>
          <div style={{ padding: 16 }}>
            <BalanceBar uploads={stats.totalPhotos} downloads={stats.totalDownloads} />
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>
            Recent downloads
          </div>
          <RecentActivity topPhotos={topPhotos} />
        </div>
      </div>

      <UploadModal userId={userId} onSuccess={() => router.refresh()} />
    </div>
  )
}

function TopPhotosMobileList({ photos }: { photos: TopPhoto[] }) {
  if (photos.length === 0) {
    return (
      <ul className="insights-top-photos-mobile" aria-label="Your top photos">
        <li className="insights-top-photos-mobile-empty">No photos yet</li>
      </ul>
    )
  }
  return (
    <ul className="insights-top-photos-mobile" aria-label="Your top photos">
      {photos.map(p => (
        <li key={p.id} className="insights-top-photos-mobile-row">
          <div className="insights-top-photos-mobile-main">
            <div className="insights-top-photos-mobile-title">{p.title}</div>
            <div className="insights-top-photos-mobile-coll">{p.collection?.name ?? '—'}</div>
          </div>
          <div className="insights-top-photos-mobile-uses">{p.downloads_count}</div>
        </li>
      ))}
    </ul>
  )
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-card">
      <div className="stat-val">{value.toLocaleString()}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  )
}

function BalanceBar({ uploads, downloads }: { uploads: number; downloads: number }) {
  const total = uploads + downloads || 1
  const upPct = Math.round((uploads / total) * 100)
  const dlPct = 100 - upPct

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', minWidth: 70 }}>Added</div>
        <div style={{ flex: 1, height: 20, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${upPct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', minWidth: 30, textAlign: 'right', color: 'var(--text-2)' }}>
          {uploads}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', minWidth: 70 }}>Downloads</div>
        <div style={{ flex: 1, height: 20, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${dlPct}%`, height: '100%', background: '#6a9ec4', borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', minWidth: 30, textAlign: 'right', color: 'var(--text-2)' }}>
          {downloads}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
        {downloads > 0
          ? `${(downloads / Math.max(uploads, 1)).toFixed(1)}× download ratio`
          : 'No downloads yet'}
      </div>
    </div>
  )
}

function InsightsHeroBackdrop({
  storagePath,
  initialUrl,
}: {
  storagePath: string | null | undefined
  initialUrl?: string | null
}) {
  const url = useSignedPhotoUrl(storagePath ?? null, { initialUrl })
  if (!url) return null
  return (
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `url(${url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }} />
  )
}

function RecentActivityRow({ p }: { p: TopPhoto }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const inView = useInView(rowRef, { rootMargin: '80px' })
  const path = p.thumbnail_path ?? p.storage_path
  const url = useSignedPhotoUrl(path, { enabled: inView, initialUrl: p.thumbnail_url ?? null })
  return (
    <div
      ref={rowRef}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', borderBottom: '1px solid var(--border)',
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" decoding="async" style={{ width: 36, height: 26, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 36, height: 26, borderRadius: 3, background: 'var(--surface-2)', flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.title}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {p.downloads_count} download{p.downloads_count !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

function RecentActivity({ topPhotos }: { topPhotos: TopPhoto[] }) {
  if (!topPhotos.length) {
    return (
      <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
        No recent activity
      </div>
    )
  }

  return (
    <div>
      {topPhotos.map(p => (
        <RecentActivityRow key={p.id} p={p} />
      ))}
    </div>
  )
}
