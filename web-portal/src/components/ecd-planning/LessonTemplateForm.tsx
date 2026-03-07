import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { LessonTemplate } from '@/types/ecd-planning';

interface LessonTemplateFormProps {
  template?: LessonTemplate | null;
  onSubmit: (template: Partial<LessonTemplate>) => Promise<void>;
  onCancel: () => void;
}

export function LessonTemplateForm({ template, onSubmit, onCancel }: LessonTemplateFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    default_duration_minutes: 30,
    default_age_group: '3-6',
    default_subject: '',
    sections: [
      { name: 'Learning Objectives', required: true },
      { name: 'Materials Needed', required: true },
      { name: 'Introduction', required: true },
      { name: 'Main Activity', required: true },
      { name: 'Conclusion', required: true },
    ] as Array<{ name: string; required: boolean }>,
    is_default: false,
  });

  const [newSectionName, setNewSectionName] = useState('');

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        default_duration_minutes: template.default_duration_minutes,
        default_age_group: template.default_age_group,
        default_subject: template.default_subject || '',
        sections: template.template_structure.sections,
        is_default: template.is_default,
      });
    }
  }, [template]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      ...formData,
      template_structure: { sections: formData.sections },
    });
  };

  const addSection = () => {
    if (newSectionName.trim()) {
      setFormData({
        ...formData,
        sections: [...formData.sections, { name: newSectionName.trim(), required: false }],
      });
      setNewSectionName('');
    }
  };

  const removeSection = (index: number) => {
    setFormData({
      ...formData,
      sections: formData.sections.filter((_, i) => i !== index),
    });
  };

  const toggleRequired = (index: number) => {
    const updated = [...formData.sections];
    updated[index].required = !updated[index].required;
    setFormData({ ...formData, sections: updated });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div className="card" style={{ maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0 }}>{template ? 'Edit Template' : 'Create Lesson Template'}</h2>
          <button className="iconBtn" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: 20 }}>
            <div>
              <label className="label">Template Name *</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="label">Description</label>
              <textarea
                className="input"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label className="label">Default Duration (minutes)</label>
                <input
                  type="number"
                  className="input"
                  value={formData.default_duration_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, default_duration_minutes: Number(e.target.value) })
                  }
                  min="5"
                  max="120"
                />
              </div>
              <div>
                <label className="label">Default Age Group</label>
                <select
                  className="input"
                  value={formData.default_age_group}
                  onChange={(e) => setFormData({ ...formData, default_age_group: e.target.value })}
                >
                  <option value="1-2">1-2 years</option>
                  <option value="3-4">3-4 years</option>
                  <option value="4-5">4-5 years</option>
                  <option value="5-6">5-6 years</option>
                  <option value="3-6">3-6 years</option>
                </select>
              </div>
              <div>
                <label className="label">Default Subject</label>
                <input
                  type="text"
                  className="input"
                  value={formData.default_subject}
                  onChange={(e) => setFormData({ ...formData, default_subject: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="label">Template Sections</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  className="input"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSection();
                    }
                  }}
                  placeholder="Add section name..."
                />
                <button type="button" className="btn btnSecondary" onClick={addSection}>
                  <Plus size={18} /> Add
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {formData.sections.map((section, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      background: 'var(--bg-secondary)',
                      borderRadius: 8,
                    }}
                  >
                    <input
                      type="text"
                      className="input"
                      value={section.name}
                      onChange={(e) => {
                        const updated = [...formData.sections];
                        updated[idx].name = e.target.value;
                        setFormData({ ...formData, sections: updated });
                      }}
                      style={{ flex: 1 }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={section.required}
                        onChange={() => toggleRequired(idx)}
                      />
                      <span style={{ fontSize: 14 }}>Required</span>
                    </label>
                    <button
                      type="button"
                      className="iconBtn"
                      onClick={() => removeSection(idx)}
                      disabled={formData.sections.length <= 1}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                />
                <span>Set as Default Template</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btnSecondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btnPrimary">
                {template ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
