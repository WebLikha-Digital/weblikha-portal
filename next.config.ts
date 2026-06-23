import type { NextConfig } from 'next'

const config: NextConfig = {
  /**
   * Strict mode catches common React mistakes during development.
   * Keep this on — it double-invokes effects and renders to surface bugs early.
   */
  reactStrictMode: true,

  images: {
    remotePatterns: [
      {
        // Supabase storage bucket for user avatars / project assets
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default config
