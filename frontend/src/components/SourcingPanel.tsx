import type { SourcingResponse } from '../types';

interface Props {
  data: SourcingResponse;
  onOrder?: (code: string, name: string, qty: number, unit: string, deadline: string, estimatedCost?: number | null) => void;
}

const STATUS_CONFIG = {
  overdue:    { bg: '#fef2f2', border: '#fca5a5', badge: '#ef4444', label: 'Overdue',    icon: '🔴' },
  urgent:     { bg: '#fff7ed', border: '#fed7aa', badge: '#f97316', label: 'Urgent',     icon: '🟠' },
  order_soon: { bg: '#fefce8', border: '#fde68a', badge: '#eab308', label: 'Order Soon', icon: '🟡' },
  on_track:   { bg: '#f0fdf4', border: '#86efac', badge: '#22c55e', label: 'On Track',   icon: '🟢' },
} as const;

function SummaryPill({ count, label, icon }: { count: number; label: string; icon: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: '#f9fafb', border: '1px solid #e5e7eb',
      borderRadius: 20, padding: '4px 12px', fontSize: 13,
    }}>
      <span>{icon}</span>
      <strong>{count}</strong>
      <span style={{ color: '#6b7280' }}>{label}</span>
    </span>
  );
}

export function SourcingPanel({ data, onOrder }: Props) {
  if (data.materials.length === 0) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '20px 16px', textAlign: 'center', color: '#166534' }}>
        <strong>All demand covered by ATP inventory</strong> — no raw material orders required for this period.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginRight: 4 }}>Raw material orders needed:</span>
        {data.overdue_count > 0    && <SummaryPill count={data.overdue_count}    label="Overdue"    icon="🔴" />}
        {data.urgent_count > 0     && <SummaryPill count={data.urgent_count}     label="Urgent"     icon="🟠" />}
        {data.order_soon_count > 0 && <SummaryPill count={data.order_soon_count} label="Order Soon" icon="🟡" />}
        {data.on_track_count > 0   && <SummaryPill count={data.on_track_count}   label="On Track"   icon="🟢" />}
      </div>

      {onOrder && (
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1e40af',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>💡</span>
          <span>Click <strong>Order</strong> on any material to jump to Order Materials with it pre-selected.</span>
        </div>
      )}

      {/* Material cards */}
      {data.materials.map((m, _i) => {
        const cfg = STATUS_CONFIG[m.status];
        return (
          <div key={m.raw_material_code} style={{
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            borderRadius: 8, padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              {/* Left: material info */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                  <span style={{
                    background: cfg.badge, color: '#fff',
                    borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                  }}>{cfg.label}</span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{m.raw_material_code}</span>
                </div>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: '#374151', fontWeight: 500 }}>{m.raw_material_name}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
                  Drives: {m.finished_goods.join(', ')}
                </p>
              </div>

              {/* Right: key numbers + order button */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <Stat label="Needed" value={`${m.total_needed.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${m.unit}`} />
                <Stat label="Lead time" value={`${m.lead_time_days} days`} />
                <Stat
                  label="Order by"
                  value={new Date(m.order_by_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  highlight={m.days_until_order <= 0
                    ? `${Math.abs(m.days_until_order)}d overdue`
                    : `${m.days_until_order}d left`}
                  highlightColor={m.days_until_order <= 0 ? '#ef4444' : m.days_until_order <= 7 ? '#f97316' : '#6b7280'}
                />
                {m.estimated_cost_eur != null && (
                  <Stat
                    label="Est. cost *"
                    value={`€${m.estimated_cost_eur.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                  />
                )}
                {onOrder && (
                  <button
                    onClick={() => onOrder(m.raw_material_code, m.raw_material_name, m.total_needed, m.unit, m.order_by_date, m.estimated_cost_eur != null && m.total_needed > 0 ? m.estimated_cost_eur / m.total_needed : undefined)}
                    style={{
                      padding: '7px 16px', borderRadius: 6, border: 'none',
                      background: m.status === 'on_track' ? '#2563eb' : cfg.badge,
                      color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    }}
                  >
                    📦 Order
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {data.materials.some(m => m.estimated_cost_eur != null) && (
        <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>
          * Estimated cost derived from finished goods standard cost (SAP MasterData). Actual raw material purchase price may differ.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, highlight, highlightColor }: {
  label: string; value: string; highlight?: string; highlightColor?: string;
}) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{value}</div>
      {highlight && <div style={{ fontSize: 11, color: highlightColor ?? '#6b7280' }}>{highlight}</div>}
    </div>
  );
}
