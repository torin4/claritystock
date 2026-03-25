'use client'

import { GOOGLE_WORKSPACE_CHAT_URL } from '@/lib/admin/googleChatDm'
import type { UsageAlertConfig } from '@/lib/admin/usageAlert'
import { usageExceedsAlert } from '@/lib/admin/usageAlert'
import type { UsageLedgerRow } from '@/lib/types/database.types'

interface Props {
  rows: UsageLedgerRow[]
  alert: UsageAlertConfig
}

const JAR_H = 72

/** `true` = always show Email / Google Chat (for testing). Set to `false` to show contact only when over alert thresholds. */
const SHOW_CONTACT_ALWAYS = true

function openGoogleWorkspaceChat() {
  window.open(GOOGLE_WORKSPACE_CHAT_URL, '_blank', 'noopener,noreferrer')
}

function formatRatio(r: number) {
  if (!Number.isFinite(r) || r > 999) return '999+×'
  if (r >= 10) return `${r.toFixed(0)}×`
  if (r >= 2) return `${r.toFixed(1)}×`
  return `${r.toFixed(2)}×`
}

export default function AdminPennyJarBandit({ rows, alert }: Props) {
  const maxU = Math.max(1, ...rows.map(r => r.uploads))
  const maxD = Math.max(1, ...rows.map(r => r.downloads))

  return (
    <div className="admin-card">
        <div className="admin-penny-header">
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            Penny jar bandit
          </div>
          <div className="ph-sub" style={{ margin: 0, lineHeight: 1.45 }}>
            <strong>Give</strong> = photos you added to the library. <strong>Take</strong> = times you hit download.
            Sorted with the heaviest takers (vs what they give) on top.
            {SHOW_CONTACT_ALWAYS ? (
              <>
                {' '}
                Contact buttons are always shown for testing (
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>SHOW_CONTACT_ALWAYS</code> in{' '}
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>AdminPennyJarBandit.tsx</code>).
              </>
            ) : (
              <>
                {' '}
                Contact when take ratio ≥ {alert.ratioThreshold}× and downloads ≥ {alert.minDownloads} — tune with{' '}
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>NEXT_PUBLIC_ADMIN_USAGE_*</code>.
              </>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="utbl" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>Member</th>
                <th style={{ minWidth: 140 }}>Give / take</th>
                <th>Ratio</th>
                <th style={{ minWidth: 120 }}>Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                    No members yet
                  </td>
                </tr>
              ) : (
                rows.map(row => {
                  const hot = usageExceedsAlert(row, alert)
                  const showContact = SHOW_CONTACT_ALWAYS || hot
                  const uPct = (row.uploads / maxU) * 100
                  const dPct = (row.downloads / maxD) * 100
                  const subj = encodeURIComponent('Clarity Stock — library usage (give vs take)')
                  const body = encodeURIComponent(
                    `Hi — we’re reaching out from Clarity Stock admin.\n\n` +
                      `Your library stats: ${row.uploads} photos contributed, ${row.downloads} downloads from the team library (about ${formatRatio(row.ratio)} take vs give).\n\n` +
                      `Happy to chat about balance or anything we can help with.\n`,
                  )
                  const mailto =
                    row.email && row.email.includes('@')
                      ? `mailto:${row.email}?subject=${subj}&body=${body}`
                      : null
                  return (
                    <tr key={row.userId} style={hot ? { background: 'color-mix(in srgb, var(--red) 6%, transparent)' } : undefined}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: 'var(--accent-dim)',
                              border: '1px solid var(--accent)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 10,
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--accent)',
                              flexShrink: 0,
                            }}
                          >
                            {row.initials ?? '?'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{row.name ?? '—'}</div>
                            <div
                              style={{
                                fontSize: 10,
                                color: 'var(--text-3)',
                                fontFamily: 'var(--font-mono)',
                                textTransform: 'capitalize',
                              }}
                            >
                              {row.role}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                          <Jar label="Give" count={row.uploads} fillPct={uPct} tone="in" />
                          <Jar label="Take" count={row.downloads} fillPct={dPct} tone="out" />
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                        <span style={{ color: hot ? 'var(--red)' : 'var(--text-2)' }}>{formatRatio(row.ratio)}</span>
                        {hot && (
                          <span style={{ display: 'block', fontSize: 9, color: 'var(--red)', marginTop: 2 }}>
                            over threshold
                          </span>
                        )}
                      </td>
                      <td>
                        {showContact ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                            {mailto ? (
                              <a href={mailto} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                                Email
                              </a>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                No email synced — run DB migration backfill or sign out/in once
                              </span>
                            )}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              title="Opens Google Chat in a new tab"
                              onClick={() => openGoogleWorkspaceChat()}
                            >
                              Google Chat
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
    </div>
  )
}

function Jar({
  label,
  count,
  fillPct,
  tone,
}: {
  label: string
  count: number
  fillPct: number
  tone: 'in' | 'out'
}) {
  const fill =
    tone === 'in'
      ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 85%, #fff) 0%, var(--accent) 100%)'
      : 'linear-gradient(180deg, #c49060 0%, color-mix(in srgb, #c49060 70%, #000) 100%)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        style={{
          width: 44,
          height: JAR_H,
          borderRadius: 8,
          border: '2px solid var(--border-hi)',
          background: 'var(--surface-2)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.12)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${Math.min(100, Math.max(4, fillPct))}%`,
            background: fill,
            transition: 'height 0.35s ease',
            borderRadius: '0 0 5px 5px',
          }}
        />
        {/* jar “lid” */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            background: 'color-mix(in srgb, var(--border-hi) 40%, var(--surface))',
            borderBottom: '1px solid var(--border)',
          }}
        />
      </div>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{count}</div>
    </div>
  )
}
