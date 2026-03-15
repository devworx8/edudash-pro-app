/**
 * features/dash-orb/useOrbAnimations.ts
 *
 * Extracted from DashOrbImpl.tsx — PanResponder setup, pulse/glow
 * animation loops, rotation during processing, expand/collapse spring,
 * and position initialisation.
 */

import { useRef, useEffect } from 'react';
import { Animated, Easing, PanResponder, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface UseOrbAnimationsArgs {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  size: number;
  isExpanded: boolean;
  isProcessing: boolean;
  isDragging: boolean;
  locked: boolean;
  showUpgradeBubble: boolean;
  setIsDragging: (v: boolean) => void;
  setShowUpgradeBubble: (v: boolean) => void;
  upgradeAnim: Animated.Value;
  upgradeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function useOrbAnimations(args: UseOrbAnimationsArgs) {
  const {
    position, size, isExpanded, isProcessing, isDragging, locked,
    showUpgradeBubble, setIsDragging, setShowUpgradeBubble,
    upgradeAnim, upgradeTimerRef,
  } = args;

  const pan = useRef(new Animated.ValueXY()).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const glowLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // ------ Position init ------
  useEffect(() => {
    let initialX = SCREEN_WIDTH - size - 20;
    let initialY = SCREEN_HEIGHT - size - 100;
    switch (position) {
      case 'bottom-left': initialX = 20; initialY = SCREEN_HEIGHT - size - 100; break;
      case 'top-right': initialX = SCREEN_WIDTH - size - 20; initialY = 100; break;
      case 'top-left': initialX = 20; initialY = 100; break;
    }
    pan.setValue({ x: initialX, y: initialY });
  }, [position, size, pan]);

  // ------ PanResponder ------
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        pulseLoopRef.current?.stop();
        glowLoopRef.current?.stop();
        setIsDragging(true);

        if (showUpgradeBubble) {
          if (upgradeTimerRef.current) { clearTimeout(upgradeTimerRef.current); upgradeTimerRef.current = null; }
          upgradeAnim.stopAnimation();
          upgradeAnim.setValue(1);
        }

        dragStartRef.current = { x: (pan.x as any)._value, y: (pan.y as any)._value };
        pan.setOffset({ ...dragStartRef.current });
        pan.setValue({ x: 0, y: 0 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Animated.spring(pulseAnim, { toValue: 0.9, useNativeDriver: false }).start();
      },
      onPanResponderMove: (_, gs) => {
        const edgePadding = 16;
        const topLimit = 80;
        const bottomLimit = 120;
        const horizontalLimit = SCREEN_WIDTH * 0.42;
        const minX = position.includes('left') ? edgePadding : Math.max(edgePadding, horizontalLimit);
        const maxX = position.includes('left')
          ? Math.min(SCREEN_WIDTH * 0.58 - size, SCREEN_WIDTH - size - edgePadding)
          : SCREEN_WIDTH - size - edgePadding;
        const minY = topLimit;
        const maxY = SCREEN_HEIGHT - size - bottomLimit;
        const rawX = dragStartRef.current.x + gs.dx;
        const rawY = dragStartRef.current.y + gs.dy;
        pan.setValue({
          x: Math.max(minX, Math.min(maxX, rawX)) - dragStartRef.current.x,
          y: Math.max(minY, Math.min(maxY, rawY)) - dragStartRef.current.y,
        });
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        setIsDragging(false);
        if (locked && showUpgradeBubble) {
          if (upgradeTimerRef.current) clearTimeout(upgradeTimerRef.current);
          upgradeTimerRef.current = setTimeout(() => {
            Animated.timing(upgradeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
              setShowUpgradeBubble(false),
            );
          }, 2600);
        }
        Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: false }).start(() => {
          pulseLoopRef.current?.start();
          glowLoopRef.current?.start();
        });
      },
    }),
  ).current;

  // ------ Pulse / glow loops ------
  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps -- pulseAnim/glowAnim are stable refs
    if (isDragging) { pulseLoopRef.current?.stop(); glowLoopRef.current?.stop(); return; }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    pulseLoopRef.current = pulse;
    glowLoopRef.current = glow;
    pulse.start();
    glow.start();
    return () => { pulse.stop(); glow.stop(); };
  }, [isDragging, pulseAnim, glowAnim]);

  // ------ Rotation when processing ------
  useEffect(() => {
    if (isProcessing) {
      const rotation = Animated.loop(
        Animated.timing(rotateAnim, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: false }),
      );
      rotation.start();
      return () => rotation.stop();
    }
    rotateAnim.setValue(0);
  }, [isProcessing, rotateAnim]);

  // ------ Expand / collapse ------
  useEffect(() => {
    Animated.spring(expandAnim, { toValue: isExpanded ? 1 : 0, useNativeDriver: false, friction: 8, tension: 40 }).start();
  }, [isExpanded, expandAnim]);

  return { pan, pulseAnim, glowAnim, rotateAnim, expandAnim, panResponder };
}
