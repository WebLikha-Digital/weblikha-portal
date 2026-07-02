import type { Config } from 'tailwindcss'

/**
 * TAILWIND CONFIG — DESIGN SYSTEM BRIDGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Every key here maps to a CSS custom property in src/styles/tokens.css.
 * Changing a token in tokens.css automatically updates all Tailwind classes.
 *
 * Pattern: bg-brand → background: var(--color-brand)
 *          text-secondary → color: var(--color-text-secondary)
 *          border-subtle → border-color: var(--color-border-subtle)
 *
 * DO NOT add hardcoded hex values here — always use var(--token-name).
 * ─────────────────────────────────────────────────────────────────────────────
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // ── Brand ──
        brand: {
          DEFAULT: 'var(--color-brand)',
          hover:   'var(--color-brand-hover)',
          fg:      'var(--color-brand-fg)',
        },

        // ── Backgrounds ──
        bg: {
          base:     'var(--color-bg-base)',
          surface1: 'var(--color-bg-surface-1)',
          surface2: 'var(--color-bg-surface-2)',
          surface3: 'var(--color-bg-surface-3)',
          // Dashed aliases — components write bg-bg-surface-1; without these
          // keys that class compiles to nothing (transparent backgrounds).
          'surface-1': 'var(--color-bg-surface-1)',
          'surface-2': 'var(--color-bg-surface-2)',
          'surface-3': 'var(--color-bg-surface-3)',
          overlay:  'var(--color-bg-overlay)',
        },

        // ── Text ──
        primary:   'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        tertiary:  'var(--color-text-tertiary)',

        // ── Borders ──
        subtle:  'var(--color-border-subtle)',
        border:  'var(--color-border-default)',
        strong:  'var(--color-border-strong)',

        // ── Status ──
        success: {
          DEFAULT: 'var(--color-success)',
          bg:      'var(--color-success-bg)',
          fg:      'var(--color-success-fg)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          bg:      'var(--color-danger-bg)',
          fg:      'var(--color-danger-fg)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          bg:      'var(--color-warning-bg)',
          fg:      'var(--color-warning-fg)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          bg:      'var(--color-info-bg)',
          fg:      'var(--color-info-fg)',
        },
      },

      fontFamily: {
        display: ['var(--font-display)'],
        body:    ['var(--font-body)'],
        sans:    ['var(--font-body)'],   // Override Tailwind default sans
      },

      fontSize: {
        '2xs':  ['var(--text-2xs)',  { lineHeight: '1rem' }],
        xs:     ['var(--text-xs)',   { lineHeight: '1rem' }],
        sm:     ['var(--text-sm)',   { lineHeight: '1.25rem' }],
        md:     ['var(--text-md)',   { lineHeight: '1.25rem' }],
        base:   ['var(--text-base)', { lineHeight: '1.5rem' }],
        lg:     ['var(--text-lg)',   { lineHeight: '1.5rem' }],
        xl:     ['var(--text-xl)',   { lineHeight: '1.75rem' }],
        '2xl':  ['var(--text-2xl)', { lineHeight: '2rem' }],
        '3xl':  ['var(--text-3xl)', { lineHeight: '2rem' }],
        '4xl':  ['var(--text-4xl)', { lineHeight: '2.25rem' }],
      },

      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        full: 'var(--radius-full)',
      },

      transitionDuration: {
        fast: '100ms',
        base: '150ms',
        slow: '250ms',
      },
    },
  },
  plugins: [],
}

export default config
