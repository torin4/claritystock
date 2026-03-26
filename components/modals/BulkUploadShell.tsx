'use client'

import BulkUploadModal from '@/components/modals/BulkUploadModal'
import BulkUploadReviewModal from '@/components/modals/BulkUploadReviewModal'

export default function BulkUploadShell({ userId }: { userId: string }) {
  return (
    <>
      <BulkUploadModal userId={userId} />
      <BulkUploadReviewModal userId={userId} />
    </>
  )
}
