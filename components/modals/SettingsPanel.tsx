'use client'
import { useState } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { deleteAllMyPhotos } from '@/lib/actions/photos.actions'
import { useRouter } from 'next/navigation'

interface SettingsPanelProps {
  userId: string
  userName: string
  userInitials: string
  userRole: string
}

export default function SettingsPanel({ userId, userName, userInitials, userRole }: SettingsPanelProps) {
  const { settingsPanelOpen, closeSettings } = useUIStore()
  const [displayName, setDisplayName] = useState(userName)
  const [removingPhotos, setRemovingPhotos] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {settingsPanelOpen && (
        <div
          className="settings-overlay"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 'var(--z-modal-overlay, 500)' as React.CSSProperties['zIndex'],
          }}
          onClick={closeSettings}
        />
      )}
      <div
        id="sp-panel"
        className={`settings-panel ${settingsPanelOpen ? 'open' : ''}`}
        style={{
          position: 'fixed',
          top: 0,
          right: settingsPanelOpen ? 0 : '-400px',
          width: '360px',
          height: '100vh',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 501,
          display: 'flex',
          flexDirection: 'column',
          transition: 'right 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Header */}
        <div className="sp-hdr" style={{
          padding: '16px 18px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span className="sp-title" style={{ fontFamily: 'var(--font-head)', fontSize: '15px', fontWeight: 600 }}>Account</span>
          <button
            className="sp-close"
            onClick={closeSettings}
            style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minWidth: '40px', minHeight: '40px',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div className="sp-body" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Profile */}
          <div className="sp-sec">
            <div className="sp-sec-title" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: '12px' }}>Profile</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div className="s-avatar" style={{ width: '46px', height: '46px', fontSize: '13px', borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                {userInitials}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{userName}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{userRole}</div>
              </div>
            </div>
            <div className="sp-field" style={{ marginBottom: '10px' }}>
              <div className="sp-lbl" style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>Display name</div>
              <input
                className="sp-input ui"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ width: '100%' }}
              onClick={async () => {
                const supabase = getSupabaseBrowserClient()
                await supabase.from('users').update({ name: displayName }).eq('id', userId)
              }}
            >
              Save changes
            </button>
          </div>

          {/* Notifications */}
          <div className="sp-sec">
            <div className="sp-sec-title" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: '12px' }}>Notifications</div>
            {[
              { label: 'Download alerts', sub: 'When someone downloads your photo' },
              { label: 'Weekly digest', sub: 'Summary of your photo performance' },
            ].map(item => (
              <div key={item.label} className="notif-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div className="notif-lbl" style={{ fontSize: '13px', fontWeight: 500 }}>{item.label}</div>
                  <div className="notif-sub" style={{ fontSize: '11px', color: 'var(--text-3)' }}>{item.sub}</div>
                </div>
                <label className="toggle" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', flexShrink: 0 }}>
                  <input type="checkbox" defaultChecked style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{
                    position: 'absolute', inset: 0,
                    background: 'var(--accent)', borderRadius: '10px',
                    transition: 'background 0.2s',
                  }} />
                  <span style={{
                    position: 'absolute', top: '2px', left: '2px',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: '#fff', transition: 'transform 0.2s',
                  }} />
                </label>
              </div>
            ))}
          </div>

          {/* Session */}
          <div className="sp-sec">
            <div className="sp-sec-title" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: '12px' }}>Session</div>
            <button
              className="sp-logout"
              onClick={handleLogout}
              style={{ fontSize: '13px', color: 'var(--text-2)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-body)' }}
            >
              → Log out
            </button>
          </div>

          {/* Danger zone */}
          <div className="sp-sec">
            <div className="sp-sec-title" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--red)', letterSpacing: '0.1em', marginBottom: '12px' }}>Danger zone</div>
            <button
              type="button"
              className="sp-danger"
              disabled={removingPhotos}
              style={{
                display: 'block',
                fontSize: '12px',
                color: 'var(--red)',
                cursor: removingPhotos ? 'not-allowed' : 'pointer',
                opacity: removingPhotos ? 0.6 : 1,
                background: 'none',
                border: 'none',
                padding: '4px 0',
                fontFamily: 'var(--font-body)',
                textAlign: 'left',
              }}
              onClick={async () => {
                if (removingPhotos) return
                if (!confirm(
                  'Remove ALL photos you uploaded from the Library? This cannot be undone. Files in storage will be deleted.',
                )) return
                setRemovingPhotos(true)
                try {
                  const { deleted } = await deleteAllMyPhotos()
                  useUIStore.getState().bumpSidebarCollections()
                  router.refresh()
                  closeSettings()
                  alert(deleted === 0 ? 'You had no photos to remove.' : `Removed ${deleted} photo${deleted === 1 ? '' : 's'} from the Library.`)
                } catch (e) {
                  console.error(e)
                  alert(e instanceof Error ? e.message : 'Could not remove photos')
                } finally {
                  setRemovingPhotos(false)
                }
              }}
            >
              {removingPhotos ? 'Removing…' : '✕ Remove all my photos from Library'}
            </button>
            <button className="sp-danger" style={{ display: 'block', fontSize: '12px', color: 'var(--red)', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 0', fontFamily: 'var(--font-body)', marginTop: '4px' }}>
              ✕ Delete my account
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
