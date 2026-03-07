import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '..');
const envAllowedDevOrigins =
  process.env.NEXT_PUBLIC_ALLOWED_DEV_ORIGINS ||
  process.env.ALLOWED_DEV_ORIGINS ||
  '';
const allowedDevOrigins = Array.from(
  new Set(
    ['http://localhost:3000', 'http://127.0.0.1:3000', ...envAllowedDevOrigins.split(',')]
      .map((value) => value.trim())
      .filter(Boolean),
  ),
);

const nextConfig: NextConfig = {
  // Performance optimizations
  reactStrictMode: true,

  // Allow LAN testing in dev without cross-origin warnings.
  // Add comma-separated origins via NEXT_PUBLIC_ALLOWED_DEV_ORIGINS / ALLOWED_DEV_ORIGINS.
  // HMR websocket warnings can still appear in dev when browser host and dev-server host do not match.
  allowedDevOrigins,
  
  // Turbopack configuration (Next.js 16+ default bundler)
  // Using empty config to acknowledge Turbopack while webpack config exists for fallback
  turbopack: {
    root: repoRoot,
    resolveAlias: {
      // Add any module aliases here if needed
    },
  },

  // Keep tracing root aligned with turbopack.root to avoid Next.js warning.
  outputFileTracingRoot: repoRoot,
  
  // Webpack configuration (fallback for non-Turbopack builds)
  webpack: (config, { isServer }) => {
    // Reduce file watching overhead
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules', '**/.git', '**/.next', '**/docs', '**/build'],
      poll: false, // Disable polling
      aggregateTimeout: 300,
    };
    
    // Fix module resolution issues
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
  
  // Optimize production builds
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Optimize bundle
  experimental: {
    optimizePackageImports: ['lucide-react', 'react-icons', '@supabase/supabase-js'],
  },
  
  // Headers for Google Sign-In popups and asset indexing controls
  async headers() {
    return [
      {
        // Allow Google Sign-In popups to communicate with parent window
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
        ],
      },
      // Digital Asset Links for Android App Links verification
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      // Static assets cache - only cache truly static files for 1 year
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
