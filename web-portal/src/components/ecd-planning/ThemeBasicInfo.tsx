import type { AcademicTerm } from '@/types/ecd-planning';

interface ThemeBasicInfoProps {
  formData: {
    title: string;
    description: string;
    term_id: string;
    week_number: string;
    start_date: string;
    end_date: string;
  };
  terms: AcademicTerm[];
  onChange: (updates: Partial<ThemeBasicInfoProps['formData']>) => void;
}

export function ThemeBasicInfo({ formData, terms, onChange }: ThemeBasicInfoProps) {
  return (
    <>
      <div>
        <label className="label">Theme Title *</label>
        <input
          type="text"
          className="input"
          value={formData.title}
          onChange={(e) => onChange({ title: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          className="input"
          value={formData.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label className="label">Term</label>
          <select
            className="input"
            value={formData.term_id}
            onChange={(e) => onChange({ term_id: e.target.value })}
          >
            <option value="">Select Term</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name} ({term.academic_year})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Week Number</label>
          <input
            type="number"
            className="input"
            value={formData.week_number}
            onChange={(e) => onChange({ week_number: e.target.value })}
            min="1"
            max="52"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label className="label">Start Date</label>
          <input
            type="date"
            className="input"
            value={formData.start_date}
            onChange={(e) => onChange({ start_date: e.target.value })}
          />
        </div>
        <div>
          <label className="label">End Date</label>
          <input
            type="date"
            className="input"
            value={formData.end_date}
            onChange={(e) => onChange({ end_date: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}
