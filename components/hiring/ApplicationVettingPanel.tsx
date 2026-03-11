/**
 * ApplicationVettingPanel — Vetting score, AI screening, and vetting checklist
 * Extracted from application-review screen for WARP.md compliance.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { percentWidth } from '@/lib/progress/clampPercent';
import AIVettingService, {
  type VettingChecklist,
  type VettingScore,
  type AIScreeningResult,
} from '@/lib/services/AIVettingService';

interface Props {
  theme: any;
  vettingScore: VettingScore | null;
  aiScreening: AIScreeningResult | null;
  aiScreeningLoading: boolean;
  checklist: VettingChecklist | null;
  onRunAIScreening: () => void;
  onChecklistToggle: (itemId: string) => void;
}

const CHECKLIST_CATEGORIES = ['identity', 'qualifications', 'experience', 'references', 'compliance', 'background'] as const;

export default function ApplicationVettingPanel({
  theme, vettingScore, aiScreening, aiScreeningLoading, checklist,
  onRunAIScreening, onChecklistToggle,
}: Props) {
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  return (
    <>
      {/* Vetting Score */}
      {vettingScore && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Vetting Score</Text>
            <View style={[styles.riskBadge, { backgroundColor: AIVettingService.getRiskColor(vettingScore.riskLevel) + '20' }]}>
              <Text style={[styles.riskText, { color: AIVettingService.getRiskColor(vettingScore.riskLevel) }]}>
                {vettingScore.riskLevel.toUpperCase()} RISK
              </Text>
            </View>
          </View>
          <View style={styles.scoreBarOuter}>
            <View style={[styles.scoreBarInner, { width: percentWidth(vettingScore.overall), backgroundColor: AIVettingService.getRiskColor(vettingScore.riskLevel) }]} />
          </View>
          <Text style={styles.scoreLabel}>{vettingScore.overall}/100 — {AIVettingService.getVettingStatusText(vettingScore)}</Text>
          <View style={styles.breakdownGrid}>
            {Object.entries(vettingScore.breakdown).map(([key, val]) => (
              <View key={key} style={styles.breakdownItem}>
                <Text style={styles.breakdownValue}>{val}</Text>
                <Text style={styles.breakdownLabel}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</Text>
              </View>
            ))}
          </View>
          {vettingScore.flags.length > 0 && (
            <View style={styles.flagsContainer}>
              {vettingScore.flags.map((flag, i) => (
                <View key={i} style={styles.flagItem}>
                  <Ionicons name="warning" size={14} color="#F59E0B" />
                  <Text style={styles.flagText}>{flag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* AI Screening */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>AI Screening</Text>
          {!aiScreening && !aiScreeningLoading && (
            <TouchableOpacity style={styles.aiButton} onPress={onRunAIScreening}>
              <Ionicons name="sparkles" size={16} color="#FFFFFF" />
              <Text style={styles.aiButtonText}>Run AI Screen</Text>
            </TouchableOpacity>
          )}
        </View>
        {aiScreeningLoading && (
          <View style={styles.aiLoadingRow}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.aiLoadingText}>Analyzing candidate...</Text>
          </View>
        )}
        {aiScreening && (
          <View>
            <View style={styles.aiScoreRow}>
              <View style={styles.aiScoreCircle}>
                <Text style={styles.aiScoreValue}>{aiScreening.score}</Text>
                <Text style={styles.aiScoreMax}>/100</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={[styles.recBadge, { backgroundColor: AIVettingService.getRecommendationColor(aiScreening.recommendation) + '20' }]}>
                  <Text style={[styles.recText, { color: AIVettingService.getRecommendationColor(aiScreening.recommendation) }]}>
                    {AIVettingService.getRecommendationLabel(aiScreening.recommendation)}
                  </Text>
                </View>
                <Text style={styles.aiSummary}>{aiScreening.summary}</Text>
              </View>
            </View>
            {aiScreening.strengths.length > 0 && (
              <AIList title="Strengths" items={aiScreening.strengths} icon="checkmark-circle" iconColor="#10B981" styles={styles} />
            )}
            {aiScreening.concerns.length > 0 && (
              <AIList title="Concerns" items={aiScreening.concerns} icon="alert-circle" iconColor="#F59E0B" styles={styles} />
            )}
            {aiScreening.interviewQuestions.length > 0 && (
              <View style={styles.aiListSection}>
                <Text style={styles.aiListTitle}>Suggested Interview Questions</Text>
                {aiScreening.interviewQuestions.map((q, i) => (
                  <View key={i} style={styles.aiListItem}>
                    <Text style={styles.questionNumber}>{i + 1}.</Text>
                    <Text style={styles.aiListText}>{q}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Vetting Checklist */}
      {checklist && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Vetting Checklist</Text>
            <Text style={styles.completionText}>{checklist.completionPercentage}% Complete</Text>
          </View>
          {CHECKLIST_CATEGORIES.map(cat => {
            const items = checklist.items.filter(i => i.category === cat);
            if (items.length === 0) return null;
            return (
              <View key={cat} style={styles.checklistCategory}>
                <Text style={styles.categoryTitle}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                {items.map((item) => (
                  <TouchableOpacity key={item.id} style={styles.checklistItem} onPress={() => onChecklistToggle(item.id)}>
                    <Ionicons
                      name={item.status === 'passed' ? 'checkbox' : item.status === 'needs_review' ? 'alert-circle' : 'square-outline'}
                      size={22}
                      color={item.status === 'passed' ? '#10B981' : item.status === 'needs_review' ? '#F59E0B' : theme.textSecondary}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.checklistLabel, item.status === 'passed' && styles.checklistLabelPassed]}>{item.label}</Text>
                      {item.details && <Text style={styles.checklistDetails}>{item.details}</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </View>
      )}
    </>
  );
}

function AIList({ title, items, icon, iconColor, styles }: {
  title: string; items: string[]; icon: keyof typeof Ionicons.glyphMap; iconColor: string; styles: any;
}) {
  return (
    <View style={styles.aiListSection}>
      <Text style={styles.aiListTitle}>{title}</Text>
      {items.map((s, i) => (
        <View key={i} style={styles.aiListItem}>
          <Ionicons name={icon} size={16} color={iconColor} />
          <Text style={styles.aiListText}>{s}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    section: { marginBottom: 16, backgroundColor: theme.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: theme.border },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 12 },
    scoreBarOuter: { height: 8, borderRadius: 4, backgroundColor: theme.border, marginBottom: 8, overflow: 'hidden' },
    scoreBarInner: { height: '100%', borderRadius: 4 },
    scoreLabel: { fontSize: 13, color: theme.textSecondary, fontWeight: '500' },
    riskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    riskText: { fontSize: 11, fontWeight: '700' },
    breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    breakdownItem: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: theme.background, borderRadius: 8, minWidth: 60 },
    breakdownValue: { fontSize: 18, fontWeight: '700', color: theme.primary },
    breakdownLabel: { fontSize: 10, color: theme.textSecondary, textAlign: 'center', marginTop: 2 },
    flagsContainer: { marginTop: 12, gap: 6 },
    flagItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    flagText: { fontSize: 12, color: '#F59E0B', flex: 1 },
    aiButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#8B5CF6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
    aiButtonText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
    aiLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
    aiLoadingText: { fontSize: 14, color: theme.textSecondary },
    aiScoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    aiScoreCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.primary + '15', justifyContent: 'center', alignItems: 'center' },
    aiScoreValue: { fontSize: 22, fontWeight: '800', color: theme.primary },
    aiScoreMax: { fontSize: 10, color: theme.textSecondary },
    recBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 6 },
    recText: { fontSize: 12, fontWeight: '700' },
    aiSummary: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
    aiListSection: { marginTop: 12 },
    aiListTitle: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 6 },
    aiListItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
    aiListText: { fontSize: 13, color: theme.text, flex: 1, lineHeight: 19 },
    questionNumber: { fontSize: 13, fontWeight: '700', color: theme.primary, minWidth: 18 },
    completionText: { fontSize: 13, color: theme.primary, fontWeight: '600' },
    checklistCategory: { marginBottom: 12 },
    categoryTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    checklistItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border + '40' },
    checklistLabel: { fontSize: 14, color: theme.text, fontWeight: '500' },
    checklistLabelPassed: { textDecorationLine: 'line-through', color: theme.textSecondary },
    checklistDetails: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  });
