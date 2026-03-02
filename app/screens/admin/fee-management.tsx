/**
 * Fee Management Screen
 * 
 * Allows principals and admins to:
 * - View all fee structures for their organization
 * - Add new fee types (registration, tuition, materials, etc.)
 * - Edit existing fee amounts
 * - Delete fee structures
 * - Manage promotional campaigns for registration
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TouchableWithoutFeedback, TextInput, StyleSheet, Modal, RefreshControl, Keyboard, KeyboardAvoidingView, Platform, Share } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { normalizeSchoolFeeCategoryCode } from '@/lib/utils/feeUtils';
import * as Clipboard from 'expo-clipboard';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useFinanceAccessGuard } from '@/hooks/useFinanceAccessGuard';
import FinancePasswordPrompt from '@/components/security/FinancePasswordPrompt';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface FeeStructure {
  id: string;
  name: string;
  description?: string;
  amount: number;
  due_day_of_month?: number | null;
  fee_type:
    | 'registration'
    | 'tuition'
    | 'deposit'
    | 'transport'
    | 'meals'
    | 'activities'
    | 'aftercare'
    | 'excursion'
    | 'fundraiser'
    | 'donation_drive'
    | 'uniform'
    | 'books'
    | 'materials'
    | 'uniform_tshirt'
    | 'uniform_shorts'
    | 'other';
  frequency: 'one_time' | 'monthly' | 'quarterly' | 'yearly';
  is_active: boolean;
  source?: 'school_fee_structures' | 'fee_structures';
}

interface PromoCampaign {
  id: string;
  code: string;
  name: string;
  discount_type: 'percentage' | 'fixed_amount' | 'fixed_price';
  discount_value: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
  max_uses?: number | null;
  current_uses: number;
}

const FEE_TYPES = [
  { value: 'registration', label: '📋 Registration', icon: 'document-text' },
  { value: 'tuition', label: '📚 Tuition', icon: 'school' },
  { value: 'deposit', label: '🪪 Deposit', icon: 'card' },
  { value: 'transport', label: '🚌 Transport', icon: 'bus' },
  { value: 'meals', label: '🍽️ Meals', icon: 'restaurant' },
  { value: 'activities', label: '🎯 Activities', icon: 'game-controller' },
  { value: 'aftercare', label: '🌙 Aftercare', icon: 'moon' },
  { value: 'excursion', label: '🧭 Excursion', icon: 'map' },
  { value: 'fundraiser', label: '💸 Fundraiser', icon: 'cash' },
  { value: 'donation_drive', label: '🤝 Donation Drive', icon: 'heart' },
  { value: 'uniform', label: '🎽 Uniform (Full set)', icon: 'shirt' },
  { value: 'books', label: '📚 Books & Stationery', icon: 'library' },
  { value: 'materials', label: '🎨 Materials', icon: 'color-palette' },
  { value: 'uniform_tshirt', label: '👕 Uniform (T-shirt)', icon: 'shirt' },
  { value: 'uniform_shorts', label: '🩳 Uniform (Shorts)', icon: 'shirt' },
  { value: 'other', label: '📦 Other', icon: 'cube' },
];

const FREQUENCIES = [
  { value: 'one_time', label: 'One-time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

export default function FeeManagementScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const insets = useSafeAreaInsets();
  const organizationId = profile?.organization_id || profile?.preschool_id;
  const schoolId = profile?.preschool_id || profile?.organization_id || null;
  const financeAccess = useFinanceAccessGuard();
  const modalPaddingBottom = Platform.OS === 'android'
    ? Math.max(insets.bottom, 32)
    : Math.max(insets.bottom, 12);
  
  // Create styles early to use in all render paths
  const styles = createStyles(theme);

  // State
  const [fees, setFees] = useState<FeeStructure[]>([]);
  const [promos, setPromos] = useState<PromoCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isGeneratingMonthlyFees, setIsGeneratingMonthlyFees] = useState(false);
  
  // Modal state
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeStructure | null>(null);
  const [editingPromo, setEditingPromo] = useState<PromoCampaign | null>(null);
  
  // Form state
  const [feeForm, setFeeForm] = useState({
    name: '',
    description: '',
    amount: '',
    due_day_of_month: '',
    fee_type: 'tuition' as FeeStructure['fee_type'],
    frequency: 'monthly' as FeeStructure['frequency'],
    is_active: true,
  });
  
  const [promoForm, setPromoForm] = useState({
    code: '',
    name: '',
    discount_type: 'percentage' as PromoCampaign['discount_type'],
    discount_value: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    max_uses: '',
    is_active: true,
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    if (financeAccess.needsPassword) return;
    if (!organizationId) return;
    
    try {
      const supabase = assertSupabase();
      
      // Fetch fee structures (canonical first: school_fee_structures)
      const { data: schoolFeesData, error: schoolFeesError } = await supabase
        .from('school_fee_structures')
        .select('id, name, description, amount_cents, fee_category, billing_frequency, due_day_of_month, is_active')
        .eq('preschool_id', organizationId)
        .order('fee_category', { ascending: true });

      if (!schoolFeesError && Array.isArray(schoolFeesData) && schoolFeesData.length > 0) {
        setFees(
          schoolFeesData.map((row: any) => ({
            id: row.id,
            name: row.name,
              description: row.description || '',
              amount: Number(row.amount_cents || 0) / 100,
              due_day_of_month: row.due_day_of_month ?? null,
              fee_type: (row.fee_category || 'other') as FeeStructure['fee_type'],
              frequency: (row.billing_frequency || 'monthly') as FeeStructure['frequency'],
              is_active: row.is_active !== false,
            source: 'school_fee_structures' as const,
          })),
        );
      } else {
        if (schoolFeesError) {
          console.warn('school_fee_structures fetch failed. Falling back to fee_structures:', schoolFeesError);
        }

        const { data: legacyFeesData, error: legacyFeesError } = await supabase
          .from('fee_structures')
          .select('id, name, description, amount, fee_type, frequency, due_day, is_active')
          .eq('preschool_id', organizationId)
          .order('fee_type', { ascending: true });

        if (legacyFeesError) throw legacyFeesError;
        setFees(
          (legacyFeesData || []).map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description || '',
            amount: Number(row.amount || 0),
            due_day_of_month: row.due_day ?? null,
            fee_type: (row.fee_type || 'other') as FeeStructure['fee_type'],
            frequency: (row.frequency || 'monthly') as FeeStructure['frequency'],
            is_active: row.is_active !== false,
            source: 'fee_structures' as const,
          })),
        );
      }
      
      // Fetch promo campaigns from marketing_campaigns (source of truth)
      const { data: promosData, error: promosError } = await supabase
        .from('marketing_campaigns')
        .select('id, name, promo_code, discount_type, discount_value, max_redemptions, current_redemptions, start_date, end_date, active')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (promosError) {
        console.warn('Promos fetch error:', promosError);
      }

      const now = new Date();
      const mappedPromos = (promosData || [])
        .filter((promo: any) => promo.promo_code)
        .map((promo: any) => {
          const normalizedType =
            promo.discount_type === 'waive_registration' || promo.discount_type === 'first_month_free'
              ? 'fixed_price'
              : promo.discount_type;

          return {
            id: promo.id,
            code: promo.promo_code,
            name: promo.name,
            discount_type: normalizedType,
            discount_value: promo.discount_value ?? 0,
            max_uses: promo.max_redemptions ?? null,
            current_uses: promo.current_redemptions ?? 0,
            is_active: promo.active ?? true,
            start_date: promo.start_date,
            end_date: promo.end_date,
          } as PromoCampaign;
        });

      const filteredPromos = mappedPromos.filter((promo) => {
        if (!promo.end_date) return true;
        const endDate = new Date(promo.end_date);
        const isPast = !Number.isNaN(endDate.getTime()) && endDate.getTime() < now.getTime();
        return !(promo.is_active === false && isPast);
      });

      setPromos(filteredPromos);
      
    } catch (err: any) {
      console.error('Fetch error:', err);
      showAlert({ title: 'Error', message: 'Failed to load fee data', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [financeAccess.needsPassword, organizationId, showAlert]);

  useEffect(() => {
    if (!financeAccess.needsPassword) {
      fetchData();
    }
  }, [fetchData, financeAccess.needsPassword]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleGenerateThisMonthFees = () => {
    if (!organizationId) {
      showAlert({ title: 'Error', message: 'Organization not found. Please re-login.', type: 'error' });
      return;
    }

    const now = new Date();
    const currentMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthLabel = new Date(currentMonthIso).toLocaleDateString('en-ZA', {
      month: 'long',
      year: 'numeric',
    });

    showAlert({
      title: 'Generate Monthly Fees',
      message: `Generate missing ${monthLabel} tuition fees for all active students now? Existing rows will not be duplicated.`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setIsGeneratingMonthlyFees(true);
            try {
              const supabase = assertSupabase();
              const { data, error } = await supabase.functions.invoke('generate-monthly-fees', {
                body: {
                  target_month: currentMonthIso,
                  preschool_id: schoolId || organizationId,
                },
              });

              if (error) throw error;
              if (!data?.success) throw new Error(data?.error || 'Failed to generate monthly fees');

              const feesCreated = Number(data.total_fees_created || 0);
              const schoolsProcessed = Number(data.schools_processed || 0);
              const totalErrors = Number(data.total_errors || 0);
              const feeRowLabel = feesCreated === 1 ? 'fee row' : 'fee rows';

              if (totalErrors > 0) {
                showAlert({
                  title: 'Generated With Warnings',
                  message:
                    `Created ${feesCreated} ${feeRowLabel} for ${monthLabel} across ${schoolsProcessed} school(s). ` +
                    `${totalErrors} warning(s) were reported. Check edge logs if needed.`,
                  type: 'warning',
                });
              } else {
                showAlert({
                  title: feesCreated > 0 ? 'Fees Generated' : 'No Missing Fees',
                  message:
                    feesCreated > 0
                      ? `Created ${feesCreated} ${feeRowLabel} for ${monthLabel} across ${schoolsProcessed} school(s).`
                      : `No missing ${monthLabel} fee rows were found.`,
                  type: 'success',
                });
              }

              await fetchData();
            } catch (err: any) {
              console.error('Generate monthly fees error:', err);
              showAlert({ title: 'Generation Failed', message: err.message || 'Failed to generate monthly fees', type: 'error' });
            } finally {
              setIsGeneratingMonthlyFees(false);
            }
          },
        },
      ],
    });
  };

  // Save fee structure
  const handleSaveFee = async () => {
    if (!feeForm.name.trim() || !feeForm.amount) {
      showAlert({ title: 'Validation', message: 'Please fill in name and amount', type: 'warning' });
      return;
    }

    const parsedDueDay = feeForm.due_day_of_month.trim() ? Number.parseInt(feeForm.due_day_of_month, 10) : Number.NaN;
    const dueDayOfMonth = Number.isFinite(parsedDueDay) ? Math.min(Math.max(parsedDueDay, 1), 28) : null;
    if (feeForm.due_day_of_month.trim() && !Number.isFinite(parsedDueDay)) {
      showAlert({ title: 'Validation', message: 'Due day must be a number between 1 and 28.', type: 'warning' });
      return;
    }
    
    setSaving(true);
    try {
      const supabase = assertSupabase();
      const amountValue = Math.max(0, Number.parseFloat(feeForm.amount) || 0);
      const canonicalFeeCategory = normalizeSchoolFeeCategoryCode(feeForm.fee_type);
      const canonicalPayload = {
        name: feeForm.name.trim(),
        description: feeForm.description.trim() || null,
        amount_cents: Math.round(amountValue * 100),
        fee_category: canonicalFeeCategory,
        billing_frequency: feeForm.frequency,
        due_day_of_month: dueDayOfMonth,
        is_active: feeForm.is_active,
        preschool_id: organizationId,
        created_by: profile?.id || user?.id || null,
      };
      const legacyPayload = {
        name: feeForm.name.trim(),
        description: feeForm.description.trim() || null,
        amount: amountValue,
        fee_type: feeForm.fee_type,
        frequency: feeForm.frequency,
        due_day: dueDayOfMonth,
        is_active: feeForm.is_active,
        preschool_id: organizationId,
        created_by: profile?.id || user?.id || null,
      };

      let action: 'created' | 'updated' = 'created';
      let usedLegacyFallback = false;

      const saveCanonical = async () => {
        if (editingFee?.source === 'school_fee_structures') {
          const { error } = await supabase
            .from('school_fee_structures')
            .update(canonicalPayload)
            .eq('id', editingFee.id);
          if (error) throw error;
          action = 'updated';
          return;
        }

        const { error } = await supabase.from('school_fee_structures').insert(canonicalPayload);
        if (error) throw error;
        action = editingFee ? 'updated' : 'created';

        // If we edited a legacy fee, soft-retire it once canonical copy is created.
        if (editingFee?.source === 'fee_structures') {
          await supabase
            .from('fee_structures')
            .update({ is_active: false })
            .eq('id', editingFee.id);
        }
      };

      try {
        await saveCanonical();
      } catch (canonicalError: any) {
        console.warn('Canonical fee save failed. Falling back to legacy fee_structures:', canonicalError);
        usedLegacyFallback = true;
        if (editingFee) {
          const { error } = await supabase
            .from('fee_structures')
            .update(legacyPayload)
            .eq('id', editingFee.id);
          if (error) throw error;
          action = 'updated';
        } else {
          const { error } = await supabase.from('fee_structures').insert(legacyPayload);
          if (error) throw error;
          action = 'created';
        }
      }

      showAlert({
        title: 'Success',
        message:
          action === 'updated'
            ? usedLegacyFallback
              ? 'Fee updated via legacy table. Canonical migration will continue on next save.'
              : 'Fee updated successfully'
            : usedLegacyFallback
              ? 'Fee created via legacy table. Canonical migration will continue on next save.'
              : 'Fee created successfully',
        type: 'success',
      });
      
      setShowFeeModal(false);
      resetFeeForm();
      fetchData();
    } catch (err: any) {
      console.error('Save fee error:', err);
      showAlert({ title: 'Error', message: err.message || 'Failed to save fee', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Delete fee structure
  const handleDeleteFee = (fee: FeeStructure) => {
    showAlert({
      title: 'Delete Fee',
      message: `Are you sure you want to delete "${fee.name}"?`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const table = fee.source === 'school_fee_structures' ? 'school_fee_structures' : 'fee_structures';
              const { error } = await assertSupabase()
                .from(table)
                .delete()
                .eq('id', fee.id);

              if (error) throw error;
              showAlert({ title: 'Deleted', message: 'Fee structure removed', type: 'success' });
              fetchData();
            } catch (err: any) {
              showAlert({ title: 'Error', message: err.message || 'Failed to delete', type: 'error' });
            }
          },
        },
      ],
    });
  };

  // Delete promo campaign
  const handleDeletePromo = (promo: PromoCampaign) => {
    showAlert({
      title: 'Delete Promo',
      message: `Are you sure you want to delete "${promo.code}"?`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data, error } = await assertSupabase()
                .from('marketing_campaigns')
                .delete()
                .eq('id', promo.id)
                .select('id')
                .maybeSingle();

              if (error || !data) {
                const archivePayload = {
                  active: false,
                  end_date: new Date().toISOString(),
                };
                const { error: archiveError } = await assertSupabase()
                  .from('marketing_campaigns')
                  .update(archivePayload)
                  .eq('id', promo.id);
                if (archiveError) throw archiveError;
                showAlert({ title: 'Archived', message: 'Promo archived because delete is restricted.', type: 'warning' });
                fetchData();
                return;
              }

              showAlert({ title: 'Deleted', message: 'Promo code removed', type: 'success' });
              fetchData();
            } catch (err: any) {
              showAlert({ title: 'Error', message: err.message || 'Failed to delete promo', type: 'error' });
            }
          },
        },
      ],
    });
  };

  // Share promo campaign
  const sharePromo = async (promo: PromoCampaign) => {
    const discountText = promo.discount_type === 'percentage'
      ? `${promo.discount_value}% off`
      : `R${promo.discount_value} off`;
    const startDate = promo.start_date
      ? new Date(promo.start_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    const endDate = promo.end_date
      ? new Date(promo.end_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    const dateText = startDate && endDate ? `Valid ${startDate} - ${endDate}` : endDate ? `Valid until ${endDate}` : '';

    const message = `🎁 ${promo.name}\n` +
      `Use code: ${promo.code}\n` +
      `💰 ${discountText}\n` +
      `${dateText ? `📅 ${dateText}\n` : ''}` +
      `\nEnroll now via EduDash Pro!`;

    try {
      if (Platform.OS !== 'web') {
        await Share.share({ message, title: promo.name });
      } else if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: promo.name, text: message });
      } else {
        await Clipboard.setStringAsync(message);
        showAlert({
          title: 'Copied to Clipboard! 📋',
          message: 'Promo details copied. You can now paste and share via WhatsApp, email, or any other app.',
          type: 'success',
        });
      }
    } catch (error) {
      try {
        await Clipboard.setStringAsync(message);
        showAlert({
          title: 'Copied to Clipboard! 📋',
          message: 'Promo details copied. You can now paste and share via WhatsApp, email, or any other app.',
          type: 'success',
        });
      } catch (clipError) {
        console.error('Share promo error:', clipError);
      }
    }
  };

  // Save promo campaign
  const handleSavePromo = async () => {
    if (!promoForm.code.trim() || !promoForm.name.trim() || !promoForm.discount_value) {
      showAlert({ title: 'Validation', message: 'Please fill in code, name, and discount value', type: 'warning' });
      return;
    }

    if (!organizationId) {
      showAlert({ title: 'Error', message: 'Organization not found. Please re-login.', type: 'error' });
      return;
    }
    
    setSaving(true);
    try {
      const supabase = assertSupabase();
      const startDate = promoForm.start_date || new Date().toISOString().split('T')[0];
      const endDate = promoForm.end_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const payload = {
        organization_id: organizationId,
        name: promoForm.name.trim(),
        promo_code: promoForm.code.trim().toUpperCase(),
        campaign_type: 'seasonal_promo',
        discount_type: promoForm.discount_type === 'fixed_price' ? 'fixed_amount' : promoForm.discount_type,
        discount_value: parseFloat(promoForm.discount_value),
        start_date: startDate,
        end_date: endDate,
        max_redemptions: promoForm.max_uses ? parseInt(promoForm.max_uses) : null,
        current_redemptions: editingPromo?.current_uses || 0,
        active: promoForm.is_active,
        featured: false,
      };
      
      if (editingPromo) {
        const { error } = await supabase
          .from('marketing_campaigns')
          .update(payload)
          .eq('id', editingPromo.id);
        
        if (error) throw error;
        showAlert({ title: 'Success', message: 'Promo updated successfully', type: 'success' });
      } else {
        const { error } = await supabase
          .from('marketing_campaigns')
          .insert(payload);
        
        if (error) throw error;
        showAlert({ title: 'Success', message: 'Promo created successfully', type: 'success' });
      }
      
      setShowPromoModal(false);
      resetPromoForm();
      fetchData();
    } catch (err: any) {
      console.error('Save promo error:', err);
      showAlert({ title: 'Error', message: err.message || 'Failed to save promo', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Reset forms
  const resetFeeForm = () => {
    setEditingFee(null);
    setFeeForm({
      name: '',
      description: '',
      amount: '',
      due_day_of_month: '',
      fee_type: 'tuition',
      frequency: 'monthly',
      is_active: true,
    });
  };

  const resetPromoForm = () => {
    setEditingPromo(null);
    setPromoForm({
      code: '',
      name: '',
      discount_type: 'percentage',
      discount_value: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      max_uses: '',
      is_active: true,
    });
  };

  // Edit fee
  const openEditFee = (fee: FeeStructure) => {
    setEditingFee(fee);
    setFeeForm({
      name: fee.name,
      description: fee.description || '',
      amount: fee.amount.toString(),
      due_day_of_month: fee.due_day_of_month != null ? String(fee.due_day_of_month) : '',
      fee_type: fee.fee_type,
      frequency: fee.frequency,
      is_active: fee.is_active,
    });
    setShowFeeModal(true);
  };

  // Edit promo
  const openEditPromo = (promo: PromoCampaign) => {
    setEditingPromo(promo);
    setPromoForm({
      code: promo.code,
      name: promo.name,
      discount_type: promo.discount_type === 'fixed_price' ? 'fixed_amount' : promo.discount_type,
      discount_value: promo.discount_value.toString(),
      start_date: promo.start_date?.split('T')[0] || '',
      end_date: promo.end_date?.split('T')[0] || '',
      max_uses: promo.max_uses?.toString() || '',
      is_active: promo.is_active,
    });
    setShowPromoModal(true);
  };

  // Permission check
  const canManage = profile?.role === 'principal' || profile?.role === 'admin' || profile?.role === 'super_admin';

  if (!canManage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Fee Management' }} />
        <View style={styles.centerContent}>
          <Ionicons name="lock-closed" size={64} color={theme.textSecondary} />
          <Text style={[styles.errorText, { color: theme.text }]}>Access Denied</Text>
          <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 8 }}>
            Only principals and admins can manage fees.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Fee Management' }} />
        <View style={styles.centerContent}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={{ color: theme.textSecondary, marginTop: 16 }}>Loading fee data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Fee Management', headerShown: false }} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Fee Management</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />}
      >
        {/* Fee Structures Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Fee Structures</Text>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.primary }]}
              onPress={() => { resetFeeForm(); setShowFeeModal(true); }}
            >
              <Ionicons name="add" size={20} color={theme.onPrimary} />
              <Text style={[styles.addButtonText, { color: theme.onPrimary }]}>Add Fee</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.generateNowButton,
              { backgroundColor: theme.info || theme.primary, opacity: isGeneratingMonthlyFees ? 0.7 : 1 },
            ]}
            onPress={handleGenerateThisMonthFees}
            disabled={isGeneratingMonthlyFees}
          >
            {isGeneratingMonthlyFees ? (
              <EduDashSpinner size="small" color={theme.onPrimary} />
            ) : (
              <Ionicons name="refresh-circle-outline" size={18} color={theme.onPrimary} />
            )}
            <Text style={[styles.generateNowButtonText, { color: theme.onPrimary }]}>
              {isGeneratingMonthlyFees ? 'Generating Fees...' : 'Generate This Month Fees Now'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.generateNowHint, { color: theme.textSecondary }]}>
            Creates missing monthly tuition fees immediately without duplicating existing fee rows.
          </Text>
          
          {fees.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
              <Ionicons name="receipt-outline" size={48} color={theme.textSecondary} />
              <Text style={{ color: theme.textSecondary, marginTop: 8 }}>No fee structures yet</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Tap "Add Fee" to create one</Text>
            </View>
          ) : (
            fees.map((fee) => (
              <TouchableOpacity
                key={fee.id}
                style={[styles.feeCard, { backgroundColor: theme.surface }]}
                onPress={() => openEditFee(fee)}
              >
                <View style={styles.feeCardLeft}>
                  <View style={[styles.feeTypeIcon, { backgroundColor: theme.primary + '20' }]}>
                    <Ionicons 
                      name={FEE_TYPES.find(t => t.value === fee.fee_type)?.icon as any || 'cube'} 
                      size={20} 
                      color={theme.primary} 
                    />
                  </View>
                  <View style={styles.feeInfo}>
                    <Text style={[styles.feeName, { color: theme.text }]}>{fee.name}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                      {fee.frequency.replace('_', '-')} • {fee.is_active ? '✅ Active' : '❌ Inactive'}
                    </Text>
                    {fee.due_day_of_month != null && (
                      <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>
                        Due day: {fee.due_day_of_month}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.feeCardRight}>
                  <Text style={[styles.feeAmount, { color: theme.primary }]}>R {fee.amount.toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => handleDeleteFee(fee)}>
                    <Ionicons name="trash-outline" size={18} color={theme.error} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Promo Campaigns Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Promo Codes</Text>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: theme.secondary || '#10b981' }]}
              onPress={() => { resetPromoForm(); setShowPromoModal(true); }}
            >
              <Ionicons name="pricetag" size={18} color="#fff" />
              <Text style={[styles.addButtonText, { color: '#fff' }]}>Add Promo</Text>
            </TouchableOpacity>
          </View>
          
          {promos.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
              <Ionicons name="pricetags-outline" size={48} color={theme.textSecondary} />
              <Text style={{ color: theme.textSecondary, marginTop: 8 }}>No promo codes yet</Text>
            </View>
          ) : (
            promos.map((promo) => (
              <TouchableOpacity
                key={promo.id}
                style={[styles.promoCard, { backgroundColor: theme.surface, borderColor: promo.is_active ? '#10b981' : theme.border }]}
                onPress={() => openEditPromo(promo)}
              >
                <View style={styles.promoHeader}>
                  <Text style={[styles.promoCode, { color: theme.primary }]}>{promo.code}</Text>
                  <View style={[styles.promoBadge, { backgroundColor: promo.is_active ? '#10b98120' : theme.error + '20' }]}>
                    <Text style={{ color: promo.is_active ? '#10b981' : theme.error, fontSize: 10, fontWeight: '600' }}>
                      {promo.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: theme.text, marginTop: 4 }}>{promo.name}</Text>
                <View style={styles.promoStats}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {promo.discount_type === 'percentage' ? `${promo.discount_value}% off` : `R${promo.discount_value} off`}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    Used: {promo.current_uses}{promo.max_uses ? `/${promo.max_uses}` : ''}
                  </Text>
                </View>
                <View style={styles.promoActions}>
                  <TouchableOpacity
                    style={[styles.promoActionButton, { borderColor: theme.border }]}
                    onPress={() => sharePromo(promo)}
                  >
                    <Ionicons name="share-social-outline" size={16} color={theme.primary} />
                    <Text style={[styles.promoActionText, { color: theme.primary }]}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.promoActionButton, { borderColor: theme.error }]}
                    onPress={() => handleDeletePromo(promo)}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.error} />
                    <Text style={[styles.promoActionText, { color: theme.error }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Fee Modal */}
      <Modal visible={showFeeModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 12 : 0}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={[styles.modalContent, { backgroundColor: theme.background, paddingBottom: modalPaddingBottom }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {editingFee ? 'Edit Fee' : 'Add New Fee'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowFeeModal(false)}>
                    <Ionicons name="close" size={24} color={theme.text} />
                  </TouchableOpacity>
                </View>
                
                <ScrollView
                  style={styles.modalBody}
                  contentContainerStyle={[styles.modalBodyContent, { paddingBottom: modalPaddingBottom + 16 }]}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                >
              <Text style={[styles.label, { color: theme.text }]}>Fee Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={feeForm.name}
                onChangeText={(v) => setFeeForm({ ...feeForm, name: v })}
                placeholder="e.g. Monthly Tuition"
                placeholderTextColor={theme.textSecondary}
              />
              
              <Text style={[styles.label, { color: theme.text }]}>Amount (R) *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={feeForm.amount}
                onChangeText={(v) => setFeeForm({ ...feeForm, amount: v.replace(/[^0-9.]/g, '') })}
                placeholder="e.g. 680.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
              />
              
              <Text style={[styles.label, { color: theme.text }]}>Fee Type *</Text>
              <View style={styles.buttonGroup}>
                {FEE_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.typeButton,
                      { backgroundColor: feeForm.fee_type === type.value ? theme.primary : theme.surface, borderColor: theme.border }
                    ]}
                    onPress={() => setFeeForm({ ...feeForm, fee_type: type.value as any })}
                  >
                    <Text style={{ color: feeForm.fee_type === type.value ? theme.onPrimary : theme.text, fontSize: 12 }}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Text style={[styles.label, { color: theme.text }]}>Frequency *</Text>
              <View style={styles.buttonGroup}>
                {FREQUENCIES.map((freq) => (
                  <TouchableOpacity
                    key={freq.value}
                    style={[
                      styles.typeButton,
                      { backgroundColor: feeForm.frequency === freq.value ? theme.primary : theme.surface, borderColor: theme.border }
                    ]}
                    onPress={() => setFeeForm({ ...feeForm, frequency: freq.value as any })}
                  >
                    <Text style={{ color: feeForm.frequency === freq.value ? theme.onPrimary : theme.text, fontSize: 12 }}>
                      {freq.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { color: theme.text }]}>Due Day of Month (1-28)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={feeForm.due_day_of_month}
                onChangeText={(v) => setFeeForm({ ...feeForm, due_day_of_month: v.replace(/[^0-9]/g, '') })}
                placeholder="e.g. 7"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
              />
              <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }}>
                Leave blank to use default due-date scheduling.
              </Text>
              
              <Text style={[styles.label, { color: theme.text }]}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={feeForm.description}
                onChangeText={(v) => setFeeForm({ ...feeForm, description: v })}
                placeholder="Brief description of this fee"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={3}
              />
              
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setFeeForm({ ...feeForm, is_active: !feeForm.is_active })}
              >
                <Ionicons 
                  name={feeForm.is_active ? 'checkbox' : 'square-outline'} 
                  size={24} 
                  color={feeForm.is_active ? theme.primary : theme.textSecondary} 
                />
                <Text style={{ color: theme.text, marginLeft: 8 }}>Active</Text>
              </TouchableOpacity>
                </ScrollView>
                
                <View style={[styles.modalFooter, { paddingBottom: modalPaddingBottom + 8 }]}>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: theme.surface }]}
                    onPress={() => setShowFeeModal(false)}
                  >
                    <Text style={{ color: theme.text }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: theme.primary }]}
                    onPress={handleSaveFee}
                    disabled={saving}
                  >
                    {saving ? (
                      <EduDashSpinner color={theme.onPrimary} size="small" />
                    ) : (
                      <Text style={{ color: theme.onPrimary, fontWeight: '600' }}>
                        {editingFee ? 'Update' : 'Create'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Promo Modal */}
      <Modal visible={showPromoModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 12 : 0}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={[styles.modalContent, { backgroundColor: theme.background, paddingBottom: modalPaddingBottom }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {editingPromo ? 'Edit Promo' : 'Add New Promo'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowPromoModal(false)}>
                    <Ionicons name="close" size={24} color={theme.text} />
                  </TouchableOpacity>
                </View>
                
                <ScrollView
                  style={styles.modalBody}
                  contentContainerStyle={[styles.modalBodyContent, { paddingBottom: modalPaddingBottom + 16 }]}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                >
              <Text style={[styles.label, { color: theme.text }]}>Promo Code *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={promoForm.code}
                onChangeText={(v) => setPromoForm({ ...promoForm, code: v.toUpperCase() })}
                placeholder="e.g. WELCOME2026"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
              />
              
              <Text style={[styles.label, { color: theme.text }]}>Campaign Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={promoForm.name}
                onChangeText={(v) => setPromoForm({ ...promoForm, name: v })}
                placeholder="e.g. New Year Registration Special"
                placeholderTextColor={theme.textSecondary}
              />
              
              <Text style={[styles.label, { color: theme.text }]}>Discount Type *</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[
                    styles.typeButton, { flex: 1 },
                    { backgroundColor: promoForm.discount_type === 'percentage' ? theme.primary : theme.surface, borderColor: theme.border }
                  ]}
                  onPress={() => setPromoForm({ ...promoForm, discount_type: 'percentage' })}
                >
                  <Text style={{ color: promoForm.discount_type === 'percentage' ? theme.onPrimary : theme.text }}>
                    % Percentage
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeButton, { flex: 1 },
                    { backgroundColor: promoForm.discount_type === 'fixed_amount' ? theme.primary : theme.surface, borderColor: theme.border }
                  ]}
                  onPress={() => setPromoForm({ ...promoForm, discount_type: 'fixed_amount' })}
                >
                  <Text style={{ color: promoForm.discount_type === 'fixed_amount' ? theme.onPrimary : theme.text }}>
                    R Fixed Amount
                  </Text>
                </TouchableOpacity>
              </View>
              
              <Text style={[styles.label, { color: theme.text }]}>
                Discount Value ({promoForm.discount_type === 'percentage' ? '%' : 'R'}) *
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={promoForm.discount_value}
                onChangeText={(v) => setPromoForm({ ...promoForm, discount_value: v.replace(/[^0-9.]/g, '') })}
                placeholder={promoForm.discount_type === 'percentage' ? 'e.g. 50' : 'e.g. 200'}
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
              />
              
              <Text style={[styles.label, { color: theme.text }]}>Max Uses (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={promoForm.max_uses}
                onChangeText={(v) => setPromoForm({ ...promoForm, max_uses: v.replace(/[^0-9]/g, '') })}
                placeholder="Leave empty for unlimited"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
              />
              
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setPromoForm({ ...promoForm, is_active: !promoForm.is_active })}
              >
                <Ionicons 
                  name={promoForm.is_active ? 'checkbox' : 'square-outline'} 
                  size={24} 
                  color={promoForm.is_active ? theme.primary : theme.textSecondary} 
                />
                <Text style={{ color: theme.text, marginLeft: 8 }}>Active</Text>
              </TouchableOpacity>
                </ScrollView>
                
                <View style={[styles.modalFooter, { paddingBottom: modalPaddingBottom + 8 }]}>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: theme.surface }]}
                    onPress={() => setShowPromoModal(false)}
                  >
                    <Text style={{ color: theme.text }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: '#10b981' }]}
                    onPress={handleSavePromo}
                    disabled={saving}
                  >
                    {saving ? (
                      <EduDashSpinner color="#fff" size="small" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '600' }}>
                        {editingPromo ? 'Update' : 'Create'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <AlertModal {...alertProps} />
      <FinancePasswordPrompt
        visible={financeAccess.promptVisible}
        onSuccess={financeAccess.markUnlocked}
        onCancel={() => {
          financeAccess.dismissPrompt();
          try {
            router.back();
          } catch {
            router.replace('/screens/admin-dashboard' as any);
          }
        }}
      />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollView: { flex: 1 },
  section: { padding: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: { fontWeight: '600', fontSize: 14 },
  generateNowButton: {
    marginBottom: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  generateNowButtonText: { fontSize: 14, fontWeight: '700' },
  generateNowHint: { fontSize: 12, marginBottom: 10 },
  emptyCard: {
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  feeCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  feeTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  feeInfo: { flex: 1 },
  feeName: { fontSize: 16, fontWeight: '600' },
  feeCardRight: { alignItems: 'flex-end', gap: 8 },
  feeAmount: { fontSize: 18, fontWeight: '800' },
  promoCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
  },
  promoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  promoCode: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  promoBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  promoStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  promoActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  promoActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  promoActionText: { fontSize: 12, fontWeight: '600' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalKeyboard: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 16 },
  modalBodyContent: { paddingBottom: 24 },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  buttonGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
});
