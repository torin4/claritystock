'use client'
import { useState, useEffect } from 'react'
import { deleteMyAccount } from '@/lib/actions/account.actions'
import { isMissingHideOwnPhotosColumnError } from '@/lib/preferences/hideOwnPhotosInBrowse'
import { deleteAllMyPhotos } from '@/lib/actions/photos.actions'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { devError } from '@/lib/utils/devLog'
import { useBrowsePrefsStore } from '@/stores/browsePrefs.store'
import { useUIStore } from '@/stores/ui.store'
import UserAvatar from '@/components/layout/UserAvatar'
import { useRouter } from 'next/navigation'

const DELETE_ACCOUNT_PHRASE = 'delete my account'

interface SettingsPanelProps {
  userId: string
  userName: string
  userInitials: string
  userAvatarUrl: string | null
  userRole: string
  hideOwnPhotosInBrowse: boolean
}

export default function SettingsPanel({
  userId,
  userName,
  userInitials,
  userAvatarUrl,
  userRole,
  hideOwnPhotosInBrowse: hideOwnInitial,
}: SettingsPanelProps) {
  const { settingsPanelOpen, closeSettings } = useUIStore()
  const [hideOwnInBrowse, setHideOwnInBrowse] = useState(hideOwnInitial)
  const [hideOwnSaving, setHideOwnSaving] = useState(false)
  const [removingPhotos, setRemovingPhotos] = useState(false)
  const [showAccountDeletion, setShowAccountDeletion] = useState(false)
  const [deleteAccountPhrase, setDeleteAccountPhrase] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const router = useRouter()

  const deletePhraseMatches =
    deleteAccountPhrase.trim().toLowerCase() === DELETE_ACCOUNT_PHRASE

  useEffect(() => {
    setHideOwnInBrowse(hideOwnInitial)
  }, [hideOwnInitial])

  useEffect(() => {
    if (!settingsPanelOpen) {
      setShowAccountDeletion(false)
      setDeleteAccountPhrase('')
      setDeletingAccount(false)
    }
  }, [settingsPanelOpen])

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <UserAvatar avatarUrl={userAvatarUrl} initials={userInitials} size={46} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{userName}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{userRole}</div>
              </div>
            </div>
          </div>

          {/* Library */}
          <div className="sp-sec">
            <div className="sp-sec-title" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: '12px' }}>Library</div>
            <label className="notif-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <div className="notif-lbl" style={{ fontSize: '13px', fontWeight: 500 }}>Hide my photos in Browse</div>
                <div className="notif-sub" style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: 4, lineHeight: 1.35 }}>
                  Your uploads won’t show on the main Library grid. You can still open <strong style={{ fontWeight: 600 }}>My Photos</strong> to manage them.
                </div>
              </div>
              <input
                type="checkbox"
                checked={hideOwnInBrowse}
                disabled={hideOwnSaving}
                className="sp-checkbox"
                style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2, accentColor: 'var(--accent)', cursor: hideOwnSaving ? 'wait' : 'pointer' }}
                onChange={async (e) => {
                  const next = e.target.checked
                  setHideOwnInBrowse(next)
                  setHideOwnSaving(true)
                  try {
                    const supabase = getSupabaseBrowserClient()
                    const { error } = await supabase
                      .from('users')
                      .update({ hide_own_photos_in_browse: next })
                      .eq('id', userId)

                    if (!error) {
                      useBrowsePrefsStore.getState().setHideOwnPhotosInBrowseOverride(next)
                      router.refresh()
                      return
                    }

                    if (isMissingHideOwnPhotosColumnError(error)) {
                      const { error: authErr } = await supabase.auth.updateUser({
                        data: { hide_own_photos_in_browse: next },
                      })
                      if (authErr) throw authErr
                      useBrowsePrefsStore.getState().setHideOwnPhotosInBrowseOverride(next)
                      router.refresh()
                      return
                    }

                    throw error
                  } catch (err) {
                    devError(err)
                    setHideOwnInBrowse(!next)
                    alert(err instanceof Error ? err.message : 'Could not update setting')
                  } finally {
                    setHideOwnSaving(false)
                  }
                }}
              />
            </label>
          </div>

          {/* Notifications */}
          <div className="sp-sec">
            <div className="sp-sec-title" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: '12px' }}>Notifications</div>
            {[
              { label: 'Download alerts', sub: 'When someone downloads your photo' },
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
                  devError(e)
                  alert(e instanceof Error ? e.message : 'Could not remove photos')
                } finally {
                  setRemovingPhotos(false)
                }
              }}
            >
              {removingPhotos ? 'Removing…' : '✕ Remove all my photos from Library'}
            </button>

            {!showAccountDeletion ? (
              <button
                type="button"
                className="sp-danger"
                disabled={deletingAccount}
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--red)',
                  cursor: deletingAccount ? 'not-allowed' : 'pointer',
                  opacity: deletingAccount ? 0.6 : 1,
                  background: 'none',
                  border: 'none',
                  padding: '4px 0',
                  fontFamily: 'var(--font-body)',
                  marginTop: '10px',
                  textAlign: 'left',
                }}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Continue to account deletion? On the next step you must type a confirmation phrase. Your uploaded photos will be removed and your sign-in for this app will be permanently deleted. This cannot be undone.',
                    )
                  ) {
                    return
                  }
                  setShowAccountDeletion(true)
                }}
              >
                ✕ Delete my account
              </button>
            ) : (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--surface-2)',
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-2)',
                    lineHeight: 1.45,
                    margin: '0 0 10px',
                  }}
                >
                  This permanently deletes your workspace profile and sign-in. All photos you uploaded are removed first.{' '}
                  <strong style={{ color: 'var(--text)' }}>Type the phrase below</strong> (capitalization doesn’t matter).
                </p>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-3)',
                    marginBottom: 6,
                  }}
                >
                  Required phrase:{' '}
                  <span style={{ color: 'var(--text)' }}>{DELETE_ACCOUNT_PHRASE}</span>
                </div>
                <input
                  className="sp-input ui"
                  value={deleteAccountPhrase}
                  onChange={(e) => setDeleteAccountPhrase(e.target.value)}
                  placeholder={DELETE_ACCOUNT_PHRASE}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Type delete my account to confirm"
                  disabled={deletingAccount}
                  style={{ marginBottom: 10 }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={deletingAccount}
                    onClick={() => {
                      setShowAccountDeletion(false)
                      setDeleteAccountPhrase('')
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!deletePhraseMatches || deletingAccount}
                    style={{
                      background: 'var(--red)',
                      borderColor: 'var(--red)',
                      color: '#fff',
                      opacity: !deletePhraseMatches || deletingAccount ? 0.45 : 1,
                    }}
                    onClick={async () => {
                      if (!deletePhraseMatches || deletingAccount) return
                      setDeletingAccount(true)
                      try {
                        await deleteMyAccount()
                        useBrowsePrefsStore.getState().setHideOwnPhotosInBrowseOverride(null)
                        const supabase = getSupabaseBrowserClient()
                        await supabase.auth.signOut()
                        closeSettings()
                        router.push('/login')
                      } catch (e) {
                        devError(e)
                        alert(e instanceof Error ? e.message : 'Could not delete account')
                      } finally {
                        setDeletingAccount(false)
                      }
                    }}
                  >
                    {deletingAccount ? 'Deleting…' : 'Permanently delete my account'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
