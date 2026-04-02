import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { uploadPOPFile } from '@/lib/popUpload';
import { assertSupabase } from '@/lib/supabase';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';
import { createRegistrationStyles } from './child-registration.styles';
import type { PromoApplied, RegistrationFormErrors } from '@/hooks/useChildRegistration';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { ImageConfirmModal } from '@/components/ui/ImageConfirmModal';

type PendingPopSelection = {
  uri: string;
  name: string;
  webFile?: Blob;
};

interface RegistrationFeeSectionProps {
  registrationFee: number;
  finalAmount: number;
  promoCode: string;
  setPromoCode: (code: string) => void;
  promoDiscount: number;
  promoValidating: boolean;
  promoApplied: PromoApplied | null;
  handleValidatePromo: () => void;
  handleRemovePromo: () => void;
  paymentMethod: 'eft' | 'cash' | 'card' | '';
  setPaymentMethod: (method: 'eft' | 'cash' | 'card' | '') => void;
  proofOfPayment: string | null;
  setProofOfPaymentUrl: (url: string | null) => void;
  uploadingPop: boolean;
  setUploadingPop: (uploading: boolean) => void;
  errors: RegistrationFormErrors;
  clearError: (field: keyof RegistrationFormErrors) => void;
}

export function RegistrationFeeSection({
  registrationFee,
  finalAmount,
  promoCode,
  setPromoCode,
  promoDiscount,
  promoValidating,
  promoApplied,
  handleValidatePromo,
  handleRemovePromo,
  paymentMethod,
  setPaymentMethod,
  proofOfPayment,
  setProofOfPaymentUrl,
  uploadingPop,
  setUploadingPop,
  errors,
  clearError,
}: RegistrationFeeSectionProps) {
  const { theme } = useTheme();
  const styles = createRegistrationStyles(theme);
  const [pendingPop, setPendingPop] = React.useState<PendingPopSelection | null>(null);

  const handlePopUpload = async () => {
    try {
      const hasPermission = await ensureImageLibraryPermission();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Please allow access to your photos to upload proof of payment.');
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.uri) return;

      setPendingPop({
        uri: asset.uri,
        name: asset.fileName || `pop_${Date.now()}.jpg`,
        webFile: (asset as any).file,
      });
    } catch (error: any) {
      console.error('POP picker error:', error);
      Alert.alert('Error', 'Failed to select image.');
    }
  };

  const confirmPopUpload = async (uri: string) => {
    if (!pendingPop) return;

    setUploadingPop(true);
    try {
      const supabase = assertSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user?.id;
      if (!authUserId) {
        throw new Error('Could not determine your account ID for upload.');
      }

      const uploadResult = await uploadPOPFile(
        uri,
        'proof_of_payment',
        authUserId,
        'registration',
        pendingPop.name,
        uri === pendingPop.uri ? pendingPop.webFile : undefined
      );
      if (!uploadResult.success || !uploadResult.filePath) {
        throw new Error(uploadResult.error || 'Failed to upload proof of payment.');
      }

      const { data: urlData } = supabase
        .storage
        .from('proof-of-payments')
        .getPublicUrl(uploadResult.filePath);
      setProofOfPaymentUrl(urlData.publicUrl);
      Alert.alert('Success', 'Proof of payment uploaded successfully!');
    } catch (error: any) {
      console.error('POP upload error:', error);
      Alert.alert('Upload Failed', error?.message || 'Failed to upload proof of payment.');
    } finally {
      setUploadingPop(false);
      setPendingPop(null);
    }
  };

  const paymentMethods = [
    { value: 'eft' as const, label: '🏦 EFT', desc: 'Bank Transfer' },
    { value: 'cash' as const, label: '💵 Cash', desc: 'Cash Payment' },
    { value: 'card' as const, label: '💳 Card', desc: 'Card Payment' },
  ];

  return (
    <View style={[styles.section, { backgroundColor: theme.primary + '10', borderRadius: 12, padding: 16, marginTop: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Ionicons name="card" size={24} color={theme.primary} />
        <Text style={[styles.sectionTitle, { marginLeft: 8, marginBottom: 0 }]}>Registration Fee</Text>
      </View>
      
      <View style={{ backgroundColor: theme.surface, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 14 }}>Registration Fee Amount</Text>
        {promoApplied ? (
          <>
            <Text style={{ color: theme.textSecondary, fontSize: 18, textDecorationLine: 'line-through', marginTop: 4 }}>
              R {registrationFee.toFixed(2)}
            </Text>
            <Text style={{ color: '#10b981', fontSize: 28, fontWeight: '800' }}>
              R {finalAmount.toFixed(2)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#10b98120', padding: 8, borderRadius: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color="#10b981" />
              <Text style={{ color: '#10b981', fontSize: 14, fontWeight: '600', marginLeft: 6, flex: 1 }}>
                {promoApplied.code} applied - You save R{promoDiscount.toFixed(2)}!
              </Text>
              <TouchableOpacity onPress={handleRemovePromo}>
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={{ color: theme.text, fontSize: 28, fontWeight: '800', marginTop: 4 }}>
            R {registrationFee.toFixed(2)}
          </Text>
        )}
        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
          One-time fee payable before registration approval
        </Text>
      </View>
      
      {/* Promo Code Section */}
      {!promoApplied && (
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.label}>Have a promo code?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={promoCode}
              onChangeText={(text) => setPromoCode(text.toUpperCase())}
              style={[styles.input, { flex: 1, marginTop: 0 }]}
              placeholder="Enter promo code (e.g. WELCOME2026)"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.primary, paddingHorizontal: 16, marginTop: 0 }]}
              onPress={handleValidatePromo}
              disabled={promoValidating || !promoCode.trim()}
            >
              {promoValidating ? (
                <EduDashSpinner color={theme.onPrimary} size="small" />
              ) : (
                <Text style={[styles.btnText, { color: theme.onPrimary }]}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      <Text style={styles.label}>Payment Method *</Text>
      <View style={styles.genderRow}>
        {paymentMethods.map((method) => (
          <TouchableOpacity
            key={method.value}
            style={[styles.genderButton, paymentMethod === method.value && styles.genderButtonActive]}
            onPress={() => {
              setPaymentMethod(method.value);
              clearError('paymentMethod');
            }}
          >
            <Text style={[styles.genderButtonText, paymentMethod === method.value && styles.genderButtonTextActive]}>
              {method.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {errors.paymentMethod ? <Text style={styles.error}>{errors.paymentMethod}</Text> : null}
      
      <Text style={[styles.label, { marginTop: 16 }]}>Proof of Payment *</Text>
      <Text style={styles.hint}>Upload a photo of your payment receipt, bank confirmation, or deposit slip</Text>
      
      {proofOfPayment ? (
        <View style={{ marginTop: 8 }}>
          <Image 
            source={{ uri: proofOfPayment }} 
            style={{ width: '100%', height: 200, borderRadius: 10, backgroundColor: theme.surface }} 
            resizeMode="cover"
          />
          <TouchableOpacity 
            style={[styles.btn, { backgroundColor: theme.error, marginTop: 8 }]} 
            onPress={() => setProofOfPaymentUrl(null)}
          >
            <Text style={styles.btnText}>Remove & Upload Different Image</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.btn, { backgroundColor: theme.surface, borderWidth: 2, borderColor: theme.primary, borderStyle: 'dashed' }]} 
          onPress={handlePopUpload}
          disabled={uploadingPop}
        >
          {uploadingPop ? (
            <EduDashSpinner color={theme.primary} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="cloud-upload" size={24} color={theme.primary} />
              <Text style={[styles.btnText, { color: theme.primary, marginLeft: 8 }]}>Upload Proof of Payment</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
      {errors.proofOfPayment ? <Text style={styles.error}>{errors.proofOfPayment}</Text> : null}

      {/* POP confirm modal */}
      <ImageConfirmModal
        visible={!!pendingPop}
        imageUri={pendingPop?.uri || null}
        onConfirm={confirmPopUpload}
        onCancel={() => setPendingPop(null)}
        title="Proof of Payment"
        confirmLabel="Upload"
        confirmIcon="cloud-upload-outline"
        loading={uploadingPop}
      />
    </View>
  );
}
