import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '60mb',
    },
  },
}
export default nextConfig
