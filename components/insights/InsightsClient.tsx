'use client'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import { useInView } from '@/lib/hooks/useInView'
import UploadModal from '@/components/modals/UploadModal'
import { PlusIcon } from '@/components/icons/PlusIcon'
import { PhotoAddIcon } from '@/components/icons/PhotoAddIcon'
import type { InsightsStats, DownloadByUser, TopContributor } from '@/lib/types/database.types'

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

type InsightsRangeBundle = {
  stats: InsightsStats
  downloadsByUser: DownloadByUser[]
  topPhotos: TopPhoto[]
}

interface Props {
  allTime: InsightsRangeBundle
  thisMonth: InsightsRangeBundle
  topContributors: TopContributor[]
  userId: string
}

type RangeKey = 'all' | 'month'

const AVATAR_COLORS = [
  { bg: '#1a7a47', text: '#6ee8a2' },
  { bg: '#362a14', text: '#c49060' },
  { bg: '#16283a', text: '#6a9ec4' },
  { bg: '#2a1a28', text: '#c46a9e' },
  { bg: '#1a2832', text: '#6ab4c4' },
]

export default function InsightsClient({ allTime, thisMonth, topContributors, userId }: Props) {
  const router = useRouter()
  const { openUpload } = useUIStore()
  const [range, setRange] = useState<RangeKey>('all')
  const active = range === 'all' ? allTime : thisMonth
  const { stats, topPhotos, downloadsByUser } = active

  const heroCandidate = topPhotos[0] ?? null
  /** Leaderboard is sorted by downloads_count (all-time totals or uses in the selected month). */
  const hasTopPerforming = (heroCandidate?.downloads_count ?? 0) > 0
  const heroPhoto = hasTopPerforming ? heroCandidate : null
  const maxDownloads = Math.max(1, downloadsByUser[0]?.count ?? 1)

  const downloaderCount = downloadsByUser.length
  const usesSubtitle = range === 'all' ? 'All time · per teammate' : 'UTC month · per teammate'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Page header */}
      <div className="ph">
        <div>
          <div className="ph-title">Insights</div>
          <div className="ph-sub">
            Your library contribution ·{' '}
            {range === 'all' ? 'Lifetime totals below' : 'Current UTC month only'}
          </div>
          <div className="browse-mode-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className={`browse-mode-btn ${range === 'all' ? 'active' : ''}`}
              onClick={() => setRange('all')}
            >
              All time
            </button>
            <button
              type="button"
              className={`browse-mode-btn ${range === 'month' ? 'active' : ''}`}
              onClick={() => setRange('month')}
            >
              This month
            </button>
          </div>
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
        <StatCard
          value={stats.totalPhotos}
          label={range === 'all' ? 'Photos in library' : 'Photos uploaded'}
        />
        <StatCard
          value={stats.totalDownloads}
          label={range === 'all' ? 'Total uses' : 'Uses this month'}
        />
        <StatCard value={downloaderCount} label="Downloaders" />
        <StatCard
          value={stats.favoritedCount}
          label={range === 'all' ? 'Your favorites' : 'Favorites added'}
        />
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
                  {range === 'all' ? 'Your top performing photo' : 'Your top photo this month'}
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
                    {range === 'all' ? 'downloads' : 'uses'}
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
                {!heroCandidate
                  ? 'Nothing to show yet'
                  : range === 'month'
                    ? 'No downloads this month'
                    : 'No downloads yet'}
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
                  : range === 'month'
                    ? 'No one downloaded your photos during the current UTC month yet. Switch to All time to see lifetime performance.'
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
              {usesSubtitle}
            </span>
          </div>
          <div className="bar-chart">
            {downloadsByUser.length === 0 ? (
              <div style={{ padding: '16px 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                {range === 'month' ? 'No downloads this month' : 'No downloads yet'}
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
            {range === 'all' ? 'Your top photos' : 'Top photos this month'}
          </div>
          <table className="utbl insights-top-photos-table-desktop">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Collection</th>
                <th>{range === 'all' ? 'Uses' : 'Uses (month)'}</th>
              </tr>
            </thead>
            <tbody>
              {topPhotos.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                    {range === 'month' ? 'No download activity on your photos this month' : 'No photos yet'}
                  </td>
                </tr>
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
          <TopPhotosMobileList photos={topPhotos} range={range} />
        </div>
      </div>

      {/* Top contributors + recent activity */}
      <div
        className="insights-bottom-row"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '14px 20px 32px' }}
      >
        <div
          className="insights-top-contributors-card"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>Top contributors</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              By total uses · all time
            </span>
          </div>
          <TopContributorsPanel contributors={topContributors} currentUserId={userId} />
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>
            {range === 'all' ? 'Recent activity' : 'Spotlight'}
          </div>
          <RecentActivity topPhotos={topPhotos} range={range} />
        </div>
      </div>

      <UploadModal userId={userId} onSuccess={() => router.refresh()} />
    </div>
  )
}

function TopPhotosMobileList({ photos, range }: { photos: TopPhoto[]; range: RangeKey }) {
  const label = range === 'all' ? 'Your top photos' : 'Top photos this month'
  if (photos.length === 0) {
    return (
      <ul className="insights-top-photos-mobile" aria-label={label}>
        <li className="insights-top-photos-mobile-empty">
          {range === 'month' ? 'No download activity this month' : 'No photos yet'}
        </li>
      </ul>
    )
  }
  return (
    <ul className="insights-top-photos-mobile" aria-label={label}>
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

function TopContributorsPanel({
  contributors,
  currentUserId,
}: {
  contributors: TopContributor[]
  currentUserId: string
}) {
  const maxUses = contributors[0]?.downloadUses ?? 1

  if (contributors.length === 0) {
    return (
      <div style={{ padding: '16px 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
        No contributors yet
      </div>
    )
  }

  return (
    <div className="bar-chart insights-top-contributors-chart">
      {contributors.map((c, i) => {
        const pct = Math.round((c.downloadUses / maxUses) * 100)
        const colors = AVATAR_COLORS[i % AVATAR_COLORS.length]
        const isYou = c.userId === currentUserId
        return (
          <div
            key={c.userId}
            className={`bar-row insights-contributor-row${isYou ? ' insights-contributor-row--you' : ''}`}
          >
            <div
              className="bar-av"
              style={{ background: colors.bg, color: colors.text }}
            >
              {c.initials}
            </div>
            <div className="bar-name insights-contributor-name">
              <div className="insights-contributor-name-line">
                <span>{c.userName.split(' ')[0]}</span>
                {isYou ? <span className="insights-contributor-you-badge">You</span> : null}
              </div>
              <div className="insights-contributor-meta">
                {c.photoCount} photo{c.photoCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${pct}%`, background: `color-mix(in srgb, var(--accent) 70%, ${colors.text})` }}
              >
                <span className="bar-fill-lbl">{c.downloadUses}</span>
              </div>
            </div>
            <div className="bar-count" style={{ color: 'var(--text-2)' }}>{c.downloadUses}</div>
          </div>
        )
      })}
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

function RecentActivityRow({ p, range }: { p: TopPhoto; range: RangeKey }) {
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
          {p.downloads_count} {range === 'all' ? 'download' : 'use'}
          {p.downloads_count !== 1 ? 's' : ''}
          {range === 'month' ? ' this month' : ''}
        </div>
      </div>
    </div>
  )
}

function RecentActivity({ topPhotos, range }: { topPhotos: TopPhoto[]; range: RangeKey }) {
  if (!topPhotos.length) {
    return (
      <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
        {range === 'all' ? 'No recent activity' : 'No activity this month'}
      </div>
    )
  }

  return (
    <div>
      {topPhotos.map(p => (
        <RecentActivityRow key={p.id} p={p} range={range} />
      ))}
    </div>
  )
}
