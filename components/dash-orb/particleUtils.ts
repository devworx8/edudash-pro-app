/**
 * Particle Utilities for CosmicOrb
 *
 * Generates and manages particle configurations for the starfield effect
 */

import { PREMIUM_COLORS } from '@/lib/theme/premiumDashTheme';

// =============================================================================
// Types
// =============================================================================

export interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
}

// =============================================================================
// Particle Generation
// =============================================================================

/**
 * Generate particles for the starfield effect
 */
export function generateParticles(size: number, count: number = 20): Particle[] {
  const particles: Particle[] = [];
  const colors = [PREMIUM_COLORS.tertiary, PREMIUM_COLORS.primaryLight, PREMIUM_COLORS.secondary];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const radius = size * 0.3 + Math.random() * size * 0.15;
    particles.push({
      x: size / 2 + Math.cos(angle) * radius,
      y: size / 2 + Math.sin(angle) * radius,
      size: 1.5 + Math.random() * 2,
      color: colors[i % colors.length],
      delay: Math.random() * 2000,
      duration: 1500 + Math.random() * 1500,
    });
  }
  return particles;
}

/**
 * Generate aurora band configuration
 */
export function generateAuroraBands(count: number = 3): Array<{
  color: string;
  rotation: number;
  width: string;
  opacity: number;
}> {
  const colors = ['rgba(139, 92, 246, 0.15)', 'rgba(6, 182, 212, 0.12)', 'rgba(251, 191, 36, 0.1)'];

  return Array.from({ length: count }, (_, i) => ({
    color: colors[i % colors.length],
    rotation: (i * 120) % 360,
    width: '70%',
    opacity: 0.3 - i * 0.05,
  }));
}
