import { BookOpen, Edit, Trash2, CheckCircle, XCircle, Calendar } from 'lucide-react';
import type { CurriculumTheme } from '@/types/ecd-planning';

interface CurriculumThemeCardProps {
  theme: CurriculumTheme;
  onEdit: (theme: CurriculumTheme) => void;
  onDelete: (id: string) => void;
  onTogglePublish: (theme: CurriculumTheme) => void;
}

export function CurriculumThemeCard({
  theme,
  onEdit,
  onDelete,
  onTogglePublish,
}: CurriculumThemeCardProps) {
  return (
    <div
      className="card"
      style={{
        padding: 20,
        border: theme.is_published ? '2px solid #10b981' : '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <BookOpen size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: 18 }}>{theme.title}</h3>
            {theme.is_published && (
              <span className="badge" style={{ background: '#10b981', color: 'white' }}>
                Published
              </span>
            )}
            {theme.is_template && (
              <span className="badge" style={{ background: '#8b5cf6', color: 'white' }}>
                Template
              </span>
            )}
          </div>
          {theme.description && (
            <p style={{ color: 'var(--muted)', marginBottom: 12 }}>{theme.description}</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 14 }}>
            {theme.term_id && (
              <span style={{ color: 'var(--muted)' }}>
                <Calendar size={14} style={{ display: 'inline', marginRight: 4 }} />
                Week {theme.week_number}
              </span>
            )}
            {theme.age_groups.length > 0 && (
              <span style={{ color: 'var(--muted)' }}>
                Ages: {theme.age_groups.join(', ')}
              </span>
            )}
            {theme.developmental_domains.length > 0 && (
              <span style={{ color: 'var(--muted)' }}>
                Domains: {theme.developmental_domains.join(', ')}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="iconBtn"
            onClick={() => onTogglePublish(theme)}
            title={theme.is_published ? 'Unpublish' : 'Publish'}
          >
            {theme.is_published ? <CheckCircle size={18} /> : <XCircle size={18} />}
          </button>
          <button className="iconBtn" onClick={() => onEdit(theme)} title="Edit">
            <Edit size={18} />
          </button>
          <button className="iconBtn" onClick={() => onDelete(theme.id)} title="Delete">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
