/**
 * Payment Review Step
 * Review and payment confirmation step
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MEMBERSHIP_TIERS } from './constants';
import { MEMBER_TYPE_LABELS } from '@/components/membership/types';
import type { RegistrationData } from './types';

interface PaymentStepProps {
  data: RegistrationData;
  theme: any;
}

export function PaymentStep({ data, theme }: PaymentStepProps) {
  const selectedTier = MEMBERSHIP_TIERS.find(t => t.tier === data.membership_tier);
  
  const formatCurrency = (amount: number): string => {
    return `R ${amount.toLocaleString('en-ZA')}`;
  };

  return (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.text }]}>Review & Pay</Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        Confirm your details and complete payment
      </Text>
      
      {/* Summary Card */}
      <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.summaryTitle, { color: theme.text }]}>Registration Summary</Text>
        
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Name</Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>
            {data.first_name} {data.last_name}
          </Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Region</Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{data.region_name}</Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Member Type</Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>
            {MEMBER_TYPE_LABELS[data.member_type]}
          </Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Membership</Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{selectedTier?.title}</Text>
        </View>
        
        <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
        
        <View style={styles.summaryRow}>
          <Text style={[styles.totalLabel, { color: theme.text }]}>Total Amount</Text>
          <Text style={[styles.totalValue, { color: theme.primary }]}>
            {formatCurrency(selectedTier?.price || 0)}
          </Text>
        </View>
      </View>

      {/* Payment Methods */}
      <Text style={[styles.sectionLabel, { color: theme.text }]}>Payment Method</Text>
      <View style={styles.paymentMethods}>
        <TouchableOpacity style={[styles.paymentMethod, { backgroundColor: theme.card, borderColor: theme.primary }]}>
          <Ionicons name="card-outline" size={24} color={theme.primary} />
          <Text style={[styles.paymentMethodText, { color: theme.text }]}>PayFast</Text>
          <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.paymentMethod, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="swap-horizontal-outline" size={24} color={theme.textSecondary} />
          <Text style={[styles.paymentMethodText, { color: theme.text }]}>EFT Transfer</Text>
        </TouchableOpacity>
      </View>

      {/* Terms */}
      <View style={[styles.termsBox, { backgroundColor: theme.surface }]}>
        <Ionicons name="information-circle-outline" size={20} color={theme.textSecondary} />
        <Text style={[styles.termsText, { color: theme.textSecondary }]}>
          By completing registration, you agree to EduPro's Terms of Service and Privacy Policy.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepContent: {
    padding: 16,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    marginVertical: 10,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  paymentMethods: {
    gap: 10,
    marginBottom: 20,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  paymentMethodText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  termsBox: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});
