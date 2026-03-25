'use client'

import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import type { UsageAlertConfig } from '@/lib/admin/usageAlert'
import AdminPennyJarBandit from '@/components/admin/AdminPennyJarBandit'
import type {
  AdminTopPhoto,
  AdminUserRow,
  DownloadByUser,
  InsightsStats,
  PhotographerImpact,
  UsageLedgerRow,
} from '@/lib/types/database.types'

const AVATAR_COLORS = [
  { bg: '#1a7a47', text: '#6ee8a2' },
  { bg: '#362a14', text: '#c49060' },
  { bg: '#16283a', text: '#6a9ec4' },
  { bg: '#2a1a28', text: '#c46a9e' },
  { bg: '#1a2832', text: '#6ab4c4' },
]

interface Props {
  stats: InsightsStats
  topPhotos: AdminTopPhoto[]
  downloadsByDownloader: DownloadByUser[]
  photographerImpact: PhotographerImpact[]
  userRows: AdminUserRow[]
  teamSummary: { memberCount: number; adminCount: number }
  usageLedger: UsageLedgerRow[]
  usageAlert: UsageAlertConfig
}

export default function AdminTeamAnalytics({
  stats,
  topPhotos,
  downloadsByDownloader,
  photographerImpact,
  userRows,
  teamSummary,
  usageLedger,
  usageAlert,
}: Props) {
  const heroCandidate = topPhotos[0] ?? null
  const hasTopPerforming = (heroCandidate?.downloads_count ?? 0) > 0
  const heroPhoto = hasTopPerforming ? heroCandidate : null
  const maxDownloader = downloadsByDownloader[0]?.count ?? 1
  const maxImpact = photographerImpact[0]?.downloadUses ?? 1

  return (
    <div className="admin-analytics-page">
      <div className="ph">
        <div>
          <div className="ph-title">Admin</div>
          <div className="ph-sub">
            Team-wide library analytics · {teamSummary.memberCount} member{teamSummary.memberCount !== 1 ? 's' : ''}
            {teamSummary.adminCount > 0 ? ` · ${teamSummary.adminCount} admin${teamSummary.adminCount !== 1 ? 's' : ''}` : ''}
          </div>
        </div>
      </div>

      <div id="admin-insight-cards" className="admin-stat-grid">
        <StatCard value={stats.totalPhotos} label="Photos in library" />
        <StatCard value={stats.totalDownloads} label="Total downloads" />
        <StatCard value={stats.thisMonthDownloads} label="Downloads this month" />
        <StatCard value={stats.favoritedCount} label="Team favorites" />
      </div>

      <div
        id="admin-hero"
        className={`admin-hero-block ${hasTopPerforming ? 'insights-hero' : 'insights-hero insights-hero--empty'}`}
        style={{
          cursor: 'default',
          border: hasTopPerforming ? undefined : '1px solid var(--border)',
        }}
      >
        {hasTopPerforming ? (
          <>
            <div className="insights-hero-bg">
              <AdminHeroBackdrop storagePath={heroPhoto?.storage_path} />
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
                  Top performing photo · library-wide
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
                  {heroPhoto?.photographer?.name ?? '—'} · {heroPhoto?.collection?.name ?? '—'}
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
                  ? 'The library is empty. Once photographers add work, download stats and a leader photo will show up here.'
                  : 'No library downloads yet. When teammates save photos from the library, the most-used shot appears here.'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="admin-analytics-two-col">
        <div className="admin-card">
          <div className="admin-card__headerRow">
            <span className="admin-card__headerTitle">Who uses the library</span>
            <span className="admin-card__headerMeta">
              {stats.totalDownloads.toLocaleString()} download events
            </span>
          </div>
          <div className="bar-chart">
            {downloadsByDownloader.length === 0 ? (
              <div className="admin-card__chartEmpty">No downloads yet</div>
            ) : (
              downloadsByDownloader.map((u, i) => {
                const pct = Math.round((u.count / maxDownloader) * 100)
                const colors = AVATAR_COLORS[i % AVATAR_COLORS.length]
                return (
                  <div key={u.userId} className="bar-row">
                    <div className="bar-av" style={{ background: colors.bg, color: colors.text }}>
                      {u.initials}
                    </div>
                    <div className="bar-name">{u.userName.split(' ')[0]}</div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: `color-mix(in srgb, var(--accent) 70%, ${colors.text})`,
                        }}
                      >
                        <span className="bar-fill-lbl">{u.count}</span>
                      </div>
                    </div>
                    <div className="bar-count" style={{ color: 'var(--text-2)' }}>
                      {u.count}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card__headerRow">
            <span className="admin-card__headerTitle">Whose photos are used most</span>
            <span className="admin-card__headerMeta">By download count on their work</span>
          </div>
          <div className="bar-chart">
            {photographerImpact.length === 0 ? (
              <div className="admin-card__chartEmpty">No photos yet</div>
            ) : (
              photographerImpact.map((u, i) => {
                const pct = Math.round((u.downloadUses / maxImpact) * 100)
                const colors = AVATAR_COLORS[i % AVATAR_COLORS.length]
                return (
                  <div key={u.userId} className="bar-row">
                    <div className="bar-av" style={{ background: colors.bg, color: colors.text }}>
                      {u.initials}
                    </div>
                    <div className="bar-name">{u.userName.split(' ')[0]}</div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: `color-mix(in srgb, var(--accent) 70%, ${colors.text})`,
                        }}
                      >
                        <span className="bar-fill-lbl">{u.downloadUses}</span>
                      </div>
                    </div>
                    <div className="bar-count" style={{ color: 'var(--text-2)' }}>
                      {u.downloadUses}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <AdminPennyJarBandit rows={usageLedger} alert={usageAlert} />

      <div className="admin-analytics-two-col">
        <div className="admin-card">
          <div className="admin-card__header">Library balance</div>
          <div className="admin-card__body">
            <BalanceBar uploads={stats.totalPhotos} downloads={stats.totalDownloads} />
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card__header">Top library photos</div>
          <table className="utbl">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Photographer</th>
                <th>Uses</th>
              </tr>
            </thead>
            <tbody>
              {topPhotos.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                    No photos yet
                  </td>
                </tr>
              ) : (
                topPhotos.map(p => (
                  <tr key={p.id}>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.title}
                    </td>
                    <td style={{ color: 'var(--text-3)' }}>{p.photographer?.name ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{p.downloads_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card__header">Team roster</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="utbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Photos in library</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {userRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                      No users
                    </td>
                  </tr>
                ) : (
                  userRows.map(u => (
                    <tr key={u.id}>
                      <td>{u.name ?? u.initials ?? u.id.slice(0, 8)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)', textTransform: 'capitalize' }}>
                        {u.role}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{u.libraryPhotos}</td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
          </table>
        </div>
      </div>
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
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', minWidth: 70 }}>
          Photos
        </div>
        <div style={{ flex: 1, height: 20, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${upPct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
        </div>
        <div
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            minWidth: 30,
            textAlign: 'right',
            color: 'var(--text-2)',
          }}
        >
          {uploads}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', minWidth: 70 }}>
          Download events
        </div>
        <div style={{ flex: 1, height: 20, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${dlPct}%`, height: '100%', background: '#6a9ec4', borderRadius: 4 }} />
        </div>
        <div
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            minWidth: 30,
            textAlign: 'right',
            color: 'var(--text-2)',
          }}
        >
          {downloads}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
        {downloads > 0
          ? `${(downloads / Math.max(uploads, 1)).toFixed(1)}× events per photo (avg.)`
          : 'No downloads yet'}
      </div>
    </div>
  )
}

function AdminHeroBackdrop({ storagePath }: { storagePath: string | null | undefined }) {
  const url = useSignedPhotoUrl(storagePath ?? null)
  if (!url) return null
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url(${url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    />
  )
}
