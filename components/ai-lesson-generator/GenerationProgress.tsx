/**
 * GenerationProgress - Progress display with cancel functionality
 * @module components/ai-lesson-generator/GenerationProgress
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { GenerationProgressProps } from './types';
import { percentWidth } from '@/lib/progress/clampPercent';

/**
 * Get progress message based on progress percentage
 */
function getProgressMessage(progress: number): string {
  if (progress < 10) return 'Initializing AI...';
  if (progress < 30) return 'Analyzing your requirements...';
  if (progress < 50) return 'Generating lesson structure...';
  if (progress < 70) return 'Creating activities and content...';
  if (progress < 90) return 'Finalizing lesson plan...';
  return 'Almost done...';
}

/**
 * Format elapsed time in mm:ss format
 */
function formatElapsedTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Progress component for lesson generation
 */
export function GenerationProgress({
  progress,
  onCancel,
  showCancel = true,
}: GenerationProgressProps) {
  const [pulseAnim] = useState(new Animated.Value(1));
  const [elapsedTime, setElapsedTime] = useState(0);

  // Pulse animation for the progress indicator
  useEffect(() => {
    if (progress.status === 'generating') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [progress.status, pulseAnim]);

  // Track elapsed time
  useEffect(() => {
    if (progress.status === 'generating' && progress.startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - progress.startTime!);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [progress.status, progress.startTime]);

  if (progress.status !== 'generating') {
    return null;
  }

  const displayProgress = Math.min(Math.max(progress.progress, 0), 100);
  const message = progress.message || getProgressMessage(displayProgress);

  return (
    <View style={styles.container}>
      {/* Header with spinner */}
      <View style={styles.header}>
        <Animated.View
          style={[
            styles.spinnerContainer,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Ionicons name="sparkles" size={24} color="#6366F1" />
        </Animated.View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Generating Lesson</Text>
          <Text style={styles.subtitle}>
            {formatElapsedTime(elapsedTime)} elapsed
          </Text>
        </View>
        {showCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle" size={24} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <View
            style={[styles.progressBarFill, { width: percentWidth(displayProgress) }]}
          />
        </View>
        <Text style={styles.progressPercentage}>{displayProgress}%</Text>
      </View>

      {/* Status message */}
      <View style={styles.messageContainer}>
        <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
        <Text style={styles.message}>{message}</Text>
      </View>

      {/* Cancel action */}
      {showCancel && (
        <TouchableOpacity
          style={styles.cancelTextButton}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Ionicons name="stop-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.cancelText}>Cancel Generation</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  spinnerContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  cancelButton: {
    padding: 4,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  progressBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
    minWidth: 40,
    textAlign: 'right',
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  message: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  cancelTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 12,
    gap: 6,
  },
  cancelText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
});

export default GenerationProgress;
