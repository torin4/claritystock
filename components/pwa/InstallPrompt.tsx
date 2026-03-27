'use client'

import { useEffect, useState, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Don't show if user previously dismissed
    if (localStorage.getItem('pwa-install-dismissed')) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed — install prompt won't fire, that's fine
      })
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    setDeferredPrompt(null)
    localStorage.setItem('pwa-install-dismissed', '1')
  }, [])

  if (!deferredPrompt || dismissed) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 8 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Install Clarity Stock</div>
        <div style={{ color: '#999', fontSize: 12 }}>Add to your home screen for quick access</div>
      </div>
      <button
        onClick={handleInstall}
        style={{
          background: '#fff',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: '#666',
          fontSize: 18,
          cursor: 'pointer',
          padding: '4px 8px',
          lineHeight: 1,
        }}
      >
        &times;
      </button>
    </div>
  )
}
