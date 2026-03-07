'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { Search, Loader2, UserPlus } from 'lucide-react';

export default function ClaimChildPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>();
  const [preschoolId, setPreschoolId] = useState<string>();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [showSchoolSelector, setShowSchoolSelector] = useState(false);
  const { slug } = useTenantSlug(userId);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/sign-in'); return; }
      setEmail(session.user.email || '');
      setUserId(session.user.id);
      
      // Get user's preschool_id and check if Community School
      const { data: userData } = await supabase
        .from('profiles')
        .select('preschool_id, preschools(name)')
        .eq('id', session.user.id)
        .maybeSingle();
      
      // Redirect Community School parents to register-child (auto-approval flow)
      const schoolName = (userData as any)?.preschools?.name || '';
      const isCommunitySchool = schoolName.toLowerCase().includes('community school');
      
      if (isCommunitySchool) {
        router.replace('/dashboard/parent/register-child');
        return;
      }
      
      if (userData?.preschool_id) {
        setPreschoolId(userData.preschool_id);
        setSelectedSchoolId(userData.preschool_id);
      } else {
        // No preschool - redirect to register-child
        router.replace('/dashboard/parent/register-child');
        return;
      }
    })();
  }, [router, supabase]);

  const handleSearch = async () => {
    const schoolToSearch = preschoolId || selectedSchoolId;
    if (!searchQuery.trim() || !schoolToSearch) return;
    
    setLoading(true);
    try {
      const { data: students, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, date_of_birth, class_id, classes(name, grade_level)')
        .eq('preschool_id', schoolToSearch)
        .eq('is_active', true)
        .or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%`)
        .limit(10);
      
      if (error) throw error;
      setSearchResults(students || []);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimChild = async (studentId: string, childName: string) => {
    const schoolId = preschoolId || selectedSchoolId;
    if (!userId || !schoolId) return;
    
    setSubmitting(studentId);
    try {
      // Proactive duplicate check: query for existing pending requests
      
      const { data: existingRequests, error: checkError } = await supabase
        .from('guardian_requests')
        .select('id')
        .eq('parent_auth_id', userId)
        .eq('student_id', studentId)
        .eq('status', 'pending');

      if (checkError) {
        // Log error but continue - DB uniqueness constraint is our fallback
        console.error('[ClaimChild] Duplicate check query failed:', checkError);
      } else if (existingRequests && existingRequests.length > 0) {
        // Found duplicate - block submission
        alert(`You have already sent a link request for ${childName}.\n\nPlease wait for the school to review your existing request.`);
        setSubmitting(null);
        return;
      }

      // Update parent's preschool_id if not set
      if (!preschoolId && selectedSchoolId) {
        // Set parent preschool_id to selected school
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ preschool_id: selectedSchoolId })
          .eq('id', userId);
        
        if (updateError) {
          console.error('❌ Failed to update parent preschool_id:', updateError);
        } else {
          // Parent preschool_id updated successfully
          setPreschoolId(selectedSchoolId);
        }
      }
      
      // Insert guardian request
      const { error } = await supabase
        .from('guardian_requests')
        .insert({
          parent_auth_id: userId,
          student_id: studentId,
          child_full_name: childName,
          status: 'pending',
          school_id: schoolId,
          created_at: new Date().toISOString(),
        });
      
      if (error) {
        if (error.code === '23505') {
          alert(`You have already sent a link request for ${childName}.\n\nPlease wait for the school to review your existing request.`);
        } else {
          throw error;
        }
      } else {
        alert(`✅ Request sent for ${childName}!

🕒 Awaiting school approval.

Once approved, you'll see ${childName} in your dashboard.`);
        setSearchResults(searchResults.filter(s => s.id !== studentId));
        
        // Redirect to dashboard after short delay
        setTimeout(() => router.push('/dashboard/parent'), 2000);
      }
    } catch (err) {
      console.error('Claim error:', err);
      alert('Failed to send request. Please try again.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <ParentShell tenantSlug={slug} userEmail={email}>
      <div className="container">
        <div className="section">
          <h1 className="h1">Search & Claim Child</h1>
          <p className="muted">Search for your child and send a link request to the school.</p>
        </div>
        <div className="section">
          <div className="card p-md" style={{ paddingBottom: '2rem' }}>
            {/* School selector for parents without preschool_id */}
            {showSchoolSelector && (
              <div style={{ marginBottom: 24, padding: 16, background: 'rgba(102, 126, 234, 0.1)', border: '1px solid rgba(102, 126, 234, 0.3)', borderRadius: 12 }}>
                <label style={{ display: 'block', marginBottom: 12, fontWeight: 600, fontSize: 14, color: 'white' }}>
                  🏫 Select Your Child's School *
                </label>
                <select
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'white',
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  <option value="" style={{ background: '#1a1a1a', color: 'white' }}>-- Select a school --</option>
                  {schools.map(school => (
                    <option key={school.id} value={school.id} style={{ background: '#1a1a1a', color: 'white' }}>
                      {school.name}
                    </option>
                  ))}
                </select>
                {!selectedSchoolId && (
                  <p style={{ marginTop: 8, fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                    ⚠️ Please select your child's school before searching
                  </p>
                )}
              </div>
            )}
            
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter child's first or last name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-4 py-3 bg-gray-900/80 border border-gray-700/60 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                disabled={loading}
              />
              <button
                onClick={handleSearch}
                disabled={loading || !searchQuery.trim() || (!preschoolId && !selectedSchoolId)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-200 flex items-center gap-2 font-semibold shadow-lg hover:shadow-blue-600/30 disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="hidden sm:inline">Searching...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span className="hidden sm:inline">Search</span>
                  </>
                )}
              </button>
            </div>
            
            {searchResults.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4 px-1">
                  <h3 className="font-bold text-white text-lg">Search Results</h3>
                  <span className="text-sm text-gray-400 font-medium">{searchResults.length} found</span>
                </div>
                <div className="space-y-3">
                  {searchResults.map((student) => (
                    <div
                      key={student.id}
                      className="group relative p-4 bg-gradient-to-br from-gray-900/80 to-gray-900/60 border border-gray-700/60 rounded-xl hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg">
                          {student.first_name[0]}{student.last_name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white text-base mb-1 group-hover:text-blue-400 transition-colors">
                            {student.first_name} {student.last_name}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                            <span className="px-2 py-1 bg-gray-800/60 rounded-md border border-gray-700/40">
                              {student.classes?.grade_level || 'Preschool'}
                            </span>
                            <span className="px-2 py-1 bg-gray-800/60 rounded-md border border-gray-700/40">
                              {student.classes?.name || 'Unassigned'}
                            </span>
                            {student.date_of_birth && (
                              <span className="px-2 py-1 bg-gray-800/60 rounded-md border border-gray-700/40">
                                Born {new Date(student.date_of_birth).toLocaleDateString('en-ZA')}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleClaimChild(student.id, `${student.first_name} ${student.last_name}`)}
                          disabled={submitting === student.id}
                          className="flex-shrink-0 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-700 disabled:to-gray-700 text-white rounded-lg transition-all duration-200 flex items-center gap-2 disabled:cursor-not-allowed shadow-lg hover:shadow-purple-600/30 disabled:shadow-none font-semibold text-sm"
                        >
                          {submitting === student.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="hidden sm:inline">Sending...</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-4 h-4" />
                              <span className="hidden sm:inline">Claim Child</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {searchQuery && !loading && searchResults.length === 0 && (
              <div className="mt-4 text-center text-gray-400 py-8">
                <p>No children found matching &quot;{searchQuery}&quot;</p>
                <p className="text-sm mt-2">Try a different name or check the spelling</p>
              </div>
            )}
            
            {!searchQuery && (
              <div className="mt-16 p-4 bg-blue-900/20 border border-blue-700/30 rounded-xl">
                <p className="text-blue-300 text-sm flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <span><strong className="font-semibold">Tip:</strong> Enter your child&apos;s first or last name to search for them in the school registry.</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ParentShell>
  );
}
