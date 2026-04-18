import type { Agent2Verdict } from '../types';

interface Props {
  verdict: Agent2Verdict;
}

export function Agent2Panel({ verdict }: Props) {
  const approved = verdict.verdict === 'APPROVED';
  const color = approved ? '#16a34a' : '#d97706';
  const bg    = approved ? '#f0fdf4' : '#fffbeb';
  const border = approved ? '#86efac' : '#fcd34d';

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{
          background: color,
          color: '#fff',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          {verdict.verdict}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Strategic Assessment</span>
        {verdict.fallback && (
          <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>(deterministic)</span>
        )}
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151' }}>{verdict.strategy}</p>
      <div style={{ borderTop: '1px solid ' + border, paddingTop: 8 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
          <strong style={{ color: '#374151' }}>Sustainability:</strong>{' '}
          {verdict.sustainability_recommendation}
        </p>
      </div>
    </div>
  );
}
