'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { FileText, Plus } from 'lucide-react';
import { useLessonTemplates } from '@/hooks/principal/useLessonTemplates';
import { LessonTemplateCard } from '@/components/ecd-planning/LessonTemplateCard';
import { LessonTemplateForm } from '@/components/ecd-planning/LessonTemplateForm';
import type { LessonTemplate } from '@/types/ecd-planning';

export default function LessonTemplatesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LessonTemplate | null>(null);

  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const { templates, loading: templatesLoading, createTemplate, updateTemplate, deleteTemplate, refetch } =
    useLessonTemplates(preschoolId);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  const handleSubmit = async (templateData: Partial<LessonTemplate>) => {
    try {
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, templateData);
      } else {
        await createTemplate({ ...templateData, created_by: userId! });
      }
      setShowCreateModal(false);
      setEditingTemplate(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await deleteTemplate(id);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const { error } = await supabase.rpc('set_default_lesson_template', { p_template_id: id });
      if (error) throw error;
      await refetch();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <PrincipalShell>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p>Loading...</p>
        </div>
      </PrincipalShell>
    );
  }

  return (
    <PrincipalShell>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 className="h1">Lesson Templates</h1>
            <p className="text-muted">Create reusable lesson planning templates for teachers</p>
          </div>
          <button
            className="btn btnPrimary"
            onClick={() => {
              setEditingTemplate(null);
              setShowCreateModal(true);
            }}
          >
            <Plus size={18} /> New Template
          </button>
        </div>

        {templatesLoading ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <p>Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <FileText size={48} style={{ color: 'var(--muted)', marginBottom: 16 }} />
            <h3 style={{ marginBottom: 8 }}>No Templates Created</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              Create lesson templates to help teachers plan consistently
            </p>
            <button className="btn btnPrimary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} /> Create First Template
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {templates.map((template) => (
              <LessonTemplateCard
                key={template.id}
                template={template}
                onEdit={(t) => {
                  setEditingTemplate(t);
                  setShowCreateModal(true);
                }}
                onDelete={handleDelete}
                onSetDefault={handleSetDefault}
              />
            ))}
          </div>
        )}

        {showCreateModal && (
          <LessonTemplateForm
            template={editingTemplate}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowCreateModal(false);
              setEditingTemplate(null);
            }}
          />
        )}
      </div>
    </PrincipalShell>
  );
}
