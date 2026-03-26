'use client'

import { useUIStore } from '@/stores/ui.store'

/**
 * Fixed pill when a bulk ZIP import is running and the modal is dismissed.
 * Click to reopen the bulk upload modal.
 */
export default function BulkUploadProgressBanner() {
  const bulkUploadModalOpen = useUIStore((s) => s.bulkUploadModalOpen)
  const progress = useUIStore((s) => s.bulkUploadProgress)
  const openBulkUpload = useUIStore((s) => s.openBulkUpload)

  if (!progress || bulkUploadModalOpen) return null

  /** Half-step while the current file is tagging/uploading so the bar moves off 0% immediately. */
  const half =
    progress.inFlight && progress.completed < progress.total ? 0.5 : 0
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round(((progress.completed + half) / progress.total) * 100))
      : 0

  return (
    <div
      className="bulk-upload-banner"
      role="status"
      aria-live="polite"
      aria-busy={progress.completed < progress.total}
    >
      <button
        type="button"
        className="bulk-upload-banner-inner"
        onClick={() => openBulkUpload()}
        title="Open advanced upload — import continues in the background"
      >
        <span className="bulk-upload-banner-spinner" aria-hidden />
        <span className="bulk-upload-banner-text">
          <span className="bulk-upload-banner-title">Advanced import</span>
          <span className="bulk-upload-banner-sub">{progress.label}</span>
        </span>
        <span className="bulk-upload-banner-pct">{pct}%</span>
      </button>
      <div className="bulk-upload-banner-track" aria-hidden>
        <div className="bulk-upload-banner-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
