declare module 'next-pwa' {
  import type { NextConfig } from 'next';
  type RuntimeCaching = any;
  interface PWAOptions {
    dest?: string;
    disable?: boolean;
    register?: boolean;
    skipWaiting?: boolean;
    fallbacks?: { document?: string };
    runtimeCaching?: RuntimeCaching[];
  }
  const withPWA: (options?: PWAOptions) => (config: NextConfig) => NextConfig;
  export default withPWA;
}
