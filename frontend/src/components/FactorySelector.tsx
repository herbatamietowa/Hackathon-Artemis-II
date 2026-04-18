interface Props {
  factories: string[];
  value: string;
  onChange: (v: string) => void;
}

export function FactorySelector({ factories, value, onChange }: Props) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>FACTORY</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
        {factories.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
    </label>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#fff',
  fontSize: 14,
  cursor: 'pointer',
};
