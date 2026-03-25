'use client'

import { useId, useMemo } from 'react'
import { filterNeighborhoodSuggestions } from '@/lib/neighborhoods/canonical'

const MAX_DATALIST_OPTIONS = 20
const MIN_CHARS_FOR_SUGGESTIONS = 2

interface LocationFieldProps {
  value: string
  onChange: (value: string) => void
  labels: readonly string[]
  placeholder?: string
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

/** Text input with datalist: suggestions only after a few characters, capped (not the full catalog). */
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
  const datalistOptions = useMemo(
    () =>
      filterNeighborhoodSuggestions(
        value,
        labels,
        MAX_DATALIST_OPTIONS,
        MIN_CHARS_FOR_SUGGESTIONS,
      ),
    [value, labels],
  )
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
        aria-autocomplete="list"
      />
      <datalist id={listId}>
        {datalistOptions.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </>
  )
}
