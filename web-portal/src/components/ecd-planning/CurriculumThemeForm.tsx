import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { CurriculumTheme, AcademicTerm } from '@/types/ecd-planning';
import { ListInputField } from './ListInputField';
import { ThemeBasicInfo } from './ThemeBasicInfo';
import { ThemeECDFields } from './ThemeECDFields';

interface CurriculumThemeFormProps {
  theme?: CurriculumTheme | null;
  terms: AcademicTerm[];
  onSubmit: (theme: Partial<CurriculumTheme>) => Promise<void>;
  onCancel: () => void;
}

export function CurriculumThemeForm({ theme, terms, onSubmit, onCancel }: CurriculumThemeFormProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    term_id: '',
    week_number: '',
    start_date: '',
    end_date: '',
    learning_objectives: [] as string[],
    key_concepts: [] as string[],
    vocabulary_words: [] as string[],
    suggested_activities: [] as string[],
    materials_needed: [] as string[],
    developmental_domains: [] as string[],
    age_groups: ['3-6'] as string[],
    is_published: false,
    is_template: false,
  });

  const [newObjective, setNewObjective] = useState('');
  const [newConcept, setNewConcept] = useState('');
  const [newVocabulary, setNewVocabulary] = useState('');
  const [newActivity, setNewActivity] = useState('');
  const [newMaterial, setNewMaterial] = useState('');

  useEffect(() => {
    if (theme) {
      setFormData({
        title: theme.title,
        description: theme.description || '',
        term_id: theme.term_id || '',
        week_number: theme.week_number?.toString() || '',
        start_date: theme.start_date || '',
        end_date: theme.end_date || '',
        learning_objectives: theme.learning_objectives || [],
        key_concepts: theme.key_concepts || [],
        vocabulary_words: theme.vocabulary_words || [],
        suggested_activities: theme.suggested_activities || [],
        materials_needed: theme.materials_needed || [],
        developmental_domains: theme.developmental_domains || [],
        age_groups: theme.age_groups || ['3-6'],
        is_published: theme.is_published,
        is_template: theme.is_template,
      });
    }
  }, [theme]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      ...formData,
      week_number: formData.week_number ? Number(formData.week_number) : undefined,
    });
  };

  const addToList = (list: string[], newItem: string, setList: (items: string[]) => void, setInput: (value: string) => void) => {
    if (newItem.trim()) {
      setList([...list, newItem.trim()]);
      setInput('');
    }
  };

  const removeFromList = (list: string[], index: number, setList: (items: string[]) => void) => {
    setList(list.filter((_, i) => i !== index));
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
      <div className="card" style={{ maxWidth: 800, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0 }}>{theme ? 'Edit Theme' : 'Create Curriculum Theme'}</h2>
          <button className="iconBtn" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: 20 }}>
            <ThemeBasicInfo
              formData={{
                title: formData.title,
                description: formData.description,
                term_id: formData.term_id,
                week_number: formData.week_number,
                start_date: formData.start_date,
                end_date: formData.end_date,
              }}
              terms={terms}
              onChange={(updates) => setFormData({ ...formData, ...updates })}
            />

            <ThemeECDFields
              ageGroups={formData.age_groups}
              developmentalDomains={formData.developmental_domains}
              onAgeGroupsChange={(groups) => setFormData({ ...formData, age_groups: groups })}
              onDomainsChange={(domains) => setFormData({ ...formData, developmental_domains: domains })}
            />

            <ListInputField
              label="Learning Objectives"
              items={formData.learning_objectives}
              newItem={newObjective}
              onNewItemChange={setNewObjective}
              onAdd={() =>
                addToList(
                  formData.learning_objectives,
                  newObjective,
                  (items) => setFormData({ ...formData, learning_objectives: items }),
                  setNewObjective
                )
              }
              onRemove={(idx) =>
                removeFromList(
                  formData.learning_objectives,
                  idx,
                  (items) => setFormData({ ...formData, learning_objectives: items })
                )
              }
              placeholder="Add learning objective..."
            />

            <ListInputField
              label="Key Concepts"
              items={formData.key_concepts}
              newItem={newConcept}
              onNewItemChange={setNewConcept}
              onAdd={() =>
                addToList(
                  formData.key_concepts,
                  newConcept,
                  (items) => setFormData({ ...formData, key_concepts: items }),
                  setNewConcept
                )
              }
              onRemove={(idx) =>
                removeFromList(
                  formData.key_concepts,
                  idx,
                  (items) => setFormData({ ...formData, key_concepts: items })
                )
              }
              placeholder="Add key concept..."
            />

            <ListInputField
              label="Suggested Activities"
              items={formData.suggested_activities}
              newItem={newActivity}
              onNewItemChange={setNewActivity}
              onAdd={() =>
                addToList(
                  formData.suggested_activities,
                  newActivity,
                  (items) => setFormData({ ...formData, suggested_activities: items }),
                  setNewActivity
                )
              }
              onRemove={(idx) =>
                removeFromList(
                  formData.suggested_activities,
                  idx,
                  (items) => setFormData({ ...formData, suggested_activities: items })
                )
              }
              placeholder="Add activity..."
            />

            <ListInputField
              label="Materials Needed"
              items={formData.materials_needed}
              newItem={newMaterial}
              onNewItemChange={setNewMaterial}
              onAdd={() =>
                addToList(
                  formData.materials_needed,
                  newMaterial,
                  (items) => setFormData({ ...formData, materials_needed: items }),
                  setNewMaterial
                )
              }
              onRemove={(idx) =>
                removeFromList(
                  formData.materials_needed,
                  idx,
                  (items) => setFormData({ ...formData, materials_needed: items })
                )
              }
              placeholder="Add material..."
            />

            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formData.is_template}
                  onChange={(e) => setFormData({ ...formData, is_template: e.target.checked })}
                />
                <span>Save as Template</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formData.is_published}
                  onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                />
                <span>Publish to Teachers</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btnSecondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btnPrimary">
                {theme ? 'Update Theme' : 'Create Theme'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
