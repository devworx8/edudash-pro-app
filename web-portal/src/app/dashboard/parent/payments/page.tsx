'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { PendingDocumentsCard, type PendingDocumentStatus } from '@/components/dashboard/parent/PendingDocumentsCard';
import {
  DollarSign,
  CreditCard,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Upload,
  FileText,
  Info,
  ArrowLeft,
  History,
  User,
  School,
} from 'lucide-react';

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  preschool_id: string;
  organization_id?: string | null;
  preschool_name?: string;
  student_code: string; // Unique payment reference (e.g., YE-2026-0001)
  registration_fee_amount?: number;
  registration_fee_paid?: boolean;
  payment_verified?: boolean;
}

interface StudentFee {
  id: string;
  student_id: string;
  fee_type: string;
  description: string;
  amount: number;
  due_date: string;
  billing_month?: string;
  grace_period_days?: number;
  paid_date?: string;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'waived' | 'pending_verification';
  payment_method?: string;
  student?: {
    first_name: string;
    last_name: string;
  };
  pop_status?: 'pending' | 'approved' | 'rejected' | 'needs_revision';
}

interface FeeStructure {
  id: string;
  fee_type: string;
  amount: number;
  description: string;
  payment_frequency?: string;
  age_group?: string;
}

interface RegistrationDocs {
  id: string;
  student_birth_certificate_url: string | null;
  student_clinic_card_url: string | null;
  guardian_id_document_url: string | null;
}

interface POPUpload {
  id: string;
  student_id: string;
  upload_type: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  payment_amount?: number | null;
  payment_date?: string | null;
  payment_for_month?: string | null;
  payment_reference?: string | null;
  created_at: string;
}

