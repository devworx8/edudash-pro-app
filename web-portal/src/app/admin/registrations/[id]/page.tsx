'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, User, Baby, Mail, Phone, MapPin, Calendar, FileText, CheckCircle2, XCircle, Clock, DollarSign } from 'lucide-react';

interface Registration {
  id: string;
  organization_id: string;
  organization_name?: string;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  guardian_address: string;
  guardian_id_document_url: string | null;
  student_first_name: string;
  student_last_name: string;
  student_dob: string;
  student_gender: string;
  student_birth_certificate_url: string | null;
  student_clinic_card_url: string | null;
  documents_uploaded: boolean;
  documents_deadline: string | null;
  registration_fee_amount: number;
  registration_fee_paid: boolean;
  payment_method: string | null;
  proof_of_payment_url: string | null;
  campaign_applied: string | null;
  discount_amount: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export default function AdminRegistrationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const supabase = createClient();
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [popVerified, setPopVerified] = useState(false);

  useEffect(() => {
    if (id) {
      fetchRegistration();
    }
  }, [id]);

  const fetchRegistration = async () => {
    try {
      // Fetch from EduSitePro database
      const edusiteproUrl = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_URL || 'https://bppuzibjlxgfwrujzfsz.supabase.co';
      const edusiteproKey = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_ANON_KEY;

      const { createClient } = await import('@supabase/supabase-js');
      const edusiteproClient = createClient(edusiteproUrl, edusiteproKey!);

      const { data, error } = await edusiteproClient
        .from('registration_requests')
        .select(`
          *,
          organizations (
            name
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setRegistration({
          ...data,
          organization_name: data.organizations?.name,
        });
        // Auto-verify POP if URL exists
        if (data.proof_of_payment_url) {
          setPopVerified(true);
        }
      }
    } catch (error) {
      console.error('Error fetching registration:', error);
      alert('Failed to load registration details');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!registration || !popVerified) {
      alert('Please verify proof of payment first');
      return;
    }

    setProcessing(true);
    try {
      const edusiteproUrl = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_URL || 'https://bppuzibjlxgfwrujzfsz.supabase.co';
      const edusiteproKey = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_ANON_KEY;

      const { createClient } = await import('@supabase/supabase-js');
      const edusiteproClient = createClient(edusiteproUrl, edusiteproKey!);

      const { data: { session } } = await supabase.auth.getSession();
      const reviewerEmail = session?.user?.email || 'admin';

      const { error } = await edusiteproClient
        .from('registration_requests')
        .update({
          status: 'approved',
          reviewed_by: reviewerEmail,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', registration.id);

      if (error) throw error;

      alert('Registration approved successfully!');
      router.push('/admin/registrations');
    } catch (error) {
      console.error('Error approving:', error);
      alert('Failed to approve registration');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!registration) return;
    
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    setProcessing(true);
    try {
      const edusiteproUrl = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_URL || 'https://bppuzibjlxgfwrujzfsz.supabase.co';
      const edusiteproKey = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_ANON_KEY;

      const { createClient } = await import('@supabase/supabase-js');
      const edusiteproClient = createClient(edusiteproUrl, edusiteproKey!);

      const { data: { session } } = await supabase.auth.getSession();
      const reviewerEmail = session?.user?.email || 'admin';

      const { error } = await edusiteproClient
        .from('registration_requests')
        .update({
          status: 'rejected',
          reviewed_by: reviewerEmail,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', registration.id);

      if (error) throw error;

      alert('Registration rejected');
      router.push('/admin/registrations');
    } catch (error) {
      console.error('Error rejecting:', error);
      alert('Failed to reject registration');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!registration) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Registration not found</p>
          <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:underline">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Registrations
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Registration Details
            </h1>
            {registration.status === 'pending' && (
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  disabled={processing || !popVerified}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={!popVerified ? "Verify proof of payment first" : "Approve registration"}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {processing ? 'Processing...' : 'Approve'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Registration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Student Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                <Baby className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Student Information</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Full Name</label>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {registration.student_first_name} {registration.student_last_name}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date of Birth</label>
                <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                  <Calendar className="w-4 h-4" />
                  {new Date(registration.student_dob).toLocaleDateString()}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Gender</label>
                <p className="text-sm text-gray-900 dark:text-white capitalize">{registration.student_gender}</p>
              </div>
              {registration.student_birth_certificate_url && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Birth Certificate</label>
                  <a
                    href={registration.student_birth_certificate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <FileText className="w-4 h-4" />
                    View Document
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Guardian Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Guardian Information</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</label>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{registration.guardian_name}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Email</label>
                <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                  <Mail className="w-4 h-4" />
                  {registration.guardian_email}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Phone</label>
                <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                  <Phone className="w-4 h-4" />
                  {registration.guardian_phone}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Address</label>
                <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
                  <MapPin className="w-4 h-4" />
                  {registration.guardian_address}
                </div>
              </div>
            </div>
          </div>

          {/* Payment & Fee Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Payment Information</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Registration Fee</label>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  R{registration.registration_fee_amount || 300}
                  {registration.discount_amount > 0 && (
                    <span className="ml-2 text-xs text-green-600">({registration.discount_amount}% discount applied)</span>
                  )}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Payment Status</label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  registration.registration_fee_paid
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {registration.registration_fee_paid ? 'Paid' : 'Unpaid'}
                </span>
              </div>
              {registration.payment_method && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Payment Method</label>
                  <p className="text-sm text-gray-900 dark:text-white capitalize">{registration.payment_method}</p>
                </div>
              )}
            </div>
          </div>

          {/* Proof of Payment */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Proof of Payment</h2>
            </div>
            {registration.proof_of_payment_url ? (
              <div className="space-y-3">
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
                  <img
                    src={registration.proof_of_payment_url}
                    alt="Proof of Payment"
                    className="w-full h-auto rounded"
                    onLoad={() => setPopVerified(true)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pop-verify"
                    checked={popVerified}
                    onChange={(e) => setPopVerified(e.target.checked)}
                    className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                  />
                  <label htmlFor="pop-verify" className="text-sm text-gray-700 dark:text-gray-300">
                    I verify this proof of payment
                  </label>
                </div>
                <a
                  href={registration.proof_of_payment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Open in new tab →
                </a>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No proof of payment uploaded yet</p>
            )}
          </div>

          {/* Status & School */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm md:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">School</label>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{registration.organization_name || 'Unknown'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  registration.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  registration.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {registration.status}
                </span>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Submitted</label>
                <p className="text-sm text-gray-900 dark:text-white">{new Date(registration.created_at).toLocaleDateString()}</p>
              </div>
              {registration.reviewed_by && (
                <>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Reviewed By</label>
                    <p className="text-sm text-gray-900 dark:text-white">{registration.reviewed_by}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Reviewed At</label>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {registration.reviewed_at ? new Date(registration.reviewed_at).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </>
              )}
              {registration.rejection_reason && (
                <div className="md:col-span-3">
                  <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rejection Reason</label>
                  <p className="text-sm text-red-600 dark:text-red-400">{registration.rejection_reason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
