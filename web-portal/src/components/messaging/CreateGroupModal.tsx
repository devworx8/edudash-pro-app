'use client';

/**
 * CreateGroupModal
 * 
 * Modal for creating messaging groups (class groups, parent groups, announcements)
 * Used by principals and teachers to create group communications.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  X, 
  Search,
  Users,
  GraduationCap,
  Megaphone,
  ChevronRight,
  ChevronLeft,
  Check,
  Info
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Class {
  id: string;
  name: string;
  teacher_id: string | null;
  teacher?: {
    first_name: string | null;
    last_name: string | null;
  };
  student_count?: number;
}

interface Parent {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  students?: {
    first_name: string;
    last_name: string;
    class?: { name: string };
  }[];
}

type GroupType = 'class_group' | 'parent_group' | 'announcement';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (threadId: string) => void;
  preschoolId: string | undefined;
  userId: string | undefined;
  userRole: string | undefined;
}

// ============================================================================
// Component
// ============================================================================

export function CreateGroupModal({
  isOpen,
  onClose,
  onGroupCreated,
  preschoolId,
  userId,
  userRole,
}: CreateGroupModalProps) {
  const supabase = createClient();
  
  // State
  const [step, setStep] = useState<'type' | 'details' | 'members'>('type');
  const [groupType, setGroupType] = useState<GroupType | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [allowReplies, setAllowReplies] = useState(true);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedParents, setSelectedParents] = useState<string[]>([]);
  const [announcementAudience, setAnnouncementAudience] = useState<'all_parents' | 'all_teachers' | 'all_staff' | 'everyone'>('all_parents');
  
  // Data
  const [classes, setClasses] = useState<Class[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Check permissions
  const canCreateClassGroup = userRole === 'principal' || userRole === 'teacher' || userRole === 'admin' || userRole === 'principal_admin';
  const canCreateParentGroup = userRole === 'principal' || userRole === 'teacher' || userRole === 'admin' || userRole === 'principal_admin';
  const canCreateAnnouncement = userRole === 'principal' || userRole === 'admin' || userRole === 'principal_admin';

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('type');
      setGroupType(null);
      setGroupName('');
      setGroupDescription('');
      setAllowReplies(true);
      setSelectedClass(null);
      setSelectedParents([]);
      setAnnouncementAudience('all_parents');
      setError(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Fetch classes when selecting class group
  useEffect(() => {
    if (!isOpen || !preschoolId || groupType !== 'class_group') return;

    const fetchClasses = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('classes')
          .select(`
            id,
            name,
            teacher_id,
            teacher:profiles!classes_teacher_id_fkey(first_name, last_name)
          `)
          .eq('preschool_id', preschoolId)
          .eq('is_active', true)
          .order('name');

        if (error) throw error;

        // Get student counts
        const classesWithCounts = await Promise.all(
          (data || []).map(async (cls: any) => {
            const { count } = await supabase
              .from('students')
              .select('id', { count: 'exact', head: true })
              .eq('class_id', cls.id);

            return {
              ...cls,
              teacher: Array.isArray(cls.teacher) ? cls.teacher[0] : cls.teacher,
              student_count: count || 0,
            };
          })
        );

        setClasses(classesWithCounts);
      } catch (err) {
        console.error('Error fetching classes:', err);
        setError('Failed to load classes');
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, [isOpen, preschoolId, groupType, supabase]);

  // Fetch parents when selecting parent group
  useEffect(() => {
    if (!isOpen || !preschoolId || groupType !== 'parent_group') return;

    const fetchParents = async () => {
      setLoading(true);
      try {
        // Get unique parent IDs from students
        const { data: students, error: studentsError } = await supabase
          .from('students')
          .select(`
            guardian_id,
            first_name,
            last_name,
            class:classes!students_class_id_fkey(name)
          `)
          .eq('preschool_id', preschoolId)
          .not('guardian_id', 'is', null);

        if (studentsError) throw studentsError;

        // Get unique parent IDs
        const parentIds = [...new Set(students?.map((s: any) => s.guardian_id).filter(Boolean))];

        if (parentIds.length === 0) {
          setParents([]);
          setLoading(false);
          return;
        }

        // Fetch parent profiles
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, avatar_url')
          .in('id', parentIds);

        if (profilesError) throw profilesError;

        // Combine with student info
        const parentsWithStudents = (profiles || []).map((parent: any) => ({
          ...parent,
          students: students
            ?.filter((s: any) => s.guardian_id === parent.id)
            .map((s: any) => ({
              first_name: s.first_name,
              last_name: s.last_name,
              class: s.class,
            })),
        }));

        setParents(parentsWithStudents);
      } catch (err) {
        console.error('Error fetching parents:', err);
        setError('Failed to load parents');
      } finally {
        setLoading(false);
      }
    };

    fetchParents();
  }, [isOpen, preschoolId, groupType, supabase]);

  // Filter parents by search
  const filteredParents = useMemo(() => {
    if (!searchQuery.trim()) return parents;
    
    const query = searchQuery.toLowerCase();
    return parents.filter((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
      const email = (p.email || '').toLowerCase();
      const studentNames = p.students?.map((s) => `${s.first_name} ${s.last_name}`.toLowerCase()).join(' ') || '';
      return name.includes(query) || email.includes(query) || studentNames.includes(query);
    });
  }, [parents, searchQuery]);

  // Handle parent selection toggle
  const toggleParentSelection = useCallback((parentId: string) => {
    setSelectedParents((prev) =>
      prev.includes(parentId)
        ? prev.filter((id) => id !== parentId)
        : [...prev, parentId]
    );
  }, []);

  // Select all filtered parents
  const selectAllFiltered = useCallback(() => {
    const filteredIds = filteredParents.map((p) => p.id);
    setSelectedParents((prev) => {
      const newSet = new Set([...prev, ...filteredIds]);
      return Array.from(newSet);
    });
  }, [filteredParents]);

  // Deselect all
  const deselectAll = useCallback(() => {
    setSelectedParents([]);
  }, []);

  // Create group
  const handleCreate = async () => {
    if (!preschoolId || !userId) {
      setError('Missing required information');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      let threadId: string;

      if (groupType === 'class_group' && selectedClass) {
        const { data, error } = await supabase.rpc('create_class_group', {
          p_class_id: selectedClass.id,
          p_preschool_id: preschoolId,
          p_created_by: userId,
          p_group_name: groupName || null,
        });

        if (error) throw error;
        threadId = data;

      } else if (groupType === 'parent_group') {
        if (!groupName.trim()) {
          setError('Please enter a group name');
          setCreating(false);
          return;
        }
        if (selectedParents.length === 0) {
          setError('Please select at least one parent');
          setCreating(false);
          return;
        }

        const { data, error } = await supabase.rpc('create_parent_group', {
          p_preschool_id: preschoolId,
          p_created_by: userId,
          p_group_name: groupName.trim(),
          p_parent_ids: selectedParents,
          p_description: groupDescription.trim() || null,
          p_allow_replies: allowReplies,
        });

        if (error) throw error;
        threadId = data;

      } else if (groupType === 'announcement') {
        if (!groupName.trim()) {
          setError('Please enter a channel name');
          setCreating(false);
          return;
        }

        const { data, error } = await supabase.rpc('create_announcement_channel', {
          p_preschool_id: preschoolId,
          p_created_by: userId,
          p_channel_name: groupName.trim(),
          p_description: groupDescription.trim() || null,
          p_audience: announcementAudience,
        });

        if (error) throw error;
        threadId = data;

      } else {
        setError('Please select a group type');
        setCreating(false);
        return;
      }

      onGroupCreated(threadId);
      onClose();
    } catch (err: any) {
      console.error('Error creating group:', err);
      setError(err.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  // Get initials
  const getInitials = (firstName: string | null, lastName: string | null) => {
    const first = firstName?.[0] || '';
    const last = lastName?.[0] || '';
    return (first + last).toUpperCase() || '?';
  };

  if (!isOpen) return null;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          margin: 16,
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {step !== 'type' && (
              <button
                onClick={() => setStep(step === 'members' ? 'details' : 'type')}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: 8,
                  padding: 8,
                  cursor: 'pointer',
                  display: 'flex',
                }}
              >
                <ChevronLeft size={18} color="rgba(255,255,255,0.7)" />
              </button>
            )}
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'white' }}>
              {step === 'type' && 'Create Group'}
              {step === 'details' && (groupType === 'class_group' ? 'Select Class' : groupType === 'announcement' ? 'Announcement Channel' : 'Group Details')}
              {step === 'members' && 'Select Members'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 10,
              padding: 8,
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <X size={18} color="rgba(255,255,255,0.7)" />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {/* Step 1: Select Type */}
          {step === 'type' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Class Group Option */}
              {canCreateClassGroup && (
                <button
                  onClick={() => { setGroupType('class_group'); setStep('details'); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '18px 20px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: 16,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <GraduationCap size={24} color="white" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'white' }}>
                      Class Group
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                      Create a group for all parents in a class
                    </div>
                  </div>
                  <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
                </button>
              )}

              {/* Parent Group Option */}
              {canCreateParentGroup && (
                <button
                  onClick={() => { setGroupType('parent_group'); setStep('details'); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '18px 20px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: 16,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Users size={24} color="white" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'white' }}>
                      Parent Group
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                      Create a custom group with selected parents
                    </div>
                  </div>
                  <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
                </button>
              )}

              {/* Announcement Channel Option */}
              {canCreateAnnouncement && (
                <button
                  onClick={() => { setGroupType('announcement'); setStep('details'); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '18px 20px',
                    background: 'rgba(168, 85, 247, 0.1)',
                    border: '1px solid rgba(168, 85, 247, 0.2)',
                    borderRadius: 16,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.2)';
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Megaphone size={24} color="white" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'white' }}>
                      Announcement Channel
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                      One-way broadcast to parents, teachers, or all
                    </div>
                  </div>
                  <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
                </button>
              )}

              {/* Info */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 16,
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 12,
                  marginTop: 8,
                }}
              >
                <Info size={18} color="rgba(255,255,255,0.4)" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  Groups allow you to message multiple parents at once. Class groups automatically include all parents of students in that class.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 'details' && groupType === 'class_group' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      border: '3px solid rgba(255,255,255,0.1)',
                      borderTopColor: '#3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : classes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
                  No classes found
                </div>
              ) : (
                classes.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => {
                      setSelectedClass(cls);
                      setGroupName(cls.name + ' Parents');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '16px 18px',
                      background: selectedClass?.id === cls.id
                        ? 'rgba(59, 130, 246, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                      border: selectedClass?.id === cls.id
                        ? '1px solid rgba(59, 130, 246, 0.4)'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 14,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontWeight: 700,
                        color: 'white',
                      }}
                    >
                      {cls.name[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>
                        {cls.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                        {cls.teacher ? `${cls.teacher.first_name} ${cls.teacher.last_name}` : 'No teacher assigned'} • {cls.student_count} students
                      </div>
                    </div>
                    {selectedClass?.id === cls.id && (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          background: '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={14} color="white" />
                      </div>
                    )}
                  </button>
                ))
              )}
              
              {/* Custom name input */}
              {selectedClass && (
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                    Group Name (optional)
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={selectedClass.name + ' Parents'}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 12,
                      fontSize: 15,
                      color: 'white',
                      outline: 'none',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 2: Details for Parent Group */}
          {step === 'details' && groupType === 'parent_group' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                  Group Name *
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., School Trip Committee"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    fontSize: 15,
                    color: 'white',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                  Description (optional)
                </label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Describe the purpose of this group..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    fontSize: 15,
                    color: 'white',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 12,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allowReplies}
                    onChange={(e) => setAllowReplies(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>
                      Allow parents to reply
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                      When disabled, only you can send messages
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Details for Announcement */}
          {step === 'details' && groupType === 'announcement' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                  Channel Name *
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., School Announcements"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    fontSize: 15,
                    color: 'white',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                  Description (optional)
                </label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Describe what this channel is for..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    fontSize: 15,
                    color: 'white',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                  Audience *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { id: 'all_parents', label: 'All Parents', desc: 'Parents of all students' },
                    { id: 'all_teachers', label: 'All Teachers', desc: 'Teaching staff only' },
                    { id: 'all_staff', label: 'All Staff', desc: 'Teachers and admins' },
                    { id: 'everyone', label: 'Everyone', desc: 'All parents and staff' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setAnnouncementAudience(option.id as typeof announcementAudience)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: announcementAudience === option.id
                          ? 'rgba(168, 85, 247, 0.2)'
                          : 'rgba(255, 255, 255, 0.05)',
                        border: announcementAudience === option.id
                          ? '1px solid rgba(168, 85, 247, 0.4)'
                          : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>
                          {option.label}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                          {option.desc}
                        </div>
                      </div>
                      {announcementAudience === option.id && (
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            background: '#a855f7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Check size={12} color="white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 14,
                  background: 'rgba(168, 85, 247, 0.1)',
                  borderRadius: 12,
                }}
              >
                <Info size={16} color="#a855f7" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                  Announcement channels are one-way. Only principals and admins can send messages. Recipients can read but not reply.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Select Members (Parent Group only) */}
          {step === 'members' && groupType === 'parent_group' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Search */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <Search size={18} color="rgba(255,255,255,0.4)" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search parents..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    fontSize: 15,
                    color: 'white',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Selection actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={selectAllFiltered}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: 10,
                    color: '#22c55e',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Select All ({filteredParents.length})
                </button>
                <button
                  onClick={deselectAll}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 10,
                    color: '#ef4444',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Deselect All
                </button>
              </div>

              {/* Selected count */}
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                {selectedParents.length} parent{selectedParents.length !== 1 ? 's' : ''} selected
              </div>

              {/* Parents list */}
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      border: '3px solid rgba(255,255,255,0.1)',
                      borderTopColor: '#22c55e',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                </div>
              ) : filteredParents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
                  {searchQuery ? 'No parents found' : 'No parents registered'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflow: 'auto' }}>
                  {filteredParents.map((parent) => {
                    const isSelected = selectedParents.includes(parent.id);
                    return (
                      <button
                        key={parent.id}
                        onClick={() => toggleParentSelection(parent.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          background: isSelected
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected
                            ? '1px solid rgba(34, 197, 94, 0.3)'
                            : '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: 12,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'white',
                          }}
                        >
                          {getInitials(parent.first_name, parent.last_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>
                            {parent.first_name} {parent.last_name}
                          </div>
                          {parent.students && parent.students.length > 0 && (
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              Parent of: {parent.students.map((s) => s.first_name).join(', ')}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: isSelected ? 'none' : '2px solid rgba(255,255,255,0.2)',
                            background: isSelected ? '#22c55e' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isSelected && <Check size={14} color="white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              margin: '0 24px 16px',
              padding: 12,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 10,
              color: '#ef4444',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: '16px 24px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {step === 'type' ? (
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '14px 20px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          ) : step === 'details' ? (
            <>
              {groupType === 'parent_group' ? (
                <button
                  onClick={() => {
                    if (!groupName.trim()) {
                      setError('Please enter a group name');
                      return;
                    }
                    setError(null);
                    setStep('members');
                  }}
                  disabled={!groupName.trim()}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    background: groupName.trim()
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'white',
                    cursor: groupName.trim() ? 'pointer' : 'not-allowed',
                    opacity: groupName.trim() ? 1 : 0.5,
                  }}
                >
                  Next: Select Members
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={creating || (groupType === 'class_group' && !selectedClass) || (groupType !== 'class_group' && !groupName.trim())}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    background: groupType === 'class_group'
                      ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)'
                      : 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'white',
                    cursor: 'pointer',
                    opacity: creating ? 0.7 : 1,
                  }}
                >
                  {creating ? 'Creating...' : 'Create Group'}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating || selectedParents.length === 0}
              style={{
                flex: 1,
                padding: '14px 20px',
                background: selectedParents.length > 0
                  ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                  : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                color: 'white',
                cursor: selectedParents.length > 0 ? 'pointer' : 'not-allowed',
                opacity: selectedParents.length > 0 && !creating ? 1 : 0.5,
              }}
            >
              {creating ? 'Creating...' : `Create Group (${selectedParents.length} members)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
