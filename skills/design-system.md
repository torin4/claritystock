# Clarity Design System Skill — Clarity Stock

## Source of Truth
The wireframe `clarity-v2-full.html` is the definitive reference. This skill documents the exact tokens, typography, and component patterns extracted from it. Do not deviate.

---

## Color Tokens

```css
/* Map these directly to Tailwind custom colors in tailwind.config.ts */
--bg: #080807           /* Page background */
--surface: #0f0f0d      /* Sidebar, cards, panels */
--surface-2: #161614    /* Input backgrounds, hover states */
--border: #1e1e1b       /* Default borders */
--border-hi: #2a2a26    /* Hover/focus borders */
--text: #f0ede6         /* Primary text */
--text-2: #7a7870       /* Secondary text, nav items */
--text-3: #5c5b56       /* Tertiary text, labels, placeholders */
--accent: #3d7a6a       /* Teal — primary action color */
--accent-dim: #0f2218   /* Teal background tint */
--red: #b54040          /* Destructive actions */
--green: #4d8f5a        /* Success states */
--amber: #b07840        /* Warning states */

/* Category colors */
--nb: #1a3828           /* Neighborhood background */
--nb-t: #6dbfa0         /* Neighborhood text */
--cm: #362a14           /* Community background */
--cm-t: #c49060         /* Community text */
--am: #16283a           /* Amenity background */
--am-t: #6a9ec4         /* Amenity text */
```

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080807',
        surface: '#0f0f0d',
        'surface-2': '#161614',
        border: '#1e1e1b',
        'border-hi': '#2a2a26',
        text: '#f0ede6',
        'text-2': '#7a7870',
        'text-3': '#5c5b56',
        accent: '#3d7a6a',
        'accent-dim': '#0f2218',
        red: '#b54040',
        green: '#4d8f5a',
        amber: '#b07840',
        nb: '#1a3828',
        'nb-t': '#6dbfa0',
        cm: '#362a14',
        'cm-t': '#c49060',
        am: '#16283a',
        'am-t': '#6a9ec4',
      },
      fontFamily: {
        head: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'Helvetica Neue', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
}

export default config
```

---

## Typography

| Element | Font | Size | Weight | Class |
|---|---|---|---|---|
| Page titles | Syne | 22px | 700 | `font-head text-[22px] font-bold` |
| Section headers | Syne | 18px | 700 | `font-head text-lg font-bold` |
| Logo | Syne | 13px | 700 | `font-head text-[13px] font-bold tracking-[0.06em] uppercase` |
| Nav items | DM Sans | 13px | 500 | `font-body text-[13px] font-medium` |
| Body text | DM Sans | 14px | 400 | `font-body text-sm` |
| Labels | JetBrains Mono | 10px | 500 | `font-mono text-[10px] font-medium uppercase tracking-[0.08em]` |
| Metadata | JetBrains Mono | 11px | 400 | `font-mono text-[11px]` |
| Tags | DM Sans | 11px | 400 | `font-body text-[11px]` |

Load fonts in `app/layout.tsx`:
```tsx
import { Syne, DM_Sans, JetBrains_Mono } from 'next/font/google'

const syne = Syne({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-head' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300', '400', '500'], variable: '--font-body' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })
```

---

## Layout

### Sidebar
- Width: 200px desktop, fixed left
- Hidden on mobile (slides in as drawer)
- Background: `surface` (#0f0f0d)
- Border right: `border` (#1e1e1b)

### Mobile bar
- Height: 52px
- Fixed top, full width
- z-index: 700
- Background: `surface`

### Main content
- `flex-1 overflow-y-auto h-screen`
- On mobile: `margin-top: 52px; width: 100vw`

### Page header (.ph)
- Padding: `20px 20px 14px`
- Sticky top, z-index 20
- Background: `bg`
- Border bottom: `border`

---

## Component Patterns

### Photo tile (grid item)
```tsx
// Square aspect ratio, 3-col desktop / 2-col mobile
// Hover: category dot top-left, download button top-right, heart bottom-right
// Selected: teal outline 3px, checkmark top-left
<div className="relative aspect-square bg-surface-2 cursor-pointer overflow-hidden rounded-none">
  <img className="w-full h-full object-cover" />
  {/* Category dot — top left */}
  <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full" style={{ background: categoryColor }} />
  {/* Download button — top right, visible on hover */}
  <button className="absolute top-2 right-2 w-[30px] h-[30px] rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100" />
  {/* Heart — bottom right */}
  <button className="absolute bottom-2 right-2 w-[26px] h-[26px] rounded-full bg-black/50 flex items-center justify-center" />
</div>
```

### Category badge
```tsx
const categoryConfig = {
  neighborhood: { bg: 'bg-nb', text: 'text-nb-t' },
  community: { bg: 'bg-cm', text: 'text-cm-t' },
  amenity: { bg: 'bg-am', text: 'text-am-t' },
}

<span className={`${categoryConfig[category].bg} ${categoryConfig[category].text} text-[10px] font-medium px-1.5 py-0.5 rounded-[3px] uppercase tracking-[0.04em] font-mono`}>
  {category}
</span>
```

### Nav item
```tsx
<button className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-text-2 hover:bg-surface-2 hover:text-text transition-all duration-[120ms] w-full text-left font-body [&.active]:bg-surface-2 [&.active]:text-text">
```

### Input
```tsx
<input className="w-full bg-surface-2 border border-border rounded-md px-2.5 py-2 text-text text-[12px] font-body outline-none focus:border-border-hi placeholder:text-text-3 transition-colors" />
```

### Button — primary
```tsx
<button className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-accent text-white rounded-md text-[13px] font-medium font-body hover:opacity-85 transition-opacity">
```

### Button — outline
```tsx
<button className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-transparent border border-border text-text-2 rounded-md text-[13px] font-medium font-body hover:border-border-hi hover:text-text hover:bg-surface-2 transition-all">
```

### Section label
```tsx
<div className="text-[10px] font-semibold tracking-[0.1em] uppercase text-text-3 px-3 py-1.5 font-mono">
```

---

## Spacing System
- Gap between grid items: 3px (`gap-[3px]` or `--gap: 3px`)
- Page padding: 20px (`px-5`)
- Section padding: 14px 16px (`py-3.5 px-4`)
- Sidebar padding: 8px 6px (`py-2 px-1.5`)
- Card padding: 9px 10px (`py-[9px] px-[10px]`)

---

## Mobile Breakpoints
- Single breakpoint: 768px (`md:` in Tailwind)
- Below 768px = mobile layout
- No tablet-specific layout needed

---

## Scrollbar Styling
```css
/* global.css */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2a2a26; border-radius: 3px; }
```

---

## Do Not
- Do not use any color not in the token list above
- Do not use font weights 600 or 700 on body text
- Do not use border-radius larger than 10px on cards
- Do not use gradients anywhere in the UI
- Do not use box shadows except on the mobile sidebar (`box-shadow: 4px 0 24px rgba(0,0,0,0.8)`)
- Do not use animations other than `transition-all duration-[120ms]` for hover states and `0.25s cubic-bezier(0.4,0,0.2,1)` for slide-in panels
