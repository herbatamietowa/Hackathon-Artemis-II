interface Props {
  scenarios: string[];
  value: string;
  onChange: (v: string) => void;
}

const LABELS: Record<string, string> = {
  '100_pct': '100% Pipeline',
  'probability_weighted': 'Probability Weighted',
  'high_prob_only': 'High Probability Only',
};

export function ScenarioSelector({ scenarios, value, onChange }: Props) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>SCENARIO</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
        {scenarios.map(s => (
          <option key={s} value={s}>{LABELS[s] ?? s}</option>
        ))}
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
