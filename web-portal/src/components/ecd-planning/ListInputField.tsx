import { X } from 'lucide-react';

interface ListInputFieldProps {
  label: string;
  items: string[];
  newItem: string;
  onNewItemChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  placeholder?: string;
}

export function ListInputField({
  label,
  items,
  newItem,
  onNewItemChange,
  onAdd,
  onRemove,
  placeholder,
}: ListInputFieldProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          className="input"
          value={newItem}
          onChange={(e) => onNewItemChange(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder || `Add ${label.toLowerCase()}...`}
        />
        <button type="button" className="btn btnSecondary" onClick={onAdd}>
          Add
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}>{item}</span>
            <button type="button" className="iconBtn" onClick={() => onRemove(idx)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
