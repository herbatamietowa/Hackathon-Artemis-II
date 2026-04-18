import type { Agent1Result } from '../types';

interface Props {
  result: Agent1Result;
}

export function BottleneckAlert({ result }: Props) {
  if (!result.bottleneck_detected) return null;

  return (
    <div style={{
      background: '#fef2f2',
      border: '1px solid #fca5a5',
      borderRadius: 8,
      padding: '12px 16px',
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 18 }}>&#9888;</span>
      <div>
        <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#991b1b', fontSize: 14 }}>
          Bottleneck Detected
        </p>
        <p style={{ margin: 0, color: '#7f1d1d', fontSize: 13 }}>
          Work centers at or above 90% threshold:{' '}
          <strong>{result.bottleneck_work_centers.join(', ')}</strong>
        </p>
        {result.reasoning && (
          <p style={{ margin: '8px 0 0', color: '#374151', fontSize: 13, fontStyle: 'italic' }}>
            {result.reasoning}
          </p>
        )}
      </div>
    </div>
  );
}
