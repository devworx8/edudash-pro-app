/**
 * PremiumCosmicOrb Styles
 * 
 * Extracted styles for the PremiumCosmicOrb component
 * to comply with WARP.md file size limits.
 */

import { Platform, StyleSheet } from 'react-native';

export const sparkles = Array.from({ length: 48 }, (_, i) => ({
  x: (i * 19 + 7) % 96,
  y: (i * 29 + 13) % 96,
  size: i % 8 === 0 ? 3 : i % 5 === 0 ? 2.3 : i % 3 === 0 ? 1.9 : 1.2,
  color: i % 5 === 0
    ? 'rgba(244,208,255,0.92)'
    : i % 3 === 0
      ? 'rgba(125,241,255,0.88)'
      : 'rgba(255,255,255,0.8)',
  delay: i * 50,
}));

export const rings = [
  { radius: 0.88, width: 2.2, color: 'rgba(234,122,255,0.72)' },
  { radius: 0.96, width: 1.9, color: 'rgba(208,104,255,0.62)' },
  { radius: 1.04, width: 1.6, color: 'rgba(186,92,255,0.50)' },
  { radius: 1.12, width: 1.4, color: 'rgba(166,86,255,0.38)' },
  { radius: 1.20, width: 1.2, color: 'rgba(164,96,255,0.26)' },
  { radius: 1.28, width: 1.0, color: 'rgba(164,96,255,0.16)' },
];

export function generateNebulaSparkles(count: number) {
  const dots: { x: number; y: number; r: number; c: string }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i * 137.5 * Math.PI) / 180;
    const dist = ((i * 9 + 4) % 42) / 100;
    const cx = 50 + Math.cos(angle) * dist * 100;
    const cy = 50 + Math.sin(angle) * dist * 100;
    dots.push({
      x: Math.max(6, Math.min(94, cx)),
      y: Math.max(6, Math.min(94, cy)),
      r: i % 8 === 0 ? 2.8 : i % 3 === 0 ? 1.8 : 1.0,
      c: i % 4 === 0
        ? 'rgba(255,255,255,0.94)'
        : i % 3 === 0
          ? 'rgba(125,241,255,0.85)'
          : i % 2 === 0
            ? 'rgba(147,197,253,0.72)'
            : 'rgba(225,190,255,0.60)',
    });
  }
  return dots;
}

export const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sphere: {
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#818cf8',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius: 32,
      },
      android: { elevation: 18 },
    }),
  },
});