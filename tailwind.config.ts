import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        'border-hi': 'var(--border-hi)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        accent: 'var(--accent)',
        'accent-light': 'var(--accent-light)',
        'accent-dark': 'var(--accent-dark)',
        'accent-dim': 'var(--accent-dim)',
        'label-library': 'var(--label-library)',
        red: 'var(--red)',
        green: 'var(--green)',
        amber: 'var(--amber)',
        nb: 'var(--nb)',
        'nb-t': 'var(--nb-t)',
        cm: 'var(--cm)',
        'cm-t': 'var(--cm-t)',
        am: 'var(--am)',
        'am-t': 'var(--am-t)',
      },
      fontFamily: {
        head: ['var(--font-head)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      zIndex: {
        'page-header': '20',
        'search-bar': '19',
        'drawer-overlay': '50',
        'drawer': '51',
        lightbox: '100',
        'notif-popover': '400',
        'modal-overlay': '500',
        upload: '600',
        'sidebar-overlay': '650',
        'mobile-bar': '700',
        sidebar: '800',
      },
      spacing: {
        'sidebar': 'var(--sidebar)',
        'gap': 'var(--gap)',
      },
      screens: {
        mobile: { max: '768px' },
      },
    },
  },
  plugins: [],
}

export default config
