/**
 * Matching Activity Component
 * 
 * Drag-and-drop matching game where students match pairs.
 * Example: Match animals with their sounds, colors with objects, etc.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { percentWidth } from '@/lib/progress/clampPercent';

interface MatchingActivityProps {
  content: {
    pairs: Array<{
      id: string;
      left: { text?: string; image?: string };
      right: { text?: string; image?: string };
    }>;
  };
  onComplete: (score: number) => void;
  theme: any;
}

export function MatchingActivity({ content, onComplete, theme }: MatchingActivityProps) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [incorrectAttempts, setIncorrectAttempts] = useState(0);

  const leftItems = content.pairs.map(p => ({ id: p.id, ...p.left }));
  const rightItems = content.pairs.map(p => ({ id: p.id, ...p.right })).sort(() => Math.random() - 0.5);

  const handleLeftPress = (id: string) => {
    if (matches[id]) return; // Already matched
    setSelectedLeft(id);
  };

  const handleRightPress = (rightId: string) => {
    if (!selectedLeft || Object.values(matches).includes(rightId)) return;

    if (selectedLeft === rightId) {
      // Correct match
      setMatches(prev => ({ ...prev, [selectedLeft]: rightId }));
      setSelectedLeft(null);

      // Check if all matched
      if (Object.keys(matches).length + 1 === content.pairs.length) {
        const maxAttempts = content.pairs.length * 2;
        const score = Math.max(0, Math.round(100 * (1 - incorrectAttempts / maxAttempts)));
        setTimeout(() => onComplete(score), 500);
      }
    } else {
      // Incorrect match
      setIncorrectAttempts(prev => prev + 1);
      setSelectedLeft(null);
    }
  };

  const isMatched = (id: string) => !!matches[id];
  const isMatchedRight = (id: string) => Object.values(matches).includes(id);

  return (
    <View style={styles.container}>
      <View style={styles.matchingArea}>
        {/* Left Column */}
        <View style={styles.column}>
          {leftItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.matchItem,
                { backgroundColor: theme.card },
                isMatched(item.id) && styles.matchedItem,
                selectedLeft === item.id && { borderColor: theme.primary, borderWidth: 3 },
              ]}
              onPress={() => handleLeftPress(item.id)}
              disabled={isMatched(item.id)}
            >
              {item.image && (
                <Image source={{ uri: item.image }} style={styles.matchImage} resizeMode="contain" />
              )}
              {item.text && (
                <Text style={[styles.matchText, { color: theme.text }]}>{item.text}</Text>
              )}
              {isMatched(item.id) && (
                <View style={styles.checkmark}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.success} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Right Column */}
        <View style={styles.column}>
          {rightItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.matchItem,
                { backgroundColor: theme.card },
                isMatchedRight(item.id) && styles.matchedItem,
              ]}
              onPress={() => handleRightPress(item.id)}
              disabled={!selectedLeft || isMatchedRight(item.id)}
            >
              {item.image && (
                <Image source={{ uri: item.image }} style={styles.matchImage} resizeMode="contain" />
              )}
              {item.text && (
                <Text style={[styles.matchText, { color: theme.text }]}>{item.text}</Text>
              )}
              {isMatchedRight(item.id) && (
                <View style={styles.checkmark}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.success} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Progress */}
      <View style={[styles.progressBar, { backgroundColor: theme.cardSecondary }]}>
        <View
          style={[
            styles.progressFill,
            { width: percentWidth((Object.keys(matches).length / content.pairs.length) * 100), backgroundColor: theme.success },
          ]}
        />
      </View>
      <Text style={[styles.progressText, { color: theme.textSecondary }]}>
        {Object.keys(matches).length} / {content.pairs.length} matched
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  matchingArea: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
  },
  column: {
    flex: 1,
    gap: 12,
  },
  matchItem: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  matchedItem: {
    opacity: 0.6,
  },
  matchImage: {
    width: 80,
    height: 80,
    marginBottom: 8,
  },
  matchText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  progressBar: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
  },
});
