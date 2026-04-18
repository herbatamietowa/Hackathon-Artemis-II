import type { ReallocationSuggestion } from '../types';

interface Props {
  reallocation: ReallocationSuggestion;
  onApply?: () => void;
  applied?: boolean;
}

function Metric({ label, value, sub, valueColor }: {
  label: string; value: string; sub?: string; valueColor?: string;
}) {
  return (
    <div style={{ textAlign: 'center', minWidth: 80 }}>
      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: valueColor ?? '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

function IntensityBar({ source, target, sourceLabel, targetLabel }: {
  source: number; target: number; sourceLabel: string; targetLabel: string;
}) {
  const max = Math.max(source, target, 0.8);
  const srcPct  = source / max * 100;
  const tgtPct  = target / max * 100;
  const tgtColor = target > source ? '#f97316' : '#22c55e';
  return (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Grid intensity (gCO₂/kWh)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[{ label: sourceLabel, pct: srcPct, val: source, color: '#6b7280' },
          { label: targetLabel, pct: tgtPct, val: target, color: tgtColor }].map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10, color: '#6b7280', width: 36, textAlign: 'right', flexShrink: 0 }}>{row.label}</div>
            <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${row.pct}%`, height: '100%', background: row.color, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: row.color, width: 28 }}>{row.val.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReallocationBanner({ reallocation: r, onApply, applied }: Props) {
  const canAbsorb = r.can_absorb;
  const bg     = canAbsorb ? '#f0fdf4' : '#fffbeb';
  const border = canAbsorb ? '#86efac' : '#fde68a';
  const titleColor = canAbsorb ? '#166534' : '#92400e';
  const textColor  = canAbsorb ? '#14532d' : '#78350f';

  const absorptionPct = r.overflow_hours > 0
    ? Math.min(100, Math.round(r.available_headroom_hours / r.overflow_hours * 100))
    : 100;

  const costColor = r.cost_delta_pct > 10 ? '#ef4444' : r.cost_delta_pct < -5 ? '#22c55e' : '#f59e0b';
  const carbonColor = r.carbon_delta_pct > 5 ? '#f97316' : r.carbon_delta_pct < -5 ? '#22c55e' : '#6b7280';

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '14px 16px' }}>
      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{canAbsorb ? '↗' : '⚠'}</span>
          <span style={{ fontWeight: 700, color: titleColor, fontSize: 14 }}>
            NW03 Reallocation — {canAbsorb ? 'Feasible' : 'Partially Feasible'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: titleColor,
            background: border, borderRadius: 4, padding: '2px 8px',
          }}>
            {absorptionPct}% capacity absorbable
          </span>
          {onApply && !applied && (
            <button onClick={onApply} style={{
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: canAbsorb ? '#16a34a' : '#d97706',
              color: '#fff', border: 'none', borderRadius: 5,
              padding: '4px 12px',
            }}>
              Apply Reallocation
            </button>
          )}
          {applied && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', borderRadius: 4, padding: '2px 8px' }}>
              ✓ Applied
            </span>
          )}
        </div>
      </div>

      {/* Absorption bar */}
      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{
          width: `${absorptionPct}%`, height: '100%', borderRadius: 3,
          background: canAbsorb ? '#22c55e' : '#f59e0b',
        }} />
      </div>

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 10 }}>
        <Metric
          label="Headroom"
          value={`${r.available_headroom_hours.toFixed(0)}h`}
          sub={`need ${r.overflow_hours.toFixed(0)}h`}
          valueColor={textColor}
        />
        <Metric
          label="Tooling match"
          value={`${r.material_compatibility_pct.toFixed(0)}%`}
          sub={`${r.compatible_materials}/${r.total_materials} materials`}
          valueColor={r.material_compatibility_pct < 30 ? '#ef4444' : r.material_compatibility_pct < 60 ? '#f59e0b' : '#22c55e'}
        />
        <Metric
          label="Cost delta"
          value={`${r.cost_delta_pct > 0 ? '+' : ''}${r.cost_delta_pct.toFixed(0)}%`}
          sub="median, compatible mats"
          valueColor={costColor}
        />
        <Metric
          label="Extra lead time"
          value={`${r.transport_lt_delta_days > 0 ? '+' : ''}${r.transport_lt_delta_days.toFixed(1)}d`}
          sub="transport LT delta"
          valueColor={r.transport_lt_delta_days > 3 ? '#f59e0b' : '#6b7280'}
        />
        <IntensityBar
          source={r.source_grid_intensity}
          target={r.target_grid_intensity}
          sourceLabel="Here"
          targetLabel="NW03"
        />
        <Metric
          label="Carbon impact"
          value={`${r.carbon_delta_pct > 0 ? '+' : ''}${r.carbon_delta_pct.toFixed(0)}%`}
          sub={r.carbon_delta_pct > 0 ? 'higher at NW03' : 'lower at NW03'}
          valueColor={carbonColor}
        />
      </div>

      {/* Warning if NW03 is higher carbon */}
      {r.carbon_delta_pct > 5 && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '6px 10px' }}>
          Note: NW03 (Carpathia) operates on a higher-carbon grid than this factory. Reallocation increases capacity but raises CO₂ intensity.
        </p>
      )}
    </div>
  );
}
