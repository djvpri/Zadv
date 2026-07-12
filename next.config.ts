import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: {
      bodySizeLimit: '60mb',
    },
  },
  // Naikkan batas body untuk upload file audio/video besar
  middlewareClientMaxBodySize: 60 * 1024 * 1024, // 60MB
}
export default nextConfig
