import { FileText, Edit, Trash2, Star, Clock, Users } from 'lucide-react';
import type { LessonTemplate } from '@/types/ecd-planning';

interface LessonTemplateCardProps {
  template: LessonTemplate;
  onEdit: (template: LessonTemplate) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

export function LessonTemplateCard({
  template,
  onEdit,
  onDelete,
  onSetDefault,
}: LessonTemplateCardProps) {
  return (
    <div
      className="card"
      style={{
        padding: 20,
        border: template.is_default ? '2px solid var(--primary)' : '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <FileText size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: 18 }}>{template.name}</h3>
            {template.is_default && (
              <span className="badge" style={{ background: 'var(--primary)', color: 'white' }}>
                <Star size={12} style={{ marginRight: 4 }} />
                Default
              </span>
            )}
          </div>
          {template.description && (
            <p style={{ color: 'var(--muted)', marginBottom: 12 }}>{template.description}</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14 }}>
            <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={14} />
              {template.default_duration_minutes} min
            </span>
            <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Users size={14} />
              {template.default_age_group} years
            </span>
            <span style={{ color: 'var(--muted)' }}>
              {template.template_structure.sections.length} sections
            </span>
            <span style={{ color: 'var(--muted)' }}>
              Used {template.usage_count} times
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Sections:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {template.template_structure.sections.map((section, idx) => (
                <span
                  key={idx}
                  className="badge"
                  style={{
                    background: section.required ? 'var(--primary)' : 'var(--muted)',
                    color: 'white',
                    fontSize: 12,
                  }}
                >
                  {section.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!template.is_default && (
            <button
              className="iconBtn"
              onClick={() => onSetDefault(template.id)}
              title="Set as Default"
            >
              <Star size={18} />
            </button>
          )}
          <button className="iconBtn" onClick={() => onEdit(template)} title="Edit">
            <Edit size={18} />
          </button>
          <button className="iconBtn" onClick={() => onDelete(template.id)} title="Delete">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
