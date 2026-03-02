import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { useAlert } from '@/components/ui/StyledAlert';

export interface Organization {
  id: string;
  name: string;
  type: string;
  school_type?: string;
  city?: string;
  tenant_slug?: string;
  registration_fee?: number;
}

// Age range configuration based on school type
export interface AgeRange {
  minAge: number;
  maxAge: number;
  label: string;
}

export const SCHOOL_TYPE_AGE_RANGES: Record<string, AgeRange> = {
  'preschool': { minAge: 2, maxAge: 7, label: 'Child must be between 2 and 7 years old for preschool' },
  'primary': { minAge: 5, maxAge: 14, label: 'Child must be between 5 and 14 years old for primary school' },
  'secondary': { minAge: 12, maxAge: 19, label: 'Student must be between 12 and 19 years old for secondary school' },
  'k12': { minAge: 5, maxAge: 19, label: 'Student must be between 5 and 19 years old' },
  'k12_school': { minAge: 5, maxAge: 19, label: 'Student must be between 5 and 19 years old' },
  'combined': { minAge: 5, maxAge: 19, label: 'Student must be between 5 and 19 years old' },
  'community_school': { minAge: 5, maxAge: 99, label: 'Students of all ages welcome' },
  'training_center': { minAge: 16, maxAge: 99, label: 'Students must be 16 years or older' },
  'skills_development': { minAge: 16, maxAge: 99, label: 'Students must be 16 years or older' },
  'tutoring_center': { minAge: 5, maxAge: 99, label: 'Students of all ages welcome' },
  'default': { minAge: 0, maxAge: 99, label: 'All ages accepted' },
};

export function getAgeRangeForSchoolType(schoolType?: string | null): AgeRange {
  if (!schoolType) return SCHOOL_TYPE_AGE_RANGES['preschool']; // Default to preschool if not specified
  return SCHOOL_TYPE_AGE_RANGES[schoolType] || SCHOOL_TYPE_AGE_RANGES['default'];
}

// Helper to get display type for UI
export function getDisplayTypeForSchoolType(schoolType?: string | null): string {
  const typeMap: Record<string, string> = {
    'preschool': 'Preschool',
    'primary': 'Primary School',
    'secondary': 'Secondary School',
    'k12': 'K-12 School',
    'k12_school': 'K-12 School',
    'combined': 'Combined School',
    'community_school': 'Community School',
    'training_center': 'Training Center',
    'skills_development': 'Skills Development',
    'tutoring_center': 'Tutoring Center',
  };
  return typeMap[schoolType || 'preschool'] || schoolType || 'Organization';
}

export interface PromoApplied {
  code: string;
  name: string;
  discountValue: number;
}

export interface RegistrationFormState {
  firstName: string;
  lastName: string;
  dob: Date | null;
  gender: 'male' | 'female' | 'other' | '';
  dietary: string;
  medicalInfo: string;
  specialNeeds: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  notes: string;
  selectedOrganizationId: string | null;
  paymentMethod: 'eft' | 'cash' | 'card' | '';
  proofOfPayment: string | null;
  promoCode: string;
}

export interface RegistrationFormErrors {
  firstName?: string;
  lastName?: string;
  dob?: string;
  gender?: string;
  organization?: string;
  emergencyPhone?: string;
  paymentMethod?: string;
  proofOfPayment?: string;
}

