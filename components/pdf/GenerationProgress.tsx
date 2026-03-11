/**
 * Generation Progress Component
 * 
 * Shows detailed progress during PDF generation with phase tracking
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { PDFProgressEvent } from '@/services/pdf/dashPdfAdapter';
import { percentWidth } from '@/lib/progress/clampPercent';

interface GenerationProgressProps {
  progress: PDFProgressEvent;
  onCancel?: () => void;
}

export function GenerationProgress({ progress, onCancel }: GenerationProgressProps) {
  const { theme } = useTheme();
  const [pulseAnim] = useState(new Animated.Value(1));

  const styles = useThemedStyles((theme) => ({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      paddingHorizontal: 40,
    },
    container: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 32,
      width: '100%',
      maxWidth: 400,
      ...Platform.select({
        ios: {
          shadowColor: theme.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
        },
        android: {
          elevation: 16,
        },
      }),
    },
    header: {
      alignItems: 'center',
      marginBottom: 24,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    phase: {
      fontSize: 16,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: 4,
    },
    message: {
      fontSize: 14,
      color: theme.textTertiary,
      textAlign: 'center',
    },
    progressSection: {
      marginVertical: 24,
    },
    progressBarContainer: {
      height: 8,
      backgroundColor: theme.surfaceVariant,
      borderRadius: 4,
      marginBottom: 12,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      backgroundColor: theme.primary,
      borderRadius: 4,
    },
    progressText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    timeContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    timeText: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    phasesList: {
      marginVertical: 16,
    },
    phaseItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    currentPhaseItem: {
      backgroundColor: theme.primaryLight,
    },
    completedPhaseItem: {
      backgroundColor: theme.successLight,
    },
    pendingPhaseItem: {
      backgroundColor: 'transparent',
    },
    phaseIcon: {
      marginRight: 12,
      width: 20,
      alignItems: 'center',
    },
    phaseText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
    },
    currentPhaseText: {
      color: theme.onPrimary,
    },
    completedPhaseText: {
      color: theme.onSuccess,
    },
    pendingPhaseText: {
      color: theme.textSecondary,
    },
    actionsContainer: {
      marginTop: 24,
      alignItems: 'center',
    },
    cancelButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cancelButtonText: {
      fontSize: 14,
      color: theme.text,
      fontWeight: '500',
    },
  }));

  const phases = [
    { key: 'parse', label: 'Analyzing content', icon: 'search-outline' },
    { key: 'retrieve', label: 'Gathering data', icon: 'cloud-download-outline' },
    { key: 'compose', label: 'Composing layout', icon: 'construct-outline' },
    { key: 'render', label: 'Rendering PDF', icon: 'document-text-outline' },
    { key: 'upload', label: 'Finalizing', icon: 'checkmark-circle-outline' },
  ];

  const getPhaseIndex = (phase: string) => {
    return phases.findIndex(p => p.key === phase);
  };

  const currentPhaseIndex = getPhaseIndex(progress.phase);

  const formatTime = (milliseconds: number) => {
    if (milliseconds < 1000) return '< 1s';
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Pulse animation for active phase
  useEffect(() => {
    const pulse = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (progress.status === 'running') {
          pulse();
        }
      });
    };

    if (progress.status === 'running') {
      pulse();
    }

    return () => {
      pulseAnim.setValue(1);
    };
  }, [progress.status, pulseAnim]);

  const renderPhaseIcon = (phase: any, index: number) => {
    let iconName = phase.icon;
    let iconColor = theme.textSecondary;

    if (index < currentPhaseIndex) {
      iconName = 'checkmark-circle';
      iconColor = theme.success;
    } else if (index === currentPhaseIndex) {
      iconColor = theme.primary;
    }

    return (
      <Animated.View
        style={[
          styles.phaseIcon,
          index === currentPhaseIndex && {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <Ionicons name={iconName} size={16} color={iconColor} />
      </Animated.View>
    );
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Animated.View 
            style={[
              styles.iconContainer,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <Ionicons
              name="document-outline"
              size={28}
              color={theme.onPrimary}
            />
          </Animated.View>

          <Text style={styles.title}>Generating PDF</Text>
          
          <Text style={styles.phase} numberOfLines={1}>
            {phases[currentPhaseIndex]?.label || 'Processing...'}
          </Text>
          
          {progress.message && (
            <Text style={styles.message} numberOfLines={2}>
              {progress.message}
            </Text>
          )}
        </View>

        <View style={styles.progressSection}>
          <Text style={styles.progressText}>
            {Math.round(progress.percentage)}%
          </Text>

          <View style={styles.progressBarContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: percentWidth(progress.percentage),
                },
              ]}
            />
          </View>

          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>
              Elapsed: {formatTime(progress.timeElapsed)}
            </Text>
            {progress.timeRemaining && (
              <Text style={styles.timeText}>
                ~{formatTime(progress.timeRemaining)} remaining
              </Text>
            )}
          </View>
        </View>

        <View style={styles.phasesList}>
          {phases.map((phase, index) => {
            const isCompleted = index < currentPhaseIndex;
            const isCurrent = index === currentPhaseIndex;
            const isPending = index > currentPhaseIndex;

            return (
              <View
                key={phase.key}
                style={[
                  styles.phaseItem,
                  isCompleted && styles.completedPhaseItem,
                  isCurrent && styles.currentPhaseItem,
                  isPending && styles.pendingPhaseItem,
                ]}
              >
                {renderPhaseIcon(phase, index)}
                <Text
                  style={[
                    styles.phaseText,
                    isCompleted && styles.completedPhaseText,
                    isCurrent && styles.currentPhaseText,
                    isPending && styles.pendingPhaseText,
                  ]}
                >
                  {phase.label}
                </Text>
              </View>
            );
          })}
        </View>

        {onCancel && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              accessibilityLabel="Cancel PDF generation"
              accessibilityRole="button"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}