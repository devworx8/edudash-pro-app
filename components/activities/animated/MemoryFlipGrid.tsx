/**
 * MemoryFlipGrid — Real card-flip memory matching game
 *
 * Features:
 * - Grid of face-down cards with emoji pairs
 * - Tap to flip with animated scale transition
 * - Match detection: matched pairs stay face-up with glow
 * - Move counter and flip sound callbacks
 * - Reports completion when all pairs matched
 *
 * ≤400 lines (WARP.md compliant)
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useCelebration } from '@/hooks/useCelebration';
import type { MemoryPair } from '@/lib/activities/preschoolActivities.types';

interface MemoryFlipGridProps {
  pairs: MemoryPair[];
  roundId: string;
  /** Called on each card flip */
  onFlip?: () => void;
  /** Called when a match is found */
  onMatch?: () => void;
  /** Called when all pairs are matched */
  onComplete?: (moves: number) => void;
  /** Play wrong-answer sound */
  onMismatch?: () => void;
  disabled?: boolean;
}

interface CardData {
  id: number;
  emoji: string;
  pairIndex: number;
}

// ── Individual Card ──────────────────────────────────────────

interface FlipCardProps {
  card: CardData;
  isFaceUp: boolean;
  isMatched: boolean;
  onPress: (id: number) => void;
  disabled: boolean;
}

const FlipCard = memo(function FlipCard({
  card,
  isFaceUp,
  isMatched,
  onPress,
  disabled,
}: FlipCardProps) {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const matchGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(flipAnim, {
      toValue: isFaceUp ? 1 : 0,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [isFaceUp]);

  useEffect(() => {
    if (isMatched) {
      Animated.spring(matchGlow, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }).start();
    }
  }, [isMatched]);

  const frontScale = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
  });
  const backScale = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });
  const glowScale = matchGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  return (
    <TouchableOpacity
      onPress={() => onPress(card.id)}
      disabled={disabled || isFaceUp || isMatched}
      activeOpacity={0.7}
      style={s.cardTouchable}
    >
      {/* Matched glow */}
      {isMatched && (
        <Animated.View
          style={[
            s.matchGlow,
            { transform: [{ scale: glowScale }], opacity: matchGlow },
          ]}
        />
      )}

      {/* Card back (face down - question mark) */}
      <Animated.View
        style={[
          s.card,
          s.cardBack,
          { transform: [{ scaleX: frontScale }] },
        ]}
      >
        <Text style={s.cardBackText}>❓</Text>
      </Animated.View>

      {/* Card front (face up - emoji) */}
      <Animated.View
        style={[
          s.card,
          s.cardFront,
          isMatched && s.cardMatched,
          { transform: [{ scaleX: backScale }] },
        ]}
      >
        <Text style={s.cardEmoji}>{card.emoji}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
});

// ── Main Grid ────────────────────────────────────────────────

export function MemoryFlipGrid({
  pairs,
  roundId,
  onFlip,
  onMatch,
  onComplete,
  onMismatch,
  disabled = false,
}: MemoryFlipGridProps) {
  const { selectionHaptic, successHaptic } = useCelebration();
  const [cards, setCards] = useState<CardData[]>([]);
  const [faceUpIds, setFaceUpIds] = useState<number[]>([]);
  const [matchedPairIndices, setMatchedPairIndices] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const completedRef = useRef(false);
  const bannerScale = useRef(new Animated.Value(0)).current;

  // Shuffle and create card pairs
  useEffect(() => {
    const deck: CardData[] = [];
    pairs.forEach((pair, index) => {
      deck.push({ id: index * 2, emoji: pair.emoji, pairIndex: index });
      deck.push({ id: index * 2 + 1, emoji: pair.emoji, pairIndex: index });
    });
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    setCards(deck);
    setFaceUpIds([]);
    setMatchedPairIndices(new Set());
    setMoves(0);
    completedRef.current = false;
    bannerScale.setValue(0);
  }, [roundId, pairs]);

  // Check for match when 2 cards are face up
  useEffect(() => {
    if (faceUpIds.length !== 2) return;
    setIsChecking(true);

    const [first, second] = faceUpIds;
    const card1 = cards.find((c) => c.id === first);
    const card2 = cards.find((c) => c.id === second);

    if (card1 && card2 && card1.pairIndex === card2.pairIndex) {
      // Match found!
      successHaptic();
      onMatch?.();
      const newMatched = new Set(matchedPairIndices);
      newMatched.add(card1.pairIndex);
      setMatchedPairIndices(newMatched);
      setFaceUpIds([]);
      setIsChecking(false);

      // Check completion
      if (newMatched.size === pairs.length && !completedRef.current) {
        completedRef.current = true;
        Animated.spring(bannerScale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }).start();
        setTimeout(() => onComplete?.(moves + 1), 800);
      }
    } else {
      // Mismatch — flip back after delay
      onMismatch?.();
      setTimeout(() => {
        setFaceUpIds([]);
        setIsChecking(false);
      }, 1000);
    }
  }, [faceUpIds, cards, matchedPairIndices, pairs.length, moves]);

  const handleCardPress = useCallback(
    (id: number) => {
      if (isChecking || disabled) return;
      if (faceUpIds.includes(id)) return;
      if (faceUpIds.length >= 2) return;

      const card = cards.find((c) => c.id === id);
      if (!card || matchedPairIndices.has(card.pairIndex)) return;

      selectionHaptic();
      onFlip?.();
      setFaceUpIds((prev) => [...prev, id]);
      setMoves((prev) => prev + 1);
    },
    [isChecking, disabled, faceUpIds, cards, matchedPairIndices],
  );

  const totalPairs = pairs.length;
  const matchedCount = matchedPairIndices.size;

  return (
    <View style={s.container}>
      {/* Progress indicator */}
      <View style={s.progressRow}>
        <Text style={s.progressText}>
          🃏 {matchedCount}/{totalPairs} pairs
        </Text>
        <Text style={s.progressText}>
          👆 {moves} flips
        </Text>
      </View>

      {/* Card grid */}
      <View style={s.grid}>
        {cards.map((card) => (
          <FlipCard
            key={`${roundId}-${card.id}`}
            card={card}
            isFaceUp={faceUpIds.includes(card.id)}
            isMatched={matchedPairIndices.has(card.pairIndex)}
            onPress={handleCardPress}
            disabled={disabled || isChecking}
          />
        ))}
      </View>

      {/* Completion banner */}
      {completedRef.current && (
        <Animated.View
          style={[
            s.completeBanner,
            { transform: [{ scale: bannerScale }], opacity: bannerScale },
          ]}
        >
          <Text style={s.completeBannerText}>
            🎉 All pairs found in {moves} flips!
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 16,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366F1',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  cardTouchable: {
    width: 72,
    height: 88,
    position: 'relative',
  },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  cardBack: {
    backgroundColor: '#6D28D9',
    borderWidth: 2,
    borderColor: '#5B21B6',
  },
  cardBackText: {
    fontSize: 28,
  },
  cardFront: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardMatched: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  cardEmoji: {
    fontSize: 36,
  },
  matchGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: '#10B981',
    opacity: 0.2,
  },
  completeBanner: {
    backgroundColor: '#EDE9FE',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#C4B5FD',
  },
  completeBannerText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#5B21B6',
    textAlign: 'center',
  },
});
