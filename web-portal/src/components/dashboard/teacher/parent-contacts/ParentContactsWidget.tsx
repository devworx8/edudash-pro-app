'use client';

/**
 * Parent Contacts Widget - Refactored
 * Main container component for parent contacts
 * Original: 460 lines → Refactored: ~150 lines
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Users, Search } from 'lucide-react';
import { useParentContacts } from '@/lib/hooks/teacher/useParentContacts';
import { ParentContactCard } from './ParentContactCard';
import type { ParentContactsWidgetProps, Parent, Student } from './types';

export function ParentContactsWidget({ preschoolId, teacherId, classIds }: ParentContactsWidgetProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const { parents, loading, error, refetch } = useParentContacts(preschoolId, teacherId, classIds);

  const filteredParents = useMemo(() => {
    if (!searchQuery) return parents;
    const query = searchQuery.toLowerCase();
    return parents.filter(parent => {
      const parentName = `${parent.first_name} ${parent.last_name}`.toLowerCase();
      const studentNames = parent.students.map(s => `${s.first_name} ${s.last_name}`.toLowerCase()).join(' ');
      return parentName.includes(query) || studentNames.includes(query) || parent.email.toLowerCase().includes(query);
    });
  }, [parents, searchQuery]);

  const handleMessageParent = async (parent: Parent, student: Student) => {
    if (!teacherId || !preschoolId) return;
    const supabase = createClient();

    try {
      const { data: allThreads } = await supabase
        .from('message_threads')
        .select('id, message_participants!inner(user_id, role)')
        .eq('preschool_id', preschoolId)
        .eq('type', 'parent-teacher');

      let threadId: string | null = null;
      if (allThreads && allThreads.length > 0) {
        const matchingThread = allThreads.find((thread: any) => {
          const participants = thread.message_participants || [];
          return participants.some((p: any) => p.user_id === parent.id && p.role === 'parent') &&
                 participants.some((p: any) => p.user_id === teacherId && p.role === 'teacher');
        });
        if (matchingThread) threadId = matchingThread.id;
      }

      if (!threadId) {
        const { data: newThread, error: threadError } = await supabase
          .from('message_threads')
          .insert({
            preschool_id: preschoolId,
            type: 'parent-teacher',
            subject: `Regarding ${student.first_name} ${student.last_name}`,
            student_id: student.id,
            created_by: teacherId,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (threadError) throw threadError;
        threadId = newThread.id;

        await supabase.from('message_participants').insert([
          { thread_id: threadId, user_id: teacherId, role: 'teacher', last_read_at: new Date().toISOString() },
          { thread_id: threadId, user_id: parent.id, role: 'parent', last_read_at: new Date().toISOString() },
        ]);
      }

      router.push(`/dashboard/teacher/messages?thread=${threadId}`);
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') console.error('Error creating/finding thread:', err);
      alert('Failed to open message thread. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Users size={24} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Parent Contacts</h3>
        </div>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Users size={24} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Parent Contacts</h3>
        </div>
        <p style={{ color: 'var(--danger)', textAlign: 'center', padding: '20px 0' }}>Failed to load parent contacts</p>
        <button className="btn btnSecondary" style={{ width: '100%' }} onClick={refetch}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users size={24} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Parent Contacts</h3>
        </div>
        <span style={{ background: 'var(--primary-subtle)', color: 'var(--primary)', padding: '4px 12px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
          {filteredParents.length}
        </span>
      </div>
      
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search parents or students..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px 10px 40px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface-1)',
            color: 'var(--text-primary)', fontSize: 14, outline: 'none',
          }}
        />
        <Search size={18} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
      </div>
      
      {filteredParents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Users size={48} color="var(--muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>
            {searchQuery ? 'No matching parents found' : 'No parent contacts yet'}
          </p>
          {!searchQuery && (
            <p style={{ color: 'var(--muted-light)', fontSize: 12 }}>
              {!classIds ? 'You need to be assigned to classes, or students need to be enrolled in your classes' : 'No students in these classes'}
            </p>
          )}
        </div>
      ) : (
        <div style={{ maxHeight: 500, overflowY: 'auto', marginTop: 8 }}>
          {filteredParents.map((parent) => (
            <ParentContactCard key={parent.id} parent={parent} onMessageStudent={handleMessageParent} />
          ))}
        </div>
      )}
    </div>
  );
}
