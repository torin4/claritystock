'use client'

import { useState } from 'react'
import { useSignedPhotoUrl } from '@/lib/hooks/useSignedPhotoUrl'
import type { UsageAlertConfig } from '@/lib/admin/usageAlert'
import AdminPennyJarBandit from '@/components/admin/AdminPennyJarBandit'
import type { AdminAnalyticsRangeData } from '@/lib/queries/admin.queries'
import type { AdminUserRow, UsageLedgerRow } from '@/lib/types/database.types'

const AVATAR_COLORS = [
  { bg: '#1a7a47', text: '#6ee8a2' },
  { bg: '#362a14', text: '#c49060' },
  { bg: '#16283a', text: '#6a9ec4' },
  { bg: '#2a1a28', text: '#c46a9e' },
  { bg: '#1a2832', text: '#6ab4c4' },
]

type RangeKey = 'all' | 'month'

interface Props {
  allTime: AdminAnalyticsRangeData
  thisMonth: AdminAnalyticsRangeData
  userRows: AdminUserRow[]
  teamSummary: { memberCount: number; adminCount: number }
  usageLedger: UsageLedgerRow[]
  usageAlert: UsageAlertConfig
}

export default function AdminTeamAnalytics({
  allTime,
  thisMonth,
  userRows,
  teamSummary,
  usageLedger,
  usageAlert,
}: Props) {
  const [range, setRange] = useState<RangeKey>('all')
  const active = range === 'all' ? allTime : thisMonth
  const { stats, topPhotos, downloadsByDownloader, photographerImpact } = active

  const heroCandidate = topPhotos[0] ?? null
  const hasTopPerforming = (heroCandidate?.downloads_count ?? 0) > 0
  const heroPhoto = hasTopPerforming ? heroCandidate : null
  const maxDownloader = Math.max(1, downloadsByDownloader[0]?.count ?? 1)
  const maxImpact = Math.max(1, photographerImpact[0]?.downloadUses ?? 1)

  const downloaderCount = downloadsByDownloader.length
  const downloadEventsSubtitle = range === 'all' ? 'All time · per person' : 'UTC month · per person'

  return (
    <div className="admin-analytics-page">
      <div className="ph">
        <div>
          <div className="ph-title">Admin</div>
          <div className="ph-sub">
            Team-wide library analytics · {teamSummary.memberCount} member{teamSummary.memberCount !== 1 ? 's' : ''}
            {teamSummary.adminCount > 0 ? ` · ${teamSummary.adminCount} admin${teamSummary.adminCount !== 1 ? 's' : ''}` : ''}
            {' · '}
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
      </div>

      <div id="admin-insight-cards" className="admin-stat-grid">
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
          label={range === 'all' ? 'Team favorites' : 'Favorites added'}
        />
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
                  {range === 'all' ? 'Top performing photo · library-wide' : 'Top photo this month · library-wide'}
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
                  ? 'The library is empty. Once photographers add work, download stats and a leader photo will show up here.'
                  : range === 'month'
                    ? 'No library download events in the current UTC month yet. Switch to All time for lifetime leaders.'
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
            <span className="admin-card__headerMeta">{downloadEventsSubtitle}</span>
          </div>
          <div className="bar-chart">
            {downloadsByDownloader.length === 0 ? (
              <div className="admin-card__chartEmpty">
                {range === 'month' ? 'No downloads this month' : 'No downloads yet'}
              </div>
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
            <span className="admin-card__headerMeta">
              {range === 'all' ? 'By download count on their work' : 'By download events · UTC month'}
            </span>
          </div>
          <div className="bar-chart">
            {photographerImpact.length === 0 ? (
              <div className="admin-card__chartEmpty">
                {range === 'month' ? 'No download activity this month' : 'No photos yet'}
              </div>
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

      <p
        style={{
          fontSize: 11,
          color: 'var(--text-3)',
          fontFamily: 'var(--font-mono)',
          padding: '0 20px',
          margin: '12px 0 0',
        }}
      >
        Penny jar uses all-time give/take (not filtered by the range toggle).
      </p>
      <AdminPennyJarBandit rows={usageLedger} alert={usageAlert} />

      <div className="admin-analytics-two-col">
        <div className="admin-card">
          <div className="admin-card__header">
            Library balance
            {range === 'month' ? (
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400, marginLeft: 8 }}>
                (this month · UTC)
              </span>
            ) : null}
          </div>
          <div className="admin-card__body">
            <BalanceBar uploads={stats.totalPhotos} downloads={stats.totalDownloads} range={range} />
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card__header">
            {range === 'all' ? 'Top library photos' : 'Top photos this month'}
          </div>
          <table className="utbl">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Photographer</th>
                <th>{range === 'all' ? 'Uses' : 'Uses (month)'}</th>
              </tr>
            </thead>
            <tbody>
              {topPhotos.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                    {range === 'month' ? 'No download activity this month' : 'No photos yet'}
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

function BalanceBar({
  uploads,
  downloads,
  range,
}: {
  uploads: number
  downloads: number
  range: RangeKey
}) {
  const total = uploads + downloads || 1
  const upPct = Math.round((uploads / total) * 100)
  const dlPct = 100 - upPct
  const photosLabel = range === 'all' ? 'Photos' : 'Uploaded'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', minWidth: 70 }}>
          {photosLabel}
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
          ? `${(downloads / Math.max(uploads, 1)).toFixed(1)}× download events per photo added${range === 'month' ? ' (month)' : ''} (avg.)`
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
