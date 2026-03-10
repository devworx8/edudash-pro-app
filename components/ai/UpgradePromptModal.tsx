/**
 * UpgradePromptModal Component
 * 
 * Shows when user attempts to use a feature not available in their tier
 * Displays required tier, feature benefits, and upgrade CTA
 */

import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TierBadge } from '@/components/ui/TierBadge';
import { getTierInfo, getExclusiveCapabilities, type Tier, type DashCapability } from '@/lib/ai/capabilities';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import { useAds } from '@/contexts/AdsContext';

export interface UpgradePromptModalProps {
  visible: boolean;
  onClose: () => void;
  currentTier: Tier;
  requiredTier: Tier;
  capability: DashCapability;
  featureName?: string;
  /** If provided, enables a "Watch Ad for Free Trial" button on Android free tier */
  onRewardedUnlock?: () => void;
}

export function UpgradePromptModal({
  visible,
  onClose,
  currentTier,
  requiredTier,
  capability,
  featureName,
  onRewardedUnlock,
}: UpgradePromptModalProps) {
  const [adLoading, setAdLoading] = useState(false);
  const requiredTierInfo = getTierInfo(requiredTier);
  const exclusiveFeatures = getExclusiveCapabilities(requiredTier);
  
  const displayName = featureName || formatCapabilityName(capability);

  const handleUpgrade = () => {
    onClose();
    navigateToUpgrade({
      source: 'upgrade_modal',
      reason: 'feature_needed',
    });
  };

  const handleWatchAd = async () => {
    if (!onRewardedUnlock) return;
    setAdLoading(true);
    try {
      onRewardedUnlock();
    } finally {
      setAdLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerIcon}>🔒</Text>
            <Text style={styles.title}>Unlock {displayName}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content}>
            <View style={styles.tierBadgeContainer}>
              <Text style={styles.subtitle}>Requires</Text>
              <TierBadge tier={requiredTier as any} size="md" />
            </View>

            <Text style={styles.description}>
              {displayName} is a {requiredTierInfo.name} feature. Upgrade to unlock this and other powerful capabilities.
            </Text>

            {/* Feature List */}
            <View style={styles.featureList}>
              <Text style={styles.featureListTitle}>What you'll get:</Text>
              {exclusiveFeatures.slice(0, 5).map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <Text style={styles.featureIcon}>✓</Text>
                  <Text style={styles.featureText}>{formatCapabilityName(feature)}</Text>
                </View>
              ))}
              {exclusiveFeatures.length > 5 && (
                <Text style={styles.moreFeatures}>+ {exclusiveFeatures.length - 5} more features</Text>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {onRewardedUnlock && Platform.OS !== 'web' && (
              <TouchableOpacity
                style={[styles.upgradeButton, { backgroundColor: '#10B981' }]}
                onPress={handleWatchAd}
                disabled={adLoading}
              >
                {adLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="play-circle" size={20} color="#fff" />
                    <Text style={styles.upgradeButtonText}>Watch Ad for 30-min Trial</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
              <Text style={styles.upgradeButtonText}>
                Upgrade to {requiredTierInfo.name}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatCapabilityName(capability: DashCapability): string {
  // Convert 'multimodal.vision' to 'Image Analysis'
  const nameMap: Record<string, string> = {
    'chat.streaming': 'Real-time Streaming',
    'chat.thinking': 'AI Reasoning Display',
    'chat.priority': 'Priority Processing',
    'memory.standard': '30-Day Conversation History',
    'memory.advanced': 'Unlimited History & Learning',
    'memory.patterns': 'Pattern Detection',
    'multimodal.vision': 'Image Analysis',
    'multimodal.ocr': 'Text Extraction',
    'multimodal.documents': 'Document Processing',
    'multimodal.handwriting': 'Handwriting Recognition',
    'homework.assign': 'Homework Assignment',
    'homework.grade.basic': 'Auto-Grading (Objective)',
    'homework.grade.advanced': 'Auto-Grading (Essays)',
    'homework.grade.bulk': 'Batch Grading',
    'homework.rubric': 'Rubric Generation',
    'homework.feedback': 'Personalized Feedback',
    'lessons.curriculum': 'Curriculum-Aligned Lessons',
    'lessons.adaptive': 'Adaptive Learning',
    'lessons.personalized': 'Personalized Lessons',
    'insights.proactive': 'Daily Briefings',
    'insights.predictive': 'Predictive Analytics',
    'insights.custom': 'Custom Reports',
    'export.pdf.advanced': 'Advanced PDF Templates',
    'processing.priority': 'Priority Queue Access',
  };

  return nameMap[capability] || capability.split('.').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
  },
  content: {
    padding: 20,
  },
  tierBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  description: {
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  featureList: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
  },
  featureListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureIcon: {
    fontSize: 16,
    color: '#10b981',
    marginRight: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  moreFeatures: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  upgradeButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 14,
  },
});
