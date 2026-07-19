import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  output: process.env.BUILD_TARGET === 'electron' ? 'standalone' : undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: '60mb',
    },
  },
}
export default nextConfig