export default function PaymentsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>();
  const [preschoolId, setPreschoolId] = useState<string>();
  const [preschoolName, setPreschoolName] = useState<string>('');
  const { slug } = useTenantSlug(userId);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'upload'>('overview');
  const [loading, setLoading] = useState(true);

  // Real data from database
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [feeStructure, setFeeStructure] = useState<FeeStructure[]>([]);
  const [documentStatus, setDocumentStatus] = useState<PendingDocumentStatus[]>([]);
  const [registrationId, setRegistrationId] = useState<string | null>(null);

  // Format currency consistently (avoid hydration mismatch)
  const formatCurrency = (amount: number) => {
    return `R ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
  };

  // Format date consistently (avoid hydration mismatch)
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Get the next school fee month
  const getNextFeeMonth = () => {
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // If we're past the 7th of the month, show next month's fee
    // Otherwise show current month
    if (currentDay > 7) {
      const nextMonth = currentMonth + 1;
      if (nextMonth > 11) {
        return { month: 0, year: currentYear + 1 }; // January next year
      }
      return { month: nextMonth, year: currentYear };
    }
    return { month: currentMonth, year: currentYear };
  };

  // Calculate fee status color based on due date
  // Green: Before due date
  // Yellow: 1 day after due date (grace period starts)
  // Red: 3+ days after grace period ends (penalties apply)
  const getFeeStatusColor = (dueDate: string, gracePeriodDays: number = 7) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = now.getTime() - due.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) {
      // Before or on due date - Green
      return { 
        color: '#22c55e', 
        bgColor: 'rgba(34, 197, 94, 0.1)', 
        borderColor: 'rgba(34, 197, 94, 0.3)',
        label: 'Due Soon',
        showWarning: false 
      };
    } else if (diffDays <= gracePeriodDays) {
      // Within grace period (1 day to grace period days after due) - Yellow
      const daysLeft = gracePeriodDays - diffDays;
      return { 
        color: '#fbbf24', 
        bgColor: 'rgba(251, 191, 36, 0.1)', 
        borderColor: 'rgba(251, 191, 36, 0.3)',
        label: `Grace Period (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`,
        showWarning: false 
      };
    } else if (diffDays <= gracePeriodDays + 3) {
      // 1-3 days after grace period - Orange/Warning
      return { 
        color: '#f97316', 
        bgColor: 'rgba(249, 115, 22, 0.1)', 
        borderColor: 'rgba(249, 115, 22, 0.3)',
        label: 'Late Payment',
        showWarning: true 
      };
    } else {
      // More than 3 days after grace period - Red
      return { 
        color: '#ef4444', 
        bgColor: 'rgba(239, 68, 68, 0.1)', 
        borderColor: 'rgba(239, 68, 68, 0.3)',
        label: 'Overdue',
        showWarning: true 
      };
    }
  };

  const resolvePopStatus = (fee: StudentFee, uploads: POPUpload[]): POPUpload['status'] | undefined => {
    const monthSource = fee.billing_month || fee.due_date;
    if (!monthSource) return undefined;
    const feeDate = new Date(monthSource);
    if (Number.isNaN(feeDate.getTime())) return undefined;

    const matching = uploads.find((upload) => {
      if (!upload.payment_for_month && !upload.payment_date && !upload.payment_amount) return false;
      const periodValue = upload.payment_for_month || upload.payment_date || upload.created_at;
      if (periodValue) {
        const periodDate = new Date(periodValue);
        if (!Number.isNaN(periodDate.getTime())) {
          const sameMonth = periodDate.getMonth() === feeDate.getMonth() && periodDate.getFullYear() === feeDate.getFullYear();
          if (sameMonth) return true;
        }
      }
      if (typeof upload.payment_amount === 'number') {
        return Math.abs(upload.payment_amount - fee.amount) < 10;
      }
      return false;
    });

    return matching?.status;
  };

  const buildDocumentStatus = (docs: RegistrationDocs | null): PendingDocumentStatus[] => {
    return [
      {
        type: 'birth_certificate',
        label: 'Birth Certificate',
        uploaded: Boolean(docs?.student_birth_certificate_url),
      },
      {
        type: 'clinic_card',
        label: 'Clinic Card',
        uploaded: Boolean(docs?.student_clinic_card_url),
      },
      {
        type: 'guardian_id',
        label: 'Guardian ID',
        uploaded: Boolean(docs?.guardian_id_document_url),
      },
    ];
  };

  const loadDocuments = useCallback(async (currentEmail: string) => {
    if (!currentEmail) {
      setDocumentStatus([]);
      setRegistrationId(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('registration_requests')
        .select('id, student_birth_certificate_url, student_clinic_card_url, guardian_id_document_url')
        .ilike('guardian_email', currentEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        setDocumentStatus(buildDocumentStatus(null));
        setRegistrationId(null);
        return;
      }

      const docs = data as RegistrationDocs | null;
      setRegistrationId(docs?.id ?? null);
      setDocumentStatus(buildDocumentStatus(docs));
    } catch {
      setDocumentStatus(buildDocumentStatus(null));
      setRegistrationId(null);
    }
  }, [supabase]);

  // Fetch parent's children and their school info
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      const userEmail = session.user.email || '';
      setEmail(userEmail);
      setUserId(session.user.id);
      await loadDocuments(userEmail);

      // Get parent's profile to get preschool_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('preschool_id, organization_id')
        .eq('id', session.user.id)
        .single();

      const schoolId = profile?.organization_id || profile?.preschool_id;
      if (schoolId) {
        setPreschoolId(schoolId);

        // Get school name (preschools or organizations)
        const { data: preschool } = await supabase
          .from('preschools')
          .select('name')
          .eq('id', schoolId)
          .maybeSingle();

        if (preschool?.name) {
          setPreschoolName(preschool.name);
        } else {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', schoolId)
            .maybeSingle();

          if (org?.name) {
            setPreschoolName(org.name);
          }
        }
      }

      // Fetch children linked to this parent via parent_id or guardian_id in students table
      const { data: directChildren } = await supabase
        .from('students')
        .select('id, student_id, first_name, last_name, preschool_id, organization_id, registration_fee_amount, registration_fee_paid, payment_verified')
        .or(`parent_id.eq.${session.user.id},guardian_id.eq.${session.user.id}`);

      if (directChildren && directChildren.length > 0) {
        const childrenData: Child[] = [];
        
        for (const student of directChildren) {
          let schoolName = '';
          const schoolId = student.organization_id || student.preschool_id;
          if (schoolId) {
            const { data: school } = await supabase
              .from('preschools')
              .select('name')
              .eq('id', schoolId)
              .maybeSingle();
            if (school?.name) {
              schoolName = school.name;
            } else {
              const { data: org } = await supabase
                .from('organizations')
                .select('name')
                .eq('id', schoolId)
                .maybeSingle();
              schoolName = org?.name || '';
            }
          }

          childrenData.push({
            id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            preschool_id: student.preschool_id,
            organization_id: student.organization_id,
            preschool_name: schoolName,
            student_code: student.student_id || student.id.slice(0, 8).toUpperCase(),
            registration_fee_amount: student.registration_fee_amount,
            registration_fee_paid: student.registration_fee_paid,
            payment_verified: student.payment_verified,
          });
        }

        setChildren(childrenData);
        if (childrenData.length > 0) {
          setSelectedChildId(childrenData[0].id);
        }
      }

      setLoading(false);
    })();
  }, [loadDocuments, router, supabase]);

  // Fetch fees for selected child
  useEffect(() => {
    if (!selectedChildId) return;

    const fetchFees = async () => {
      const { data: uploads } = await supabase
        .from('pop_uploads')
        .select('id, student_id, upload_type, status, payment_amount, payment_date, payment_for_month, payment_reference, created_at')
        .eq('student_id', selectedChildId)
        .eq('upload_type', 'proof_of_payment')
        .order('created_at', { ascending: false });

      const popData = (uploads || []) as POPUpload[];

      // Get student fees for this child
      const { data: fees } = await supabase
        .from('student_fees')
        .select('*')
        .eq('student_id', selectedChildId)
        .order('due_date', { ascending: true });

      if (fees && fees.length > 0) {
        const mappedFees = (fees as StudentFee[]).map((fee) => {
          const popStatus = resolvePopStatus(fee, popData);
          const isPendingVerification = popStatus === 'pending' && fee.status !== 'paid' && fee.status !== 'waived';
          return {
            ...fee,
            pop_status: popStatus,
            status: isPendingVerification ? 'pending_verification' : fee.status,
          };
        });
        setStudentFees(mappedFees);
      }

      // Get fee structure for the child's school
      const selectedChild = children.find(c => c.id === selectedChildId);
      
      // Try to get preschool_id from selected child or fallback to preschoolId state
      const childPreschoolId = selectedChild?.organization_id || selectedChild?.preschool_id || preschoolId;
      
      if (childPreschoolId) {
        // Fetch fee structures directly from school_fee_structures table (uses preschool_id)
        const { data: schoolFees } = await supabase
          .from('school_fee_structures')
          .select('*')
          .eq('preschool_id', childPreschoolId)
          .eq('is_active', true);

        if (schoolFees && schoolFees.length > 0) {
          // Convert from cents to rands and map to our interface
          setFeeStructure(schoolFees.map((f: { id: string; name: string; fee_category: string; amount_cents: number; description?: string; billing_frequency?: string; age_group?: string }) => ({
            id: f.id,
            fee_type: f.fee_category || f.name,
            amount: f.amount_cents / 100, // Convert cents to rands
            description: f.description || f.name,
            payment_frequency: f.billing_frequency,
            age_group: f.age_group,
          })));
          
          // Find the appropriate monthly fee based on child's age group
          // For now, show the first tuition fee (principal should assign correct fee to student)
          const monthlyFee = schoolFees.find((f: { fee_category: string }) => 
            f.fee_category === 'tuition'
          );
          
          if (monthlyFee && (!fees || fees.length === 0)) {
            // If no student_fees exist yet, show the next month's fee as outstanding
            const nextFee = getNextFeeMonth();
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                               'July', 'August', 'September', 'October', 'November', 'December'];
            const dueDate = `${nextFee.year}-${String(nextFee.month + 1).padStart(2, '0')}-01`;
            
            setStudentFees([{
              id: `pending-${monthNames[nextFee.month].toLowerCase()}-${nextFee.year}`,
              student_id: selectedChildId,
              fee_type: 'monthly_tuition',
              description: `${monthNames[nextFee.month]} ${nextFee.year} School Fees${monthlyFee.age_group ? ` (${monthlyFee.age_group})` : ''}`,
              amount: monthlyFee.amount_cents / 100, // Convert cents to rands
              due_date: dueDate,
              grace_period_days: 7, // Default 7 days grace period, principal can change this
              status: 'pending',
            }]);
          }
        } else {
          // Use student's registration fee as fallback
          if (selectedChild?.registration_fee_amount) {
            setFeeStructure([{
              id: 'registration',
              fee_type: 'registration_fee',
              amount: selectedChild.registration_fee_amount,
              description: 'Registration Fee',
              payment_frequency: 'once-off',
            }]);
          }
        }
        
      }
    };

    fetchFees();
  }, [selectedChildId, children, preschoolId, supabase]);

  // Calculate upcoming and paid fees
  const upcomingFees = useMemo(() => {
    return studentFees.filter(f => 
      f.status === 'pending' || 
      f.status === 'overdue' || 
      f.status === 'partially_paid' ||
      f.status === 'pending_verification'
    );
  }, [studentFees]);

  const paidFees = useMemo(() => {
    return studentFees.filter(f => f.status === 'paid');
  }, [studentFees]);

  const pendingVerificationFees = useMemo(() => {
    return studentFees.filter(f => f.status === 'pending_verification');
  }, [studentFees]);

  const actionableUpcomingFees = useMemo(() => {
    return upcomingFees.filter(f => f.status !== 'pending_verification');
  }, [upcomingFees]);

  const pendingVerificationCount = pendingVerificationFees.length;
  const trulyPendingCount = Math.max(upcomingFees.length - pendingVerificationCount, 0);

  // Calculate outstanding balance
  const outstandingBalance = useMemo(() => {
    const today = new Date();
    const dueSoonCutoff = new Date();
    dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 7);
    return upcomingFees
      .filter(f => f.status !== 'pending_verification')
      .filter(f => {
        if (!f.due_date) return true;
        const dueDate = new Date(f.due_date);
        if (Number.isNaN(dueDate.getTime())) return true;
        return dueDate <= dueSoonCutoff;
      })
      .reduce((sum, f) => sum + f.amount, 0);
  }, [upcomingFees]);

  // Get selected child info
  const selectedChild = useMemo(() => {
    return children.find(c => c.id === selectedChildId);
  }, [children, selectedChildId]);

  const getStatusBadge = (status: StudentFee['status']) => {
    switch (status) {
      case 'paid':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            background: 'rgba(34, 197, 94, 0.1)',
            color: '#22c55e',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
          }}>
            <CheckCircle2 className="w-3 h-3" />
            Paid
          </span>
        );
      case 'pending':
      case 'partially_paid':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            background: 'rgba(251, 191, 36, 0.1)',
            color: '#fbbf24',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
          }}>
            <Clock className="w-3 h-3" />
            {status === 'partially_paid' ? 'Partial' : 'Pending'}
          </span>
        );
      case 'overdue':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
          }}>
            <AlertCircle className="w-3 h-3" />
            Overdue
          </span>
        );
      case 'pending_verification':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            background: 'rgba(245, 158, 11, 0.1)',
            color: '#f59e0b',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
          }}>
            <Clock className="w-3 h-3" />
            Awaiting Verification
          </span>
        );
      case 'waived':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#3b82f6',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
          }}>
            Waived
          </span>
        );
      default:
        return null;
    }
  };

  const getFeeTypeLabel = (feeType: string) => {
    const labels: Record<string, string> = {
      'registration': 'Registration Fee',
      'registration_fee': 'Registration Fee',
      'monthly_tuition': 'Monthly Tuition',
      'tuition_monthly': 'Monthly Tuition',
      'annual_fee': 'Annual Fee',
      'tuition_annual': 'Annual Tuition',
      'activity_fee': 'Activity Fee',
      'activities': 'Activities',
      'lunch': 'Lunch',
      'meals': 'Meals',
      'transport': 'Transport',
      'uniform': 'Uniform',
      'books': 'Books',
      'deposit': 'Deposit',
      'other': 'Other',
    };
    return labels[feeType] || feeType;
  };

  const handlePayNow = useCallback((fee: StudentFee) => {
    if (!selectedChild) return;
    const params = new URLSearchParams();
    params.set('childId', selectedChild.id);
    params.set('childName', `${selectedChild.first_name} ${selectedChild.last_name}`);
    params.set('studentCode', selectedChild.student_code);
    params.set('feeId', fee.id);
    params.set('feeAmount', fee.amount.toString());
    params.set('feeDescription', fee.description || getFeeTypeLabel(fee.fee_type));
    if (fee.id) {
      params.set('feeId', fee.id);
    }
    params.set('feeDueDate', fee.due_date);
    const schoolId = selectedChild.organization_id || selectedChild.preschool_id;
    if (schoolId) {
      params.set('preschoolId', schoolId);
    }
    if (selectedChild.preschool_name) params.set('preschoolName', selectedChild.preschool_name);

    router.push(`/dashboard/parent/payments/flow?${params.toString()}`);
  }, [router, selectedChild]);

  if (loading) {
    return (
      <ParentShell tenantSlug={slug} userEmail={email}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          <p className="muted">Loading payment information...</p>
        </div>
      </ParentShell>
    );
  }

  return (
    <ParentShell tenantSlug={slug} userEmail={email} preschoolName={preschoolName}>
      <div className="container">
        {/* Back Button */}
        <button
          onClick={() => router.push('/dashboard/parent')}
          className="btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 24,
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            padding: '8px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500
          }}
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>

        <div className="section">
          <h1 className="h1" style={{ marginBottom: 'var(--space-2)' }}>Fees & Payments</h1>
          <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
            Manage your child's school fees, view payment history, and upload proof of payment.
          </p>

          {/* Child Selector - if multiple children */}
          {children.length > 1 && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label className="muted" style={{ fontSize: 13, marginBottom: 'var(--space-2)', display: 'block' }}>
                Select Child
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {children.map(child => (
                  <button
                    key={child.id}
                    onClick={() => setSelectedChildId(child.id)}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-2)',
                      border: selectedChildId === child.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: selectedChildId === child.id ? 'rgba(124, 58, 237, 0.1)' : 'var(--surface-1)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <User className="w-4 h-4" />
                    {child.first_name} {child.last_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Child Info */}
          {selectedChild && (
            <div className="card" style={{ 
              padding: 'var(--space-3)', 
              marginBottom: 'var(--space-4)',
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%)',
              border: '1px solid rgba(124, 58, 237, 0.3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '50%', 
                  background: 'var(--primary)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 600,
                }}>
                  {selectedChild.first_name[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{selectedChild.first_name} {selectedChild.last_name}</div>
                  <div className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <School className="w-3 h-3" />
                    {selectedChild.preschool_name || 'School not assigned'}
                  </div>
                  <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, color: 'var(--primary)', fontWeight: 600 }}>
                    <FileText className="w-3 h-3" />
                    Payment Ref: {selectedChild.student_code}
                  </div>
                </div>
                {selectedChild.payment_verified && (
                  <span style={{
                    marginLeft: 'auto',
                    padding: '4px 8px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    color: '#22c55e',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    ✓ Registration Verified
                  </span>
                )}
              </div>
            </div>
          )}

          {/* No children message */}
          {children.length === 0 && (
            <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
              <User className="w-12 h-12" style={{ color: 'var(--muted)', margin: '0 auto var(--space-3)' }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 'var(--space-2)' }}>No Children Linked</h3>
              <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
                You don't have any children linked to your account yet. Please register your child or contact the school.
              </p>
              <button 
                className="btn btnPrimary"
                onClick={() => router.push('/dashboard/parent/register-child')}
              >
                Register a Child
              </button>
            </div>
          )}

          {selectedChild && (
            <>
              {/* Overview Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-6)',
              }}>
                {(() => {
                  // Calculate the status color based on the first upcoming fee
                  const firstFee = upcomingFees[0];
                  const feeStatus = firstFee 
                    ? getFeeStatusColor(firstFee.due_date, firstFee.grace_period_days || 7)
                    : { color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.3)', label: '', showWarning: false };
                  
                  return (
                    <div className="card" style={{
                      padding: 'var(--space-4)',
                      background: outstandingBalance > 0 
                        ? `linear-gradient(135deg, ${feeStatus.bgColor} 0%, ${feeStatus.bgColor} 100%)`
                        : 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.1) 100%)',
                      border: outstandingBalance > 0 
                        ? `1px solid ${feeStatus.borderColor}`
                        : '1px solid rgba(34, 197, 94, 0.3)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                        <span className="muted" style={{ fontSize: 13 }}>Outstanding Balance</span>
                        <DollarSign className="w-5 h-5" style={{ color: outstandingBalance > 0 ? feeStatus.color : '#22c55e' }} />
                      </div>
                      <div style={{ fontSize: 32, fontWeight: 'bold', color: outstandingBalance > 0 ? feeStatus.color : '#22c55e' }}>
                        {formatCurrency(outstandingBalance)}
                      </div>
                      <p className="muted" style={{ fontSize: 12, marginTop: 'var(--space-2)' }}>
                        {outstandingBalance === 0 && pendingVerificationCount === 0
                          ? '✅ All caught up!'
                          : pendingVerificationCount > 0 && trulyPendingCount === 0
                            ? 'Payments pending approval'
                            : `${trulyPendingCount} payment(s) pending`}
                      </p>
                      {pendingVerificationCount > 0 && (
                        <div style={{ 
                          marginTop: 'var(--space-2)',
                          padding: '4px 10px',
                          background: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#f59e0b',
                          display: 'inline-block',
                        }}>
                          {pendingVerificationCount} payment{pendingVerificationCount !== 1 ? 's' : ''} pending approval
                        </div>
                      )}
                      {outstandingBalance > 0 && feeStatus.label && (
                        <div style={{ 
                          marginTop: 'var(--space-2)',
                          padding: '4px 10px',
                          background: feeStatus.bgColor,
                          border: `1px solid ${feeStatus.borderColor}`,
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          color: feeStatus.color,
                          display: 'inline-block',
                        }}>
                          {feeStatus.label}
                        </div>
                      )}
                      {feeStatus.showWarning && (
                        <div style={{ 
                          marginTop: 'var(--space-2)',
                          padding: 'var(--space-2)',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: 6,
                          fontSize: 11,
                          color: '#ef4444',
                        }}>
                          ⚠️ Late payment penalties may be incurred
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <span className="muted" style={{ fontSize: 13 }}>Next Payment Due</span>
                    <Calendar className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                  </div>
                  {(() => {
                    const nextFee = actionableUpcomingFees[0] || pendingVerificationFees[0] || null;
                    if (!nextFee) {
                      return (
                        <>
                          <div style={{ fontSize: 24, fontWeight: 'bold' }}>None</div>
                          <p className="muted" style={{ fontSize: 12, marginTop: 'var(--space-2)' }}>No upcoming payments</p>
                        </>
                      );
                    }
                    return (
                      <>
                        <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                          {nextFee.status === 'pending_verification' ? 'Awaiting verification' : formatDate(nextFee.due_date)}
                        </div>
                        <p className="muted" style={{ fontSize: 12, marginTop: 'var(--space-2)' }}>
                          {getFeeTypeLabel(nextFee.fee_type)}
                        </p>
                      </>
                    );
                  })()}
                </div>

                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <span className="muted" style={{ fontSize: 13 }}>Registration Fee</span>
                    <CreditCard className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                    {selectedChild.registration_fee_amount 
                      ? formatCurrency(selectedChild.registration_fee_amount)
                      : 'Not set'}
                  </div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 'var(--space-2)' }}>
                    {selectedChild.registration_fee_paid 
                      ? (selectedChild.payment_verified ? '✅ Paid & Verified' : '⏳ Paid - Awaiting verification')
                      : '❌ Not paid'}
                  </p>
                </div>
              </div>

              {/* Pending Documents */}
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <PendingDocumentsCard
                  documents={documentStatus}
                  registrationId={registrationId}
                  studentId={selectedChildId}
                />
              </div>

              {/* Tabs */}
              <div style={{
                display: 'flex',
                gap: 'var(--space-2)',
                borderBottom: '1px solid var(--border)',
                marginBottom: 'var(--space-5)',
                overflowX: 'auto',
              }}>
                {[
                  { id: 'overview', label: 'Upcoming' },
                  { id: 'history', label: 'Payment History' },
                  { id: 'upload', label: 'Upload Proof' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      background: 'none',
                      border: 'none',
                      borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                      color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
                      fontWeight: activeTab === tab.id ? 600 : 400,
                      cursor: 'pointer',
                      fontSize: 14,
                      whiteSpace: 'nowrap',
                    }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === 'overview' && (
                <div>
                  <h2 className="h2" style={{ marginBottom: 'var(--space-4)' }}>Upcoming Payments</h2>
                  
                  {upcomingFees.length === 0 ? (
                    <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
                      <CheckCircle2 className="w-12 h-12" style={{ color: 'var(--success)', margin: '0 auto var(--space-3)' }} />
                      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 'var(--space-2)' }}>All Caught Up!</h3>
                      <p className="muted">You have no outstanding payments at this time.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                      {upcomingFees.map((fee) => {
                        const feeStatus = getFeeStatusColor(fee.due_date, fee.grace_period_days || 7);
                        const isPendingVerification = fee.status === 'pending_verification';
                        const amountColor = isPendingVerification ? '#f59e0b' : feeStatus.color;
                        return (
                        <div key={fee.id} className="card" style={{ 
                          padding: 'var(--space-4)',
                          border: `1px solid ${isPendingVerification ? 'rgba(245, 158, 11, 0.4)' : feeStatus.borderColor}`,
                          opacity: isPendingVerification ? 0.8 : 1,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                            <div style={{ flex: 1 }}>
                              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                                {getFeeTypeLabel(fee.fee_type)}
                              </h3>
                              {fee.description && (
                                <p className="muted" style={{ fontSize: 13, marginBottom: 'var(--space-1)' }}>
                                  {fee.description}
                                </p>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 13, color: feeStatus.color }}>
                                <Calendar className="w-4 h-4" />
                                Due: {formatDate(fee.due_date)}
                              </div>
                              {/* Status Badge */}
                              <div style={{ 
                                marginTop: 'var(--space-2)',
                                padding: '4px 10px',
                                background: isPendingVerification ? 'rgba(245, 158, 11, 0.12)' : feeStatus.bgColor,
                                border: `1px solid ${isPendingVerification ? 'rgba(245, 158, 11, 0.35)' : feeStatus.borderColor}`,
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: isPendingVerification ? '#f59e0b' : feeStatus.color,
                                display: 'inline-block',
                              }}>
                                {isPendingVerification ? 'Awaiting Verification' : feeStatus.label}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 'var(--space-2)', color: amountColor }}>
                                {formatCurrency(fee.amount)}
                              </div>
                              {getStatusBadge(fee.status)}
                            </div>
                          </div>
                          {/* Warning for late payments */}
                          {feeStatus.showWarning && !isPendingVerification && (
                            <div style={{ 
                              padding: 'var(--space-2) var(--space-3)',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: 6,
                              fontSize: 12,
                              color: '#ef4444',
                              marginBottom: 'var(--space-3)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                            }}>
                              <AlertCircle className="w-4 h-4" />
                              Late payment penalties may be incurred. Please pay as soon as possible.
                            </div>
                          )}
                          {isPendingVerification && (
                            <div style={{ 
                              padding: 'var(--space-2) var(--space-3)',
                              background: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              borderRadius: 6,
                              fontSize: 12,
                              color: '#f59e0b',
                              marginBottom: 'var(--space-3)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                            }}>
                              <Clock className="w-4 h-4" />
                              POP uploaded. The school is reviewing your payment.
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                            <button
                              className="btn btnPrimary"
                              style={{ flex: 1 }}
                              onClick={() => handlePayNow(fee)}
                              disabled={isPendingVerification}
                            >
                              <CreditCard className="icon16" />
                              Pay Now
                            </button>
                            <button
                              className="btn btnSecondary"
                              onClick={() => {
                                const params = new URLSearchParams();
                                params.set('child', selectedChildId ?? '');
                                params.set('feeId', fee.id);
                                const desc = fee.description || getFeeTypeLabel(fee.fee_type);
                                if (desc) params.set('feeDescription', desc);
                                const billingMonthSource = fee.billing_month || fee.due_date;
                                if (billingMonthSource) params.set('billingMonth', billingMonthSource);
                                router.push(`/dashboard/parent/payments/pop-upload?${params.toString()}`);
                              }}
                              disabled={isPendingVerification}
                            >
                              <Upload className="icon16" />
                              Upload Proof
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Fee Structure */}
                  {feeStructure.length > 0 && (
                    <div style={{ marginTop: 'var(--space-6)' }}>
                      <h2 className="h2" style={{ marginBottom: 'var(--space-4)' }}>School Fee Structure</h2>
                      <div className="card" style={{ padding: 'var(--space-4)' }}>
                        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                          {feeStructure.map((fee) => (
                            <div
                              key={fee.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: 'var(--space-3)',
                                background: 'var(--surface)',
                                borderRadius: 'var(--radius-2)',
                              }}>
                              <div>
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>{getFeeTypeLabel(fee.fee_type)}</div>
                                <div className="muted" style={{ fontSize: 12 }}>
                                  {fee.description || ''} {fee.payment_frequency ? `• ${fee.payment_frequency}` : ''}
                                </div>
                              </div>
                              <div style={{ fontSize: 18, fontWeight: 700 }}>
                                {formatCurrency(fee.amount)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div>
                  <h2 className="h2" style={{ marginBottom: 'var(--space-4)' }}>Payment History</h2>
                  
                  {paidFees.length === 0 ? (
                    <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
                      <FileText className="w-12 h-12" style={{ color: 'var(--muted)', margin: '0 auto var(--space-3)' }} />
                      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 'var(--space-2)' }}>No Payment History</h3>
                      <p className="muted">Your payment history will appear here once payments are confirmed.</p>
                    </div>
                  ) : (
                    <div className="card" style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: 'var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 13 }}>Description</th>
                            <th style={{ padding: 'var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 13 }}>Due Date</th>
                            <th style={{ padding: 'var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 13 }}>Paid Date</th>
                            <th style={{ padding: 'var(--space-3)', textAlign: 'right', fontWeight: 600, fontSize: 13 }}>Amount</th>
                            <th style={{ padding: 'var(--space-3)', textAlign: 'center', fontWeight: 600, fontSize: 13 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paidFees.map((fee) => (
                            <tr key={fee.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: 'var(--space-3)', fontSize: 14 }}>{getFeeTypeLabel(fee.fee_type)}</td>
                              <td style={{ padding: 'var(--space-3)', fontSize: 14 }} className="muted">
                                {formatDate(fee.due_date)}
                              </td>
                              <td style={{ padding: 'var(--space-3)', fontSize: 14 }} className="muted">
                                {fee.paid_date ? formatDate(fee.paid_date) : '-'}
                              </td>
                              <td style={{ padding: 'var(--space-3)', fontSize: 14, textAlign: 'right', fontWeight: 600 }}>
                                {formatCurrency(fee.amount)}
                              </td>
                              <td style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                                {getStatusBadge(fee.status)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'upload' && (
                <div>
                  <h2 className="h2" style={{ marginBottom: 'var(--space-4)' }}>Proof of Payment</h2>
                  
                  {/* Quick Actions Card */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                    <div 
                      className="card" 
                      style={{ 
                        padding: 'var(--space-5)', 
                        cursor: 'pointer',
                        border: '2px solid var(--primary)',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => router.push(`/dashboard/parent/payments/pop-upload?child=${selectedChildId}`)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(124, 58, 237, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <Upload className="w-10 h-10" style={{ color: 'var(--primary)', marginBottom: 'var(--space-3)' }} />
                      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 'var(--space-2)' }}>Upload New Proof</h3>
                      <p className="muted" style={{ fontSize: 14 }}>
                        Submit proof of payment for {selectedChild.first_name}
                      </p>
                    </div>

                    <div 
                      className="card" 
                      style={{ 
                        padding: 'var(--space-5)', 
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => router.push(`/dashboard/parent/payments/pop-history?child=${selectedChildId}`)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.borderColor = 'var(--primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      <History className="w-10 h-10" style={{ color: 'var(--muted)', marginBottom: 'var(--space-3)' }} />
                      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 'var(--space-2)' }}>View History</h3>
                      <p className="muted" style={{ fontSize: 14 }}>
                        Check the status of your submitted uploads
                      </p>
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{
                      padding: 'var(--space-4)',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: 'var(--radius-2)',
                    }}>
                      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                        <Info className="w-5 h-5" style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
                        <div>
                          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 'var(--space-1)' }}>Upload Guidelines</h3>
                          <ul className="muted" style={{ fontSize: 13, paddingLeft: 'var(--space-4)', margin: 0 }}>
                            <li>Accepted formats: PDF, JPG, PNG</li>
                            <li>Maximum file size: 10MB</li>
                            <li>Include payment reference number if available</li>
                            <li>Select the billing month when uploading POP</li>
                            <li>School will review and confirm payment within 24-48 hours</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ParentShell>
  );
}
