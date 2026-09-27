import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['node:sqlite'],
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
};
export default nextConfig;
