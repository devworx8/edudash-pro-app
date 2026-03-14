/** Fetch fees, POP uploads, fee structures, and payment methods for a child */
import { assertSupabase } from '@/lib/supabase';
import { selectFeeStructureForChild, type FeeStructureCandidate } from '@/lib/utils/feeStructureSelector';
import type { PaymentChild, StudentFee, FeeStructure, PaymentMethod, POPUpload } from '@/types/payments';
import {
  isTuitionFee, buildFeeContext, toMonthKey, getEnrollmentMonthStart, getNextFeeMonth,
  MONTH_NAMES, type ReceiptInfo,
} from './helpers';
export interface FeeLoadResult {
  popUploads: POPUpload[];
  studentFees: StudentFee[];
  feeStructure: FeeStructure[];
  paymentMethods: PaymentMethod[];
}
export async function fetchPaymentFees(
  selectedChildId: string,
  children: PaymentChild[],
  preschoolId?: string,
): Promise<FeeLoadResult> {
  const supabase = assertSupabase();
  const selectedChild = children.find(c => c.id === selectedChildId);
  const childPreschoolId = selectedChild?.preschool_id || preschoolId;
  // POP uploads
  const { data: uploads } = await supabase
    .from('pop_uploads').select('id, student_id, upload_type, title, description, category_code, file_path, file_name, status, payment_amount, payment_date, payment_for_month, payment_reference, created_at')
    .eq('student_id', selectedChildId).eq('upload_type', 'proof_of_payment')
    .order('created_at', { ascending: false });
  const popUploadsData = (uploads || []) as POPUpload[];
  // Receipt index from completed payments
  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount, status, created_at, fee_ids, metadata, payment_reference, student_id')
    .eq('student_id', selectedChildId).in('status', ['completed', 'approved'])
    .order('created_at', { ascending: false });
  const receiptsByFeeId = new Map<string, ReceiptInfo>();
  const receiptsByMonth = new Map<string, ReceiptInfo>();
  (payments || []).forEach((payment: any) => {
    const metadata = payment?.metadata || {};
    const receiptUrl = typeof metadata?.receipt_url === 'string' ? metadata.receipt_url : null;
    const receiptStoragePath = typeof metadata?.receipt_storage_path === 'string' ? metadata.receipt_storage_path : null;
    if (!receiptUrl && !receiptStoragePath) return;
    const feeIds = Array.isArray(payment?.fee_ids) ? [...payment.fee_ids] : [];
    if (typeof metadata?.fee_id === 'string') feeIds.push(metadata.fee_id);
    feeIds.forEach((id: string) => { if (id) receiptsByFeeId.set(id, { receiptUrl, receiptStoragePath }); });
    const monthKey = toMonthKey(metadata?.payment_for_month);
    if (monthKey && !receiptsByMonth.has(monthKey)) receiptsByMonth.set(monthKey, { receiptUrl, receiptStoragePath });
  });
  // Student fees with fee structure details
  const { data: fees } = await supabase
    .from('student_fees').select('*, fee_structures (id, name, fee_type, description, grade_levels)')
    .eq('student_id', selectedChildId).order('due_date', { ascending: true });
  let mappedFees: StudentFee[] = [];
  let hasTuitionFeesForChild = false;
  if (fees && fees.length > 0) {
    const enrollmentStart = getEnrollmentMonthStart(selectedChild?.enrollment_date);
    let filteredFees = fees.filter((f: any) => {
      if (!enrollmentStart || !f?.due_date) return true;
      const dueDate = new Date(f.due_date);
      return !Number.isNaN(dueDate.getTime()) ? dueDate >= enrollmentStart : true;
    });
    const feeContext = buildFeeContext(selectedChild);
    const canFilterByAge = Boolean(feeContext.dateOfBirth || feeContext.ageGroupLabel || feeContext.gradeLevel);
    const tuitionStructures = filteredFees
      .filter((f: any) => isTuitionFee(f?.fee_structures?.fee_type, f?.fee_structures?.name, f?.fee_structures?.description))
      .map((f: any) => f.fee_structures).filter((fs: any) => fs && fs.id) as FeeStructureCandidate[];
    const uniqueTuitionStructures = tuitionStructures.filter((fs, idx, arr) => arr.findIndex(item => item.id === fs.id) === idx);
    const selectedStructure = canFilterByAge && uniqueTuitionStructures.length > 1
      ? selectFeeStructureForChild(uniqueTuitionStructures, feeContext) : null;
    if (selectedStructure?.id) {
      filteredFees = filteredFees.filter((f: any) => {
        if (!isTuitionFee(f?.fee_structures?.fee_type, f?.fee_structures?.name, f?.fee_structures?.description)) return true;
        const feeStructureId = f?.fee_structures?.id || f?.fee_structure_id;
        return !feeStructureId || feeStructureId === selectedStructure.id;
      });
    }
    hasTuitionFeesForChild = filteredFees.some((f: any) =>
      isTuitionFee(f?.fee_structures?.fee_type, f?.fee_structures?.name, f?.fee_structures?.description));
    mappedFees = filteredFees.map((f: any) => {
      const dueDate = new Date(f.due_date);
      const month = MONTH_NAMES[dueDate.getMonth()];
      const year = dueDate.getFullYear();
      const baseName = f.fee_structures?.name || f.fee_structures?.description || f.description || f.fee_type || 'Fee';
      const isTuitionForFee = isTuitionFee(f.fee_structures?.fee_type, f.fee_structures?.name, f.fee_structures?.description);
      let description = baseName;
      if (isTuitionForFee) {
        const ageMatch = baseName.match(/Ages?\s*([\d]+-[\d]+|[\d]+\s*(?:months?|years?)?)/i);
        const ageGroup = ageMatch ? ageMatch[1] : '';
        description = `${month} ${year} School Fees${ageGroup ? ` (${ageGroup}${!ageGroup.includes('year') && !ageGroup.includes('month') ? ' years' : ''})` : ''}`;
      } else if (!Number.isNaN(dueDate.getTime())) {
        description = `${baseName} • ${month} ${year}`;
      }
      const directReceipt = receiptsByFeeId.get(f.id);
      const dueMonthKey = toMonthKey(f.due_date);
      const monthReceipt = dueMonthKey ? receiptsByMonth.get(dueMonthKey) : undefined;
      const receiptInfo = directReceipt || monthReceipt;
      const matchingPOP = popUploadsData.find((pop: any) => {
        const periodDate = pop.payment_for_month || pop.payment_date;
        if (!periodDate) return false;
        const popDate = new Date(periodDate);
        const feeDate = new Date(f.due_date);
        const sameMonth = popDate.getMonth() === feeDate.getMonth() && popDate.getFullYear() === feeDate.getFullYear();
        const similarAmount = pop.payment_amount && Math.abs(pop.payment_amount - (f.final_amount || f.amount)) < 10;
        return sameMonth || similarAmount;
      });
      return {
        id: f.id, student_id: f.student_id, fee_type: f.fee_structures?.fee_type || 'tuition',
        description, amount: f.final_amount || f.amount, due_date: f.due_date, grace_period_days: 7,
        paid_date: f.paid_date, status: f.status, pop_status: matchingPOP?.status,
        receipt_url: receiptInfo?.receiptUrl ?? null, receipt_storage_path: receiptInfo?.receiptStoragePath ?? null,
      };
    });
  }
  // Fee structure + generated next-month fee
  let feeStructureResult: FeeStructure[] = [];
  let paymentMethodsResult: PaymentMethod[] = [];
  if (childPreschoolId) {
    let resolvedFees: any[] = [];
    const { data: schoolFees } = await supabase
      .from('school_fee_structures').select('id, name, fee_category, amount_cents, description, billing_frequency, age_group, grade_level').eq('preschool_id', childPreschoolId).eq('is_active', true);
    if (schoolFees && schoolFees.length > 0) {
      resolvedFees = schoolFees.map((f: any) => ({
        id: f.id, name: f.name, fee_type: f.fee_category || f.name,
        amount: f.amount_cents / 100, description: f.description || f.name,
        payment_frequency: f.billing_frequency, age_group: f.age_group, grade_level: f.grade_level,
      }));
    } else {
      const { data: legacyFees } = await supabase
        .from('fee_structures').select('id, name, fee_type, amount, description, frequency, grade_levels').eq('preschool_id', childPreschoolId).eq('is_active', true);
      if (legacyFees && legacyFees.length > 0) {
        resolvedFees = legacyFees.map((f: any) => ({
          id: f.id, name: f.name, fee_type: f.fee_type || f.name, amount: f.amount,
          description: f.description || f.name, payment_frequency: f.frequency,
          age_group: Array.isArray(f.grade_levels) ? f.grade_levels.join(', ') : undefined,
          grade_levels: Array.isArray(f.grade_levels) ? f.grade_levels : undefined,
        }));
      }
    }
    if (resolvedFees.length > 0) {
      feeStructureResult = resolvedFees as FeeStructure[];
      const tuitionFees = resolvedFees.filter((f: any) => isTuitionFee(f.fee_type, f.name, f.description));
      const selectedFee = tuitionFees.length > 0
        ? selectFeeStructureForChild(tuitionFees as FeeStructureCandidate[], buildFeeContext(selectedChild)) || tuitionFees[0]
        : null;
      if (selectedFee && (!fees || fees.length === 0 || !hasTuitionFeesForChild)) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const existingMonths = new Set(
          mappedFees.map(f => {
            const d = new Date(f.due_date);
            return `${d.getFullYear()}-${d.getMonth()}`;
          })
        );

        const currentKey = `${currentYear}-${currentMonth}`;
        if (!existingMonths.has(currentKey)) {
          mappedFees = [{
            id: `pending-${MONTH_NAMES[currentMonth].toLowerCase()}-${currentYear}`, student_id: selectedChildId,
            fee_type: 'monthly_tuition',
            description: `${MONTH_NAMES[currentMonth]} ${currentYear} School Fees${selectedFee.age_group ? ` (${selectedFee.age_group})` : ''}`,
            amount: selectedFee.amount, due_date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
            grace_period_days: 7, status: 'pending',
          }, ...mappedFees];
        }

        const { month: nextMonth, year: nextYear } = getNextFeeMonth();
        const nextKey = `${nextYear}-${nextMonth}`;
        if (!existingMonths.has(nextKey) && nextKey !== currentKey) {
          mappedFees = [...mappedFees, {
            id: `pending-${MONTH_NAMES[nextMonth].toLowerCase()}-${nextYear}`, student_id: selectedChildId,
            fee_type: 'monthly_tuition',
            description: `${MONTH_NAMES[nextMonth]} ${nextYear} School Fees${selectedFee.age_group ? ` (${selectedFee.age_group})` : ''}`,
            amount: selectedFee.amount, due_date: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`,
            grace_period_days: 7, status: 'pending',
          }];
        }
      }
    }
    const { data: paymentMethodsData } = await supabase
      .from('organization_payment_methods').select('id, method_name, display_name, processing_fee, fee_type, description, instructions, bank_name, account_number, branch_code, preferred')
      .eq('organization_id', childPreschoolId).eq('active', true)
      .order('preferred', { ascending: false });
    if (paymentMethodsData) paymentMethodsResult = paymentMethodsData as PaymentMethod[];
  }
  return { popUploads: popUploadsData, studentFees: mappedFees, feeStructure: feeStructureResult, paymentMethods: paymentMethodsResult };
}
