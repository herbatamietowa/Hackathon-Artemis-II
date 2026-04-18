import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { MaterialOption, ProjectSimulationResult, RawMaterialStatus, SimulationPath } from '../types';

const THEME: Record<string, { bg: string; border: string; accent: string; tag: string; tagText: string }> = {
  'The Green Path':  { bg: '#f0fdf4', border: '#86efac', accent: '#16a34a', tag: '#dcfce7', tagText: '#15803d' },
  'The Fast Path':   { bg: '#eff6ff', border: '#bfdbfe', accent: '#2563eb', tag: '#dbeafe', tagText: '#1d4ed8' },
  'The Budget Path': { bg: '#fffbeb', border: '#fde68a', accent: '#d97706', tag: '#fef3c7', tagText: '#b45309' },
};

export function ProjectSimulator({ plates }: { plates: MaterialOption[] }) {
  const [plate, setPlate] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [result, setResult] = useState<ProjectSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<{ path: string; record: Record<string, unknown> } | null>(null);
  const [version, setVersion] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (plates.length > 0 && !plate) setPlate(plates[0].code);
  }, [plates]);

  useEffect(() => {
    if (!plate) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setApproved(null);
      try {
        const res = await api.simulateProject({ plate_code: plate, quantity });
        setResult(res);
      } catch (e) {
        setError(String(e));
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [plate, quantity, version]);

  const handleApprove = async (path: SimulationPath) => {
    if (!result) return;
    try {
      const res = await api.approveProject({
        plate_code: result.plate_code,
        plate_name: result.plate_name,
        gasket_code: result.gasket_code,
        quantity: result.quantity,
        path_name: path.name,
        plant: path.plant,
        mode: path.mode,
        total_cost_eur: path.total_cost_eur,
        delivery_days: path.delivery_days,
        carbon_score: path.carbon_score,
      });
      setApproved({ path: path.name, record: res.record });
    } catch (e) {
      setError(String(e));
    }
  };

  const handleClear = () => {
    setPlate(plates[0]?.code ?? '');
    setQuantity(100);
    setResult(null);
    setApproved(null);
    setError(null);
    setVersion(v => v + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e40af 100%)',
        borderRadius: 12, padding: '20px 24px', color: '#fff',
      }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>New Project Simulation</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Input a Plate ID and quantity to explode the BOM, verify feasibility, check raw material inventory,
          and compare three production paths.
        </p>
      </div>

      {/* Controls */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={lbl}>Plate ID</label>
            <select
              value={plate}
              onChange={e => { setPlate(e.target.value); setApproved(null); }}
              style={inp}
            >
              {plates.map(p => <option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Quantity (units)</label>
            <input
              type="number" min={1} step={1} value={quantity}
              onChange={e => { setQuantity(Math.max(1, Number(e.target.value))); setApproved(null); }}
              style={{ ...inp, width: 110 }}
            />
          </div>
          <button onClick={handleClear} style={clearBtn}>Clear</button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonBox height={80} label="Exploding BOM…" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <SkeletonBox height={260} label="🌿 The Green Path" />
            <SkeletonBox height={260} label="⚡ The Fast Path" />
            <SkeletonBox height={260} label="💰 The Budget Path" />
          </div>
        </div>
      )}

      {!loading && result && (
        <>
          {/* BOM Summary */}
          <BOMSummary result={result} />

          {result.warning && (
            <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#92400e' }}>
              ⚠ {result.warning}
            </div>
          )}

          {/* Approved banner */}
          {approved && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13, marginBottom: 8 }}>
                ✓ Project approved — {approved.path}
              </div>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                  View generated JSON record
                </summary>
                <pre style={{
                  marginTop: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: 12, fontSize: 11, overflowX: 'auto', color: '#1e293b', lineHeight: 1.5,
                }}>
                  {JSON.stringify(approved.record, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {/* Scenario cards */}
          {result.paths.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {result.paths.map(path => (
                <PathCard
                  key={path.name}
                  path={path}
                  onApprove={() => handleApprove(path)}
                  isApproved={approved?.path === path.name}
                  anyApproved={!!approved}
                />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 14 }}>
              No feasible production paths found for this plate.
            </div>
          )}
        </>
      )}

      {!loading && !result && !error && !plate && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
          Select a Plate ID to start the simulation.
        </div>
      )}
    </div>
  );
}

// ── BOM Summary ──────────────────────────────────────────────────────────────

function BOMSummary({ result }: { result: ProjectSimulationResult }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>
        BOM Explosion
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Plate → Gasket */}
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Plate (Header)</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{result.plate_code}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{result.plate_name}</div>
          <div style={{ margin: '6px 0', fontSize: 14, color: '#94a3b8' }}>↓</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Paired Gasket</div>
          {result.gasket_code ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{result.gasket_code}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{result.gasket_name}</div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>Not identified in BOM</div>
          )}
        </div>

        {/* Raw Materials */}
        {result.raw_materials.length > 0 && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Raw Material Inventory</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {result.raw_materials.map(rm => (
                <RMChip key={rm.code} rm={rm} />
              ))}
            </div>
          </div>
        )}

        {/* Feasible plants */}
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Feasible Plants</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {result.feasible_plants.map(p => (
              <span key={p} style={{
                fontSize: 11, fontWeight: 600, background: '#e0f2fe', color: '#0369a1',
                borderRadius: 4, padding: '2px 8px',
              }}>{p}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RMChip({ rm }: { rm: RawMaterialStatus }) {
  const ratio = rm.needed_qty > 0 ? rm.available_qty / rm.needed_qty : 1;
  const color = ratio >= 1 ? '#16a34a' : ratio >= 0.5 ? '#d97706' : '#dc2626';
  const icon = ratio >= 1 ? '✓' : ratio >= 0.5 ? '⚠' : '✗';
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ color, fontWeight: 700, fontSize: 12 }}>{icon}</span>
      <span style={{ fontSize: 11, color: '#374151' }}>
        <strong>{rm.name || rm.code}</strong>
        {' — '}
        {rm.available_qty.toLocaleString()} / {rm.needed_qty.toLocaleString()} {rm.unit}
      </span>
    </div>
  );
}

