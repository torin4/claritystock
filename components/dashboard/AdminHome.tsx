import Link from 'next/link'
import type { PhotographerImpact } from '@/lib/types/database.types'

interface Props {
  greetingName: string
  teamStats: {
    libraryPhotos: number
    usesThisMonth: number
    members: number
    newThisMonth: number
  }
  contributors: PhotographerImpact[]
  /** The admin's own photo count — Clarity admins shoot too. */
  myPhotos: number
}

const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const cardBody: React.CSSProperties = { padding: '10px 15px 14px' }
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '8px 0',
  borderBottom: '1px solid var(--border)', fontSize: 13,
}
const monoRight: React.CSSProperties = { marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }
const link: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-card" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 15px', background: 'var(--surface, transparent)' }}>
      <div style={{ ...num, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{value.toLocaleString()}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 3 }}>
        {label}
      </div>
    </div>
  )
}

/**
 * Admin Home — a team pulse + stewardship launchpad. Deliberately a *summary*
 * that links into the full /admin analytics section (which keeps its own subnav,
 * roster/role management, ledger and exports) rather than absorbing it.
 */
export default function AdminHome({ greetingName, teamStats, contributors, myPhotos }: Props) {
  const firstName = greetingName.trim().split(/\s+/)[0]
  const uses = teamStats.usesThisMonth

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="ph">
        <div>
          <div className="ph-title">{`Welcome back${firstName ? `, ${firstName}` : ''}`}</div>
          <div className="ph-sub">
            {uses > 0
              ? `The team’s photos were used ${uses.toLocaleString()} ${uses === 1 ? 'time' : 'times'} this month`
              : 'Your team library at a glance'}
          </div>
        </div>
        <Link href="/admin" className="btn btn-primary btn-sm">Open full Admin analytics</Link>
      </div>

      {/* Team pulse */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--gap)', padding: '16px 20px 0' }}>
        <StatTile value={teamStats.libraryPhotos} label="Photos in library" />
        <StatTile value={teamStats.usesThisMonth} label="Uses this month" />
        <StatTile value={teamStats.members} label="Team members" />
        <StatTile value={teamStats.newThisMonth} label="New this month" />
      </div>

      <div style={{ padding: '16px 20px', display: 'grid', gap: 'var(--gap)' }}>
        {/* Top contributors */}
        <div className="admin-card">
          <div className="admin-card__header">Top contributors this month</div>
          <div style={cardBody}>
            {contributors.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '8px 0' }}>No contributions yet.</div>
            ) : (
              contributors.slice(0, 5).map((c, i) => (
                <div key={c.userId} style={i === Math.min(contributors.length, 5) - 1 ? { ...rowStyle, borderBottom: 'none' } : rowStyle}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', width: 18 }}>{i + 1}</span>
                  <span>{c.userName || c.initials || '—'}</span>
                  <span style={monoRight}>{c.downloadUses} {c.downloadUses === 1 ? 'use' : 'uses'}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Team & members handoff */}
        <div className="admin-card">
          <div className="admin-card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Team &amp; members</span>
            <Link href="/admin" style={link}>Manage roles →</Link>
          </div>
          <div style={{ ...cardBody, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
            {teamStats.members} members. Role management, per-photographer libraries, the downloads ledger and exports live in the Admin section.
          </div>
        </div>

        {/* Your own library — admins contribute too */}
        <div className="admin-card">
          <div className="admin-card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Your own library</span>
            <Link href="/my-photos" style={link}>My Photos →</Link>
          </div>
          <div style={{ ...cardBody, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...num, fontSize: 22, fontWeight: 700 }}>{myPhotos.toLocaleString()}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Your photos</div>
            </div>
            <Link href="/my-photos" style={{ ...link, marginLeft: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 13px' }}>
              + Add photos
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
