'use client'

import { useId } from 'react'

interface LocationFieldProps {
  value: string
  onChange: (value: string) => void
  labels: readonly string[]
  placeholder?: string
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

/** Text input with HTML datalist of canonical location labels (browser autocomplete). */
export default function LocationField({
  value,
  onChange,
  labels,
  placeholder = 'Neighborhood',
  className = 'ui',
  disabled,
  'aria-label': ariaLabel,
}: LocationFieldProps) {
  const listId = useId()
  return (
    <>
      <input
        className={className}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-label={ariaLabel ?? placeholder}
      />
      <datalist id={listId}>
        {labels.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </>
  )
}
