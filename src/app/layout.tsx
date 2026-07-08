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

const FAVICON = 'https://cdn.prod.website-files.com/6829ba317137e68337ab4113/6841dcfbd9aafe194e4c1db1_weblikha_Favicon.png'

export const metadata: Metadata = {
  title: {
    template: '%s | Weblikha Portal',
    default:  'Weblikha Portal',
  },
  description: 'Internal project management portal for Weblikha Digital Inc.',
  robots: 'noindex, nofollow', // Internal tool — never index
  icons: {
    icon:     FAVICON,
    shortcut: FAVICON,
    apple:    '/icons/apple-touch-icon.png', // 180×180 full-bleed — iOS rounds corners itself
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable:    true,
    title:      'Weblikha Portal',
    statusBarStyle: 'black-translucent',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#101010" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