// ── Scenario Card ─────────────────────────────────────────────────────────────

function PathCard({
  path, onApprove, isApproved, anyApproved,
}: {
  path: SimulationPath;
  onApprove: () => void;
  isApproved: boolean;
  anyApproved: boolean;
}) {
  const t = THEME[path.name] ?? THEME['The Budget Path'];

  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
      opacity: anyApproved && !isApproved ? 0.55 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 26 }}>{path.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{path.name}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{path.plant} · {path.plant_name}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, background: t.tag, color: t.tagText, borderRadius: 4, padding: '2px 8px' }}>
          {path.mode}
        </span>
      </div>

      {/* Cost breakdown */}
      <div style={{ background: 'rgba(255,255,255,0.65)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Total Cost</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: t.accent }}>{formatCost(path.total_cost_eur)}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: '#6b7280' }}>
          <span>Plates {formatCost(path.plate_cost)}</span>
          <span>Gaskets {formatCost(path.gasket_cost)}</span>
          <span>Ship {formatCost(path.shipping_cost)}</span>
        </div>
      </div>

      {/* Delivery timeline */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
          <span>Delivery</span>
          <span style={{ color: t.accent, fontSize: 13, fontWeight: 800 }}>{path.delivery_days} days</span>
        </div>
        <DeliveryBar path={path} accent={t.accent} />
      </div>

      {/* Carbon score */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>
          <span>Carbon Score</span>
          <span style={{ color: carbonColor(path.carbon_score), fontSize: 12, fontWeight: 700 }}>
            {path.carbon_score.toFixed(0)}/100
          </span>
        </div>
        <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${path.carbon_score}%`, height: '100%', borderRadius: 3,
            background: `linear-gradient(90deg, #22c55e 0%, #f59e0b 50%, #ef4444 100%)`,
            backgroundSize: '600px 6px',
            backgroundPosition: `${-path.carbon_score * 4}px 0`,
          }} />
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
          Grid: {path.grid_intensity.toFixed(2)} gCO₂/kWh · Scrap ×{path.scrap_factor.toFixed(2)}
        </div>
      </div>

      {/* Approve button */}
      <button
        onClick={onApprove}
        disabled={anyApproved}
        style={{
          padding: '9px 0', borderRadius: 6, border: 'none', width: '100%',
          background: isApproved ? '#d1fae5' : anyApproved ? '#f3f4f6' : t.accent,
          color: isApproved ? '#065f46' : anyApproved ? '#9ca3af' : '#fff',
          fontSize: 13, fontWeight: 600,
          cursor: anyApproved ? 'default' : 'pointer',
        }}
      >
        {isApproved ? '✓ Approved — Added to Pipeline' : 'Select & Approve'}
      </button>
    </div>
  );
}

function DeliveryBar({ path, accent }: { path: SimulationPath; accent: string }) {
  const total = path.delivery_days || 1;
  const rawPct = (path.raw_material_lt_days / total) * 100;
  const prodPct = (path.production_lt_days / total) * 100;
  const logPct = (path.logistics_lt_days / total) * 100;
  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        <div style={{ width: `${rawPct}%`, background: '#94a3b8', minWidth: 2 }} title={`Raw: ${path.raw_material_lt_days}d`} />
        <div style={{ width: `${prodPct}%`, background: accent, minWidth: 2 }} title={`Prod: ${path.production_lt_days}d`} />
        <div style={{ width: `${logPct}%`, background: '#cbd5e1', minWidth: 2 }} title={`Logistics: ${path.logistics_lt_days}d`} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, color: '#94a3b8' }}>
        <span>🪨 {path.raw_material_lt_days}d raw</span>
        <span>🔧 {path.production_lt_days}d prod</span>
        <span>🚢 {path.logistics_lt_days}d ship</span>
      </div>
    </div>
  );
}

function SkeletonBox({ height, label }: { height: number; label: string }) {
  return (
    <div style={{
      background: '#f3f4f6', borderRadius: 12, height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#9ca3af', fontSize: 13,
    }}>
      {label}
    </div>
  );
}

function carbonColor(score: number): string {
  if (score < 25) return '#16a34a';
  if (score < 55) return '#d97706';
  return '#dc2626';
}

function formatCost(eur: number): string {
  if (eur >= 1_000_000) return `€${(eur / 1_000_000).toFixed(1)}M`;
  if (eur >= 1_000) return `€${(eur / 1_000).toFixed(0)}k`;
  return `€${eur.toFixed(0)}`;
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280',
  marginBottom: 4, textTransform: 'uppercase',
};
const inp: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: '100%',
};
const clearBtn: React.CSSProperties = {
  padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db',
  background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', height: 34,
};
