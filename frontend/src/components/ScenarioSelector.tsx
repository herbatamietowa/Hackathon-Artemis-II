import { useEffect, useRef, useState } from 'react';

interface Props {
  scenarios: string[];
  value: string;
  onChange: (v: string) => void;
}

const SCENARIO_CONFIG: Record<string, { label: string; sub: string; dot: string; tooltip: string }> = {
  high_prob_only: {
    label: 'Guaranteed Floor',
    sub: 'Only deals >75% probability',
    dot: '#22c55e',
    tooltip: 'Use this for inventory purchasing and cash flow decisions.',
  },
  probability_weighted: {
    label: 'Realistic Forecast',
    sub: 'Weighted by deal likelihood',
    dot: '#3b82f6',
    tooltip: 'Use this for standard monthly staffing and planning.',
  },
  '100_pct': {
    label: 'Full Pipeline Stress-Test',
    sub: 'Assuming 100% win rate',
    dot: '#f59e0b',
    tooltip: 'Use this to identify future bottlenecks and capacity limits.',
  },
};

export function ScenarioSelector({ scenarios, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = SCENARIO_CONFIG[value];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 230 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>
        Scenario
      </span>

      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '7px 10px', borderRadius: 6,
          border: `1px solid ${open ? '#2563eb' : '#d1d5db'}`,
          background: '#fff', display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', textAlign: 'left', outline: 'none',
          boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: current?.dot ?? '#9ca3af', flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {current?.label ?? value}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{current?.sub}</div>
        </div>
        <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, marginLeft: 4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1px solid #d1d5db', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          {scenarios.map(s => {
            const cfg = SCENARIO_CONFIG[s];
            const isSelected = s === value;
            return (
              <div
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                style={{
                  padding: '10px 12px', cursor: 'pointer',
                  background: isSelected ? '#eff6ff' : '#fff',
                  borderBottom: '1px solid #f3f4f6',
                  display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isSelected ? '#eff6ff' : '#fff'; }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: cfg?.dot ?? '#9ca3af', flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: '#111827' }}>
                    {cfg?.label ?? s}
                    {isSelected && <span style={{ fontSize: 10, color: '#3b82f6', marginLeft: 6 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{cfg?.sub}</div>
                </div>

                {/* Info icon with native tooltip */}
                <span
                  title={cfg?.tooltip}
                  onClick={e => e.stopPropagation()}
                  style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: '1.5px solid #d1d5db', color: '#9ca3af',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, cursor: 'help',
                    userSelect: 'none',
                  }}
                >
                  i
                </span>
              </div>
            );
          })}

          {/* Footer hint */}
          <div style={{ padding: '8px 12px', background: '#f9fafb', borderTop: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Hover the </span>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>i</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}> icon for usage guidance</span>
          </div>
        </div>
      )}
    </div>
  );
}
