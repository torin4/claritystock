'use client'
import { useRef } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import { useInView } from '@/lib/hooks/useInView'
import UploadModal from '@/components/modals/UploadModal'
import { PlusIcon } from '@/components/icons/PlusIcon'
import type { InsightsStats, DownloadByUser } from '@/lib/types/database.types'

interface TopPhoto {
  id: string
  title: string
  downloads_count: number
  storage_path: string | null
  thumbnail_path?: string | null
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
  const { openUpload } = useUIStore()
  const heroPhoto = topPhotos[0] ?? null
  const maxDownloads = downloadsByUser[0]?.count ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Page header */}
      <div className="ph">
        <div>
          <div className="ph-title">Insights</div>
          <div className="ph-sub">Your Library contribution · all time</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={openUpload}>
          <PlusIcon size={15} />
          Add Photos
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

      {/* Hero: top photo */}
      <div
        id="insights-hero"
        style={{
          margin: '14px 20px 0', borderRadius: 10, overflow: 'hidden',
          position: 'relative', height: 220, background: 'var(--surface-2)', cursor: 'pointer',
        }}
      >
        <InsightsHeroBackdrop storagePath={heroPhoto?.storage_path} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
          display: 'flex', alignItems: 'center', padding: 28,
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 8,
            }}>
              Your top performing photo
            </div>
            <div style={{
              fontFamily: 'var(--font-head)', fontSize: 28, fontWeight: 700,
              color: '#fff', lineHeight: 1.1, marginBottom: 8,
            }}>
              {heroPhoto?.title ?? 'No photos yet'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
              {heroPhoto?.collection?.name ?? '—'}
            </div>
            {heroPhoto && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: 48, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {heroPhoto.downloads_count}
                </span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-mono)' }}>
                  downloads
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '14px 20px 0' }}>
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

        {/* Top photos */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>
            Your top photos
          </div>
          <table className="utbl">
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
        </div>
      </div>

      {/* Added vs. download balance + recent activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '14px 20px 32px' }}>
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

      <UploadModal userId={userId} onSuccess={() => window.location.reload()} />
    </div>
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

function InsightsHeroBackdrop({ storagePath }: { storagePath: string | null | undefined }) {
  const url = useSignedPhotoUrl(storagePath ?? null)
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
  const url = useSignedPhotoUrl(path, { enabled: inView })
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
