# Error Handling + Loading States Skill — Clarity Stock

## Philosophy
- Every async operation has three states: loading, success, error
- Errors never crash the UI — always show a fallback
- Loading states use skeletons, not spinners (except for action buttons)
- Toasts for transient feedback, inline errors for form validation

---

## Toast Notifications

```tsx
// components/ui/Toast.tsx
'use client'

import { useEffect, useState } from 'react'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

let toastQueue: ((toast: Toast) => void)[] = []

export function showToast(message: string, type: Toast['type'] = 'info') {
  const toast: Toast = { id: Date.now().toString(), message, type }
  toastQueue.forEach(fn => fn(toast))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (toast: Toast) => {
      setToasts(prev => [...prev, toast])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), 2800)
    }
    toastQueue.push(handler)
    return () => { toastQueue = toastQueue.filter(fn => fn !== handler) }
  }, [])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="bg-surface border border-border-hi text-text text-[13px] px-[18px] py-[9px] rounded-lg shadow-lg font-body animate-fade-in"
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
```

Usage:
```ts
import { showToast } from '@/components/ui/Toast'

showToast('Photo removed from library')
showToast('Upload failed — please try again', 'error')
showToast('Changes saved', 'success')
```

---

## Photo Grid Skeleton

```tsx
// components/browse/PhotoGridSkeleton.tsx
export function PhotoGridSkeleton() {
  return (
    <div className="grid grid-cols-3 md:grid-cols-3 grid-cols-2 gap-[3px] p-[3px]">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="aspect-square bg-surface-2 animate-pulse" />
      ))}
    </div>
  )
}
```

---

## Button Loading State

```tsx
// Always show loading state on async button actions
'use client'
import { useState } from 'react'

function DownloadButton({ photoId }: { photoId: string }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      await logDownload(photoId)
      setDone(true)
    } catch {
      showToast('Download failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
        ${done
          ? 'bg-surface-2 text-accent border border-accent'
          : 'bg-accent text-white hover:opacity-85'
        }
        ${loading ? 'opacity-60 cursor-not-allowed' : ''}
      `}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : done ? (
        '✓ Downloaded'
      ) : (
        '↓ Download'
      )}
    </button>
  )
}
```

---

## Empty States

```tsx
// components/ui/EmptyState.tsx
interface EmptyStateProps {
  icon?: string
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center col-span-full">
      {icon && <div className="text-4xl mb-3 opacity-20">{icon}</div>}
      <div className="text-text-2 text-sm font-medium mb-1">{title}</div>
      {subtitle && <div className="text-text-3 text-xs">{subtitle}</div>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-surface border border-border text-text-2 text-xs rounded-lg hover:border-border-hi hover:text-text transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
```

Usage:
```tsx
{photos.length === 0 && (
  <EmptyState
    icon="⌕"
    title="No photos match your filters"
    action={{ label: 'Clear all filters', onClick: clearFilters }}
  />
)}
```

---

## Supabase Error Handling Pattern

```ts
// Always destructure error and handle it
const { data, error } = await supabase.from('photos').select('*')

if (error) {
  console.error('Failed to fetch photos:', error.message)
  showToast('Failed to load photos', 'error')
  return
}
```

---

## Form Validation

```tsx
// Inline errors below fields — never toast for form validation
const [errors, setErrors] = useState<Record<string, string>>({})

function validate() {
  const newErrors: Record<string, string> = {}
  if (!title.trim()) newErrors.title = 'Title is required'
  if (!category) newErrors.category = 'Category is required'
  setErrors(newErrors)
  return Object.keys(newErrors).length === 0
}

// In JSX
<div className="flex flex-col gap-1.5">
  <input className={`... ${errors.title ? 'border-red' : 'border-border'}`} />
  {errors.title && <span className="text-red text-[11px] font-mono">{errors.title}</span>}
</div>
```

---

## Error Boundary

```tsx
// app/error.tsx — catches unhandled errors in the app layout
'use client'

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-text-2 text-sm mb-4">Something went wrong</div>
        <button
          onClick={reset}
          className="px-4 py-2 bg-surface border border-border text-text-2 text-sm rounded-lg hover:border-border-hi"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
```

---

## Tailwind Animation Setup

```ts
// tailwind.config.ts — add these animations
extend: {
  keyframes: {
    'fade-in': {
      '0%': { opacity: '0', transform: 'translateY(4px)' },
      '100%': { opacity: '1', transform: 'translateY(0)' },
    },
  },
  animation: {
    'fade-in': 'fade-in 0.15s ease-out',
  },
}
```
