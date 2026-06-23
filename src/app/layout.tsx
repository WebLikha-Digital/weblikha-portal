/**
 * ROOT LAYOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies to every page. Loads fonts and global CSS.
 * Keep this minimal — page-specific wrappers go in (portal)/layout.tsx.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { Bricolage_Grotesque, Inter } from 'next/font/google'
import './globals.css'

const bricolage = Bricolage_Grotesque({
  subsets:  ['latin'],
  variable: '--font-bricolage',
  display:  'swap',
  axes:     ['opsz'],
})

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s | Weblikha Portal',
    default:  'Weblikha Portal',
  },
  description: 'Internal project management portal for Weblikha Digital Inc.',
  robots: 'noindex, nofollow', // Internal tool — never index
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${inter.variable}`}>
      <body>
        {children}
      </body>
    </html>
  )
}