export function useChildRegistration() {
  const { profile } = useAuth();
  const alert = useAlert();
  
  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [dietary, setDietary] = useState('');
  const [medicalInfo, setMedicalInfo] = useState('');
  const [specialNeeds, setSpecialNeeds] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [notes, setNotes] = useState('');
  
  // Organization state
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(profile?.organization_id || null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  
  // Payment state
  const [registrationFee, setRegistrationFee] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'eft' | 'cash' | 'card' | ''>('');
  const [proofOfPayment, setProofOfPayment] = useState<string | null>(null);
  const [uploadingPop, setUploadingPop] = useState(false);
  
  // Promo state
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoApplied, setPromoApplied] = useState<PromoApplied | null>(null);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<RegistrationFormErrors>({});

  const formatDate = (date: Date): string => date.toISOString().split('T')[0];

  const formatPhoneNumber = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('27')) {
      const rest = digits.slice(2);
      if (rest.length >= 9) {
        return `+27 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5, 9)}`;
      }
      return `+27 ${rest}`;
    } else if (digits.startsWith('0') && digits.length === 10) {
      return `+27 ${digits.slice(1, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
    }
    return phone;
  };

  // Fetch organizations
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        setLoadingOrganizations(true);
        
        const { data: allPreschoolsData } = await assertSupabase()
          .from('preschools')
          .select('id, name, address, tenant_slug, school_type')
          .eq('is_active', true)
          .order('name');
        
        const { data: feesData } = await assertSupabase()
          .from('fee_structures')
          .select('preschool_id, amount')
          .eq('fee_type', 'registration')
          .eq('is_active', true);
        
        const feeMap = new Map(feesData?.map(f => [f.preschool_id, f.amount]) || []);
        const preschoolsList = allPreschoolsData || [];
        
        if (preschoolsList.length > 0) {
          const transformedData = preschoolsList.map(p => {
            let city = undefined;
            if (p.address) {
              const addressParts = p.address.split(',');
              if (addressParts.length >= 2) {
                city = addressParts[addressParts.length - 2].trim();
              }
            }
            // Determine the display type based on school_type
            const schoolType = p.school_type || 'preschool';
            const displayType = getDisplayTypeForSchoolType(schoolType);
            return {
              id: p.id,
              name: p.name,
              type: displayType,
              school_type: schoolType,
              city,
              tenant_slug: p.tenant_slug,
              registration_fee: feeMap.get(p.id) || 0,
            };
          });
          setOrganizations(transformedData);
        } else {
          const { data: orgsData, error: orgsError } = await assertSupabase()
            .from('organizations')
            .select('id, name, type, city')
            .eq('is_active', true)
            .order('name');
          
          if (orgsError) throw orgsError;
          setOrganizations((orgsData || []).map(o => ({ ...o, registration_fee: 0 })));
        }
      } catch (error: any) {
        console.error('Failed to fetch organizations:', error);
        alert.showError('Error', error?.message || 'Failed to load organizations.');
      } finally {
        setLoadingOrganizations(false);
      }
    };
    fetchOrganizations();
  }, [alert]);

  // Update fee when organization changes
  useEffect(() => {
    if (selectedOrganizationId) {
      const org = organizations.find(o => o.id === selectedOrganizationId);
      setRegistrationFee(org?.registration_fee || 0);
      setPromoCode('');
      setPromoDiscount(0);
      setPromoApplied(null);
    }
  }, [selectedOrganizationId, organizations]);

  const finalAmount = registrationFee > 0 ? Math.max(0, registrationFee - promoDiscount) : 0;

  const clearError = useCallback((field: keyof RegistrationFormErrors) => {
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  }, [errors]);

  const validate = useCallback((): boolean => {
    const newErrors: RegistrationFormErrors = {};
    
    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!dob) {
      newErrors.dob = 'Date of birth is required';
    } else {
      // Get age range based on selected organization's school type
      const selectedOrg = organizations.find(o => o.id === selectedOrganizationId);
      const ageRange = getAgeRangeForSchoolType(selectedOrg?.school_type);
      const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < ageRange.minAge || age > ageRange.maxAge) {
        newErrors.dob = ageRange.label;
      }
    }
    if (!gender) newErrors.gender = 'Please select gender';
    if (!selectedOrganizationId) newErrors.organization = 'Please select an organization';
    if (emergencyPhone && !/^\+?[0-9]{10,13}$/.test(emergencyPhone.replace(/\s/g, ''))) {
      newErrors.emergencyPhone = 'Invalid phone number format';
    }
    if (registrationFee > 0) {
      if (!paymentMethod) newErrors.paymentMethod = 'Please select a payment method';
      if (!proofOfPayment) newErrors.proofOfPayment = 'Please upload proof of payment';
    }
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      alert.showWarning('Validation Error', 'Please fix the errors before submitting');
      return false;
    }
    if (!profile?.id) {
      alert.showError('Profile missing', 'Please try again after reloading.');
      return false;
    }
    return true;
  }, [alert, firstName, lastName, dob, gender, organizations, selectedOrganizationId, emergencyPhone, registrationFee, paymentMethod, proofOfPayment, profile?.id]);

  const handleValidatePromo = useCallback(async () => {
    if (!promoCode.trim()) {
      alert.showWarning('Enter Code', 'Please enter a promo code to validate.');
      return;
    }
    
    setPromoValidating(true);
    try {
      const { data, error } = await assertSupabase()
        .from('promotional_campaigns')
        .select('id, code, name, discount_type, discount_value, applies_to_registration, is_active, start_date, end_date, max_uses, current_uses')
        .eq('code', promoCode.trim().toUpperCase())
        .eq('is_active', true)
        .eq('applies_to_registration', true)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) {
        alert.showError('Invalid Code', 'This promo code is not valid or has expired.');
        return;
      }
      
      const now = new Date();
      if (data.start_date && new Date(data.start_date) > now) {
        alert.showWarning('Not Yet Active', 'This promo code is not yet active.');
        return;
      }
      if (data.end_date && new Date(data.end_date) < now) {
        alert.showWarning('Expired', 'This promo code has expired.');
        return;
      }
      if (data.max_uses && data.current_uses >= data.max_uses) {
        alert.showWarning('Limit Reached', 'This promo code has reached its maximum uses.');
        return;
      }
      
      const discountAmount = data.discount_type === 'percentage' 
        ? (registrationFee * data.discount_value) / 100 
        : data.discount_value;
      
      setPromoDiscount(discountAmount);
      setPromoApplied({ code: data.code, name: data.name, discountValue: data.discount_value });
      alert.showSuccess('Success!', `${data.name} applied! You save R${discountAmount.toFixed(2)}.`);
    } catch (err) {
      console.error('Promo validation error:', err);
      alert.showError('Error', 'Failed to validate promo code.');
    } finally {
      setPromoValidating(false);
    }
  }, [alert, promoCode, registrationFee]);

  const handleRemovePromo = useCallback(() => {
    setPromoCode('');
    setPromoDiscount(0);
    setPromoApplied(null);
  }, []);

  const setProofOfPaymentUrl = useCallback((url: string | null) => {
    setProofOfPayment(url);
  }, []);

  const resetForm = useCallback(() => {
    setFirstName('');
    setLastName('');
    setDob(null);
    setGender('');
    setDietary('');
    setMedicalInfo('');
    setSpecialNeeds('');
    setEmergencyName('');
    setEmergencyPhone('');
    setEmergencyRelation('');
    setNotes('');
    setSelectedOrganizationId(null);
    setPaymentMethod('');
    setProofOfPayment(null);
    setRegistrationFee(0);
    setPromoCode('');
    setPromoDiscount(0);
    setPromoApplied(null);
    setErrors({});
  }, []);

  const onSubmit = useCallback(async () => {
    if (!validate()) return;
    if (!profile?.id || !selectedOrganizationId) return;
    
    setLoading(true);
    try {
      const relationshipNote = emergencyRelation ? `[EmergencyRelationship: ${emergencyRelation.trim()}]` : '';
      const combinedNotes = (relationshipNote + (notes ? ` ${notes}` : '')).trim();

      const payload = {
        child_first_name: firstName.trim(),
        child_last_name: lastName.trim(),
        child_birth_date: formatDate(dob!),
        child_gender: gender || null,
        dietary_requirements: dietary || null,
        medical_info: medicalInfo || null,
        special_needs: specialNeeds || null,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone ? formatPhoneNumber(emergencyPhone) : null,
        notes: combinedNotes || null,
        parent_id: profile.id,
        preschool_id: selectedOrganizationId,
        status: 'pending',
        registration_fee_amount: registrationFee,
        discount_amount: promoDiscount,
        final_amount: finalAmount,
        campaign_applied: promoApplied?.code || null,
        registration_fee_paid: registrationFee > 0 && !!proofOfPayment,
        payment_method: paymentMethod || null,
        proof_of_payment_url: proofOfPayment || null,
        payment_verified: false,
      };

      const response = await assertSupabase().from('child_registration_requests').insert(payload as any).select();

      if (response.data && response.data.length > 0) {
        // Update promo counter
        if (promoApplied?.code) {
          try {
            const { data: promoData } = await assertSupabase()
              .from('promotional_campaigns')
              .select('id, current_uses')
              .eq('code', promoApplied.code)
              .single();
            if (promoData) {
              await assertSupabase()
                .from('promotional_campaigns')
                .update({ current_uses: (promoData.current_uses || 0) + 1, updated_at: new Date().toISOString() })
                .eq('id', promoData.id);
            }
          } catch { /* ignore */ }
        }
        
        // Send notification
        try {
          await assertSupabase().functions.invoke('notifications-dispatcher', {
            body: {
              event_type: 'child_registration_submitted',
              preschool_id: selectedOrganizationId,
              role_targets: ['principal', 'principal_admin'],
              registration_id: response.data[0].id,
              child_name: `${firstName} ${lastName}`,
              parent_name: profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : undefined,
            },
          });
        } catch { /* ignore */ }
        
        alert.showSuccess('Submitted Successfully', 'Your registration request has been sent.', () => router.back());
        resetForm();
      } else if (response.error) {
        const error = response.error;
        const errorCode = (error as any)?.code;
        const errorMessage = (error as any)?.message || String(error);
        
        if (errorCode === '23505' || errorMessage?.includes('duplicate')) {
          alert.showError('Duplicate Registration', `You have already submitted a registration for ${firstName} ${lastName} at this school.`);
        } else if (errorCode === '42501' || errorMessage?.toLowerCase()?.includes('permission denied')) {
          alert.showError('Permission Denied', `You don't have permission to register at this school.`);
        } else {
          alert.showError('Submission Failed', errorMessage || 'Unable to submit registration.');
        }
      }
    } catch (e: any) {
      console.error('[Child Registration] Error:', e);
      alert.showError('Submission failed', e?.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  }, [alert, validate, profile, firstName, lastName, dob, gender, dietary, medicalInfo, specialNeeds, emergencyName, emergencyPhone, emergencyRelation, notes, selectedOrganizationId, registrationFee, promoDiscount, finalAmount, promoApplied, paymentMethod, proofOfPayment, resetForm]);

  // Get the current selected organization and its age range
  const selectedOrganization = organizations.find(o => o.id === selectedOrganizationId) || null;
  const currentAgeRange = getAgeRangeForSchoolType(selectedOrganization?.school_type);

  return {
    // Form state
    firstName, setFirstName,
    lastName, setLastName,
    dob, setDob,
    gender, setGender,
    dietary, setDietary,
    medicalInfo, setMedicalInfo,
    specialNeeds, setSpecialNeeds,
    emergencyName, setEmergencyName,
    emergencyPhone, setEmergencyPhone,
    emergencyRelation, setEmergencyRelation,
    notes, setNotes,
    
    // Organization
    selectedOrganizationId, setSelectedOrganizationId,
    organizations, loadingOrganizations,
    selectedOrganization,
    currentAgeRange,
    
    // Payment
    registrationFee,
    paymentMethod, setPaymentMethod,
    proofOfPayment, setProofOfPaymentUrl,
    uploadingPop, setUploadingPop,
    
    // Promo
    promoCode, setPromoCode,
    promoDiscount, promoValidating,
    promoApplied, handleValidatePromo, handleRemovePromo,
    finalAmount,
    
    // UI
    loading, errors, clearError,
    onSubmit,
  };
}
