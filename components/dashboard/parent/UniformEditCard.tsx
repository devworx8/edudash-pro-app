/**
 * Edit-state form card for a child's uniform order
 * Renders size pickers, quantity inputs, pricing summary, and action buttons
 */

import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import {
  type ChildRow, type UniformEntry, type UniformPricing,
  SIZE_OPTIONS, formatCurrency, computeChildPricing,
} from './UniformSizesSection.styles';

interface Props {
  child: ChildRow;
  entry: UniformEntry;
  pricing?: UniformPricing;
  styles: any;
  nameLabel: string;
  namePlaceholder: string;
  onUpdate: (patch: Partial<UniformEntry>) => void;
  onSetFullQty: (val: string) => void;
  onSave: () => void;
  onPayNow: () => void;
  onUploadPOP: () => void;
  canPay: boolean;
}

export const UniformEditCard: React.FC<Props> = React.memo(({
  child, entry, pricing, styles, nameLabel, namePlaceholder,
  onUpdate, onSetFullQty, onSave, onPayNow, onUploadPOP, canPay,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const {
    impliedSetQty, setPrice, tshirtPrice, shortsPrice,
    orderExtraTshirts, orderExtraShorts, totalAmount, hasPricing,
  } = computeChildPricing(entry, pricing);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{child.firstName.charAt(0)}{child.lastName.charAt(0)}</Text>
          </View>
          <View>
            <Text style={styles.childName}>{child.firstName} {child.lastName}</Text>
            <Text style={styles.helperText}>{t('dashboard.parent.uniform.helper.complete_form', { defaultValue: 'Complete the uniform form below.' })}</Text>
          </View>
        </View>
        {entry.status === 'saved' && (
          <View style={styles.statusPill}>
            <Ionicons name="checkmark-circle" size={14} color={theme.success} />
            <Text style={styles.statusPillText}>{t('dashboard.parent.uniform.status.saved', { defaultValue: 'Saved' })}</Text>
          </View>
        )}
      </View>

      {/* Details */}
      <Text style={styles.sectionTitle}>{t('dashboard.parent.uniform.sections.details', { defaultValue: 'Details & Sizes' })}</Text>
      <Text style={styles.label}>{nameLabel}</Text>
      <TextInput style={styles.input} value={entry.childName} onChangeText={(v) => onUpdate({ childName: v })} placeholder={namePlaceholder} placeholderTextColor={theme.textSecondary} />

      <Text style={styles.label}>{t('dashboard.parent.uniform.labels.age', { defaultValue: 'Age (years)' })}</Text>
      <TextInput style={styles.input} value={entry.ageYears} onChangeText={(v) => onUpdate({ ageYears: v })} placeholder="Age" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" />

      {/* Sizes & Quantities */}
      <Text style={styles.sectionTitle}>{t('dashboard.parent.uniform.sections.sizes', { defaultValue: 'Sizes & Quantities' })}</Text>
      <Text style={styles.label}>{t('dashboard.parent.uniform.labels.tshirt_size', { defaultValue: 'T-shirt Size' })}</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={entry.tshirtSize} onValueChange={(v) => onUpdate({ tshirtSize: v })} style={styles.picker}>
          <Picker.Item label={t('dashboard.parent.uniform.placeholders.select_size', { defaultValue: 'Select size' })} value="" />
          {SIZE_OPTIONS.map((s) => <Picker.Item key={s} label={s} value={s} />)}
        </Picker>
      </View>

      <Text style={styles.label}>{t('dashboard.parent.uniform.labels.tshirts', { defaultValue: 'T-shirts' })}</Text>
      <TextInput style={styles.input} value={entry.tshirtQuantity} onChangeText={(v) => onUpdate({ tshirtQuantity: v })} placeholder="1" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" maxLength={2} />

      <Text style={styles.label}>{t('dashboard.parent.uniform.labels.shorts', { defaultValue: 'Shorts' })}</Text>
      <TextInput style={styles.input} value={entry.shortsQuantity} onChangeText={(v) => onUpdate({ shortsQuantity: v })} placeholder="1" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" maxLength={2} />

      <Text style={styles.label}>{t('dashboard.parent.uniform.labels.full_sets', { defaultValue: 'Full sets (1 set = 1 T-shirt + 1 shorts)' })}</Text>
      <View style={styles.setRow}>
        <TextInput style={[styles.input, styles.setInput]} value={impliedSetQty ? String(impliedSetQty) : ''} onChangeText={onSetFullQty} placeholder="1" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" maxLength={2} />
        <TouchableOpacity style={[styles.matchButton, { borderColor: theme.primary }]} onPress={() => onSetFullQty(entry.tshirtQuantity)}>
          <Text style={[styles.matchButtonText, { color: theme.primary }]}>{t('dashboard.parent.uniform.actions.match_tshirt', { defaultValue: 'Match to T-shirt qty' })}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.helperText}>{t('dashboard.parent.uniform.helper.full_sets', { defaultValue: 'This sets both quantities to the same value. You can still edit them separately above.' })}</Text>

      {/* Pricing Card */}
      <View style={styles.pricingCard}>
        <Text style={styles.pricingTitle}>{t('dashboard.parent.uniform.pricing.title', { defaultValue: 'Pricing summary' })}</Text>
        <Text style={styles.pricingText}>
          {setPrice > 0 ? `Full set ${formatCurrency(setPrice)}` : 'Full set —'} • {tshirtPrice > 0 ? `T-shirt ${formatCurrency(tshirtPrice)}` : 'T-shirt —'} • {shortsPrice > 0 ? `Shorts ${formatCurrency(shortsPrice)}` : 'Shorts —'}
        </Text>
        <Text style={styles.pricingText}>
          {impliedSetQty} set(s) • {orderExtraTshirts} extra T-shirts • {orderExtraShorts} extra shorts
        </Text>
        <Text style={styles.pricingTotal}>
          {t('dashboard.parent.uniform.total.label', { defaultValue: 'Total:' })}{' '}
          {hasPricing ? formatCurrency(totalAmount) : t('dashboard.parent.uniform.total.unavailable', { defaultValue: 'Pricing not configured' })}
        </Text>
        {!hasPricing && <Text style={styles.pricingHint}>{t('dashboard.parent.uniform.total.note', { defaultValue: 'Pricing is not set yet. We will still generate a payment reference.' })}</Text>}
      </View>

      {/* Notes */}
      <Text style={styles.sectionTitle}>{t('dashboard.parent.uniform.sections.notes', { defaultValue: 'Notes' })}</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>{t('dashboard.parent.uniform.labels.sample_supplied', { defaultValue: 'Sample supplied?' })}</Text>
        <Switch value={entry.sampleSupplied} onValueChange={(v) => onUpdate({ sampleSupplied: v })} trackColor={{ false: theme.border, true: theme.primary }} thumbColor={entry.sampleSupplied ? '#fff' : theme.textSecondary} />
      </View>
      <Text style={styles.helperText}>{t('dashboard.parent.uniform.helper.sample_supplied', { defaultValue: 'Turn this on if you sent a sample T-shirt for sizing.' })}</Text>

      <Text style={styles.label}>{t('dashboard.parent.uniform.labels.past_number_choice', { defaultValue: 'Previous back number? (Required)' })}</Text>
      <View style={styles.choiceRow}>
        <TouchableOpacity
          style={[styles.choiceButton, entry.pastNumberChoice === 'yes' && styles.choiceButtonActive]}
          onPress={() => onUpdate({ pastNumberChoice: 'yes', isReturning: true })}
        >
          <Text style={[styles.choiceButtonText, entry.pastNumberChoice === 'yes' && styles.choiceButtonTextActive]}>
            {t('dashboard.parent.uniform.labels.past_number_yes', { defaultValue: 'Yes, has number' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.choiceButton, entry.pastNumberChoice === 'no' && styles.choiceButtonActive]}
          onPress={() => onUpdate({ pastNumberChoice: 'no', isReturning: false, tshirtNumber: '' })}
        >
          <Text style={[styles.choiceButtonText, entry.pastNumberChoice === 'no' && styles.choiceButtonTextActive]}>
            {t('dashboard.parent.uniform.labels.past_number_no', { defaultValue: 'No number' })}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.helperText}>{t('dashboard.parent.uniform.helper.past_number_choice', { defaultValue: 'Select one option before saving. If no number exists, choose "No number".' })}</Text>

      {entry.pastNumberChoice === 'yes' && (
        <>
          <Text style={styles.label}>{t('dashboard.parent.uniform.labels.tshirt_number', { defaultValue: 'T-shirt Number' })}</Text>
          <TextInput style={styles.input} value={entry.tshirtNumber} onChangeText={(v) => onUpdate({ tshirtNumber: v })} placeholder="e.g. 08" placeholderTextColor={theme.textSecondary} keyboardType="number-pad" maxLength={2} />
          <Text style={styles.helperText}>{t('dashboard.parent.uniform.helper.back_number', { defaultValue: 'Use the number that should appear on the back.' })}</Text>
        </>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.primary }]} onPress={onSave} disabled={entry.status === 'saving'}>
          <Text style={styles.saveButtonText}>{entry.status === 'saving' ? t('dashboard.parent.uniform.status.saving', { defaultValue: 'Saving...' }) : t('dashboard.parent.uniform.actions.save', { defaultValue: 'Save' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.payButton, { borderColor: theme.primary, opacity: canPay ? 1 : 0.5 }]} onPress={onPayNow} disabled={!canPay}>
          <Text style={[styles.payButtonText, { color: theme.primary }]}>{t('dashboard.parent.uniform.actions.pay_now', { defaultValue: 'Pay Now' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.uploadButton, { borderColor: theme.primary, opacity: canPay ? 1 : 0.5 }]} onPress={onUploadPOP} disabled={!canPay}>
          <Text style={[styles.payButtonText, { color: theme.primary }]}>{t('dashboard.parent.uniform.actions.upload_pop', { defaultValue: 'Upload POP' })}</Text>
        </TouchableOpacity>
      </View>
      {entry.status === 'saved' && (
        <View style={styles.statusRow}><Ionicons name="checkmark-circle" size={16} color={theme.success} /><Text style={[styles.statusText, { color: theme.success }]}>{t('dashboard.parent.uniform.status.saved', { defaultValue: 'Saved' })}</Text></View>
      )}
      {entry.status === 'error' && (
        <View style={styles.statusRow}><Ionicons name="alert-circle" size={16} color={theme.error} /><Text style={[styles.statusText, { color: theme.error }]}>{entry.message}</Text></View>
      )}
      {entry.updatedAt && (
        <Text style={styles.updatedText}>{t('dashboard.parent.uniform.last_updated', { defaultValue: 'Last updated:' })} {new Date(entry.updatedAt).toLocaleString('en-ZA')}</Text>
      )}
    </View>
  );
});
