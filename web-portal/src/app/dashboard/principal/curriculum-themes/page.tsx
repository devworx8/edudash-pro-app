'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { BookOpen, Plus } from 'lucide-react';
import { useCurriculumThemes } from '@/hooks/principal/useCurriculumThemes';
import { CurriculumThemeCard } from '@/components/ecd-planning/CurriculumThemeCard';
import { CurriculumThemeForm } from '@/components/ecd-planning/CurriculumThemeForm';
import type { CurriculumTheme, AcademicTerm } from '@/types/ecd-planning';

export default function CurriculumThemesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CurriculumTheme | null>(null);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);

  const { profile } = useUserProfile(userId);
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const { themes, loading: themesLoading, createTheme, updateTheme, deleteTheme } = useCurriculumThemes(preschoolId);

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

  useEffect(() => {
    if (preschoolId) {
      loadTerms();
    }
  }, [preschoolId]);

  const loadTerms = async () => {
    if (!preschoolId) return;
    try {
      const { data, error } = await supabase
        .from('academic_terms')
        .select('*')
        .eq('preschool_id', preschoolId)
        .order('academic_year', { ascending: false });
      if (error) throw error;
      setTerms(data || []);
    } catch (err) {
      console.error('Error loading terms:', err);
    }
  };

  const handleSubmit = async (themeData: Partial<CurriculumTheme>) => {
    try {
      if (editingTheme) {
        await updateTheme(editingTheme.id, themeData);
      } else {
        await createTheme({ ...themeData, created_by: userId! });
      }
      setShowCreateModal(false);
      setEditingTheme(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this theme?')) return;
    try {
      await deleteTheme(id);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleTogglePublish = async (theme: CurriculumTheme) => {
    try {
      await updateTheme(theme.id, { is_published: !theme.is_published });
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
            <h1 className="h1">Curriculum Themes</h1>
            <p className="text-muted">Plan thematic units and learning objectives for the year</p>
          </div>
          <button
            className="btn btnPrimary"
            onClick={() => {
              setEditingTheme(null);
              setShowCreateModal(true);
            }}
          >
            <Plus size={18} /> New Theme
          </button>
        </div>

        {themesLoading ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <p>Loading themes...</p>
          </div>
        ) : themes.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <BookOpen size={48} style={{ color: 'var(--muted)', marginBottom: 16 }} />
            <h3 style={{ marginBottom: 8 }}>No Themes Created</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              Start by creating your first curriculum theme
            </p>
            <button className="btn btnPrimary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} /> Create First Theme
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {themes.map((theme) => (
              <CurriculumThemeCard
                key={theme.id}
                theme={theme}
                onEdit={(t) => {
                  setEditingTheme(t);
                  setShowCreateModal(true);
                }}
                onDelete={handleDelete}
                onTogglePublish={handleTogglePublish}
              />
            ))}
          </div>
        )}

        {showCreateModal && (
          <CurriculumThemeForm
            theme={editingTheme}
            terms={terms}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowCreateModal(false);
              setEditingTheme(null);
            }}
          />
        )}
      </div>
    </PrincipalShell>
  );
}
