/**
 * Registration Complete Step
 * Success screen after registration
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface CompleteStepProps {
  memberNumber: string;
  theme: any;
}

export function CompleteStep({ memberNumber, theme }: CompleteStepProps) {
  return (
    <View style={styles.completeContent}>
      <View style={[styles.successCircle, { backgroundColor: '#10B98120' }]}>
        <Ionicons name="checkmark-circle" size={80} color="#10B981" />
      </View>
      
      <Text style={[styles.completeTitle, { color: theme.text }]}>Welcome to EduPro!</Text>
      <Text style={[styles.completeSubtitle, { color: theme.textSecondary }]}>
        Your registration is complete
      </Text>
      
      <View style={[styles.memberNumberCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.memberNumberLabel, { color: theme.textSecondary }]}>Your Member Number</Text>
        <Text style={[styles.memberNumberValue, { color: theme.primary }]}>{memberNumber}</Text>
      </View>
      
      <View style={styles.nextSteps}>
        <Text style={[styles.nextStepsTitle, { color: theme.text }]}>What's Next?</Text>
        
        <View style={styles.nextStepItem}>
          <View style={[styles.nextStepIcon, { backgroundColor: '#3B82F620' }]}>
            <Ionicons name="mail-outline" size={20} color="#3B82F6" />
          </View>
          <Text style={[styles.nextStepText, { color: theme.textSecondary }]}>
            Check your email for confirmation
          </Text>
        </View>
        
        <View style={styles.nextStepItem}>
          <View style={[styles.nextStepIcon, { backgroundColor: '#8B5CF620' }]}>
            <Ionicons name="card-outline" size={20} color="#8B5CF6" />
          </View>
          <Text style={[styles.nextStepText, { color: theme.textSecondary }]}>
            Your digital ID card is ready
          </Text>
        </View>
        
        <View style={styles.nextStepItem}>
          <View style={[styles.nextStepIcon, { backgroundColor: '#10B98120' }]}>
            <Ionicons name="people-outline" size={20} color="#10B981" />
          </View>
          <Text style={[styles.nextStepText, { color: theme.textSecondary }]}>
            Connect with your regional community
          </Text>
        </View>
      </View>
      
      <TouchableOpacity 
        style={[styles.viewCardButton, { backgroundColor: theme.primary }]}
        onPress={() => router.push('/screens/membership/id-card')}
      >
        <Ionicons name="card" size={20} color="#fff" />
        <Text style={styles.viewCardText}>View My ID Card</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.dashboardButton, { borderColor: theme.primary }]}
        onPress={() => router.push('/screens/membership')}
      >
        <Text style={[styles.dashboardText, { color: theme.primary }]}>Go to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  completeContent: {
    padding: 24,
    alignItems: 'center',
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  completeSubtitle: {
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  memberNumberCard: {
    padding: 20,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 24,
    width: '100%',
  },
  memberNumberLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  memberNumberValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
  },
  nextSteps: {
    width: '100%',
    marginTop: 24,
  },
  nextStepsTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  nextStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  nextStepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextStepText: {
    flex: 1,
    fontSize: 14,
  },
  viewCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    gap: 10,
    marginTop: 24,
    width: '100%',
  },
  viewCardText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  dashboardButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    borderWidth: 2,
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
  },
  dashboardText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
