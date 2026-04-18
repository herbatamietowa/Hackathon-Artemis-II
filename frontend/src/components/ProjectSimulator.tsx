import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { MaterialOption, ProjectSimulationResult, RawMaterialStatus, SimulationPath } from '../types';

const PLANT_INFO: Record<string, { short: string; flag: string; region: string }> = {
  NW01: { short: 'Midwest',    flag: '🇺🇸', region: 'N. America' },
  NW02: { short: 'Heartland',  flag: '🇩🇪', region: 'Europe W'   },
  NW03: { short: 'Carpathia',  flag: '🇵🇱', region: 'Europe E'   },
  NW04: { short: 'Southbay',   flag: '🇮🇳', region: 'S. Asia'    },
  NW05: { short: 'Pacific',    flag: '🇯🇵', region: 'E. Asia'    },
  NW06: { short: 'Southeast',  flag: '🇺🇸', region: 'N. America' },
  NW07: { short: 'West Coast', flag: '🇺🇸', region: 'N. America' },
  NW08: { short: 'Iberia',     flag: '🇪🇸', region: 'Europe W'   },
  NW09: { short: 'Alpine',     flag: '🇨🇭', region: 'Europe W'   },
  NW10: { short: 'Baltics',    flag: '🇱🇻', region: 'Europe E'   },
  NW11: { short: 'Levant',     flag: '🇦🇪', region: 'MENA'       },
  NW12: { short: 'Cerrado',    flag: '🇧🇷', region: 'S. America' },
  NW13: { short: 'Andes',      flag: '🇨🇱', region: 'S. America' },
  NW14: { short: 'Oceania',    flag: '🇦🇺', region: 'Oceania'    },
  NW15: { short: 'Indochina',  flag: '🇹🇭', region: 'SE Asia'    },
};

const THEME: Record<string, { bg: string; border: string; accent: string; tag: string; tagText: string }> = {
  'The Green Path':  { bg: '#f0fdf4', border: '#86efac', accent: '#16a34a', tag: '#dcfce7', tagText: '#15803d' },
  'The Fast Path':   { bg: '#eff6ff', border: '#bfdbfe', accent: '#2563eb', tag: '#dbeafe', tagText: '#1d4ed8' },
  'The Budget Path': { bg: '#fffbeb', border: '#fde68a', accent: '#d97706', tag: '#fef3c7', tagText: '#b45309' },
};

type ProjectItem = { id: string; type: 'plate' | 'gasket'; code: string; qty: number };
type ItemSimState = { loading: boolean; result: ProjectSimulationResult | null; error: string | null };
type Selection = { path: string; cost: number; co2_kg: number; delivery_days: number; pathObj: SimulationPath };

let _id = 0;
const genId = () => String(++_id);

export function ProjectSimulator({ plates, gaskets }: { plates: MaterialOption[]; gaskets: MaterialOption[] }) {
  const [items, setItems] = useState<ProjectItem[]>([{ id: genId(), type: 'plate', code: '', qty: 100 }]);
  const [simStates, setSimStates] = useState<Record<string, ItemSimState>>({});
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Set default code when lists load
  useEffect(() => {
    setItems(prev => prev.map(item => {
      if (item.code) return item;
      const list = item.type === 'plate' ? plates : gaskets;
      return list.length > 0 ? { ...item, code: list[0].code } : item;
    }));
  }, [plates, gaskets]);

  // Debounced simulation per item — both plate and gasket use simulate-project
  useEffect(() => {
    items.forEach(item => {
      if (timersRef.current[item.id]) clearTimeout(timersRef.current[item.id]);
      if (!item.code) return;
      timersRef.current[item.id] = setTimeout(async () => {
        setSimStates(prev => ({ ...prev, [item.id]: { loading: true, result: null, error: null } }));
        try {
          const res = await api.simulateProject({ plate_code: item.code, quantity: item.qty });
          setSimStates(prev => ({ ...prev, [item.id]: { loading: false, result: res, error: null } }));
        } catch (e) {
          setSimStates(prev => ({ ...prev, [item.id]: { loading: false, result: null, error: String(e) } }));
        }
      }, 500);
    });
    return () => { Object.values(timersRef.current).forEach(clearTimeout); };
  }, [JSON.stringify(items.map(i => ({ id: i.id, code: i.code, qty: i.qty })))]);

  const addItem = () => {
    const id = genId();
    setItems(prev => [...prev, { id, type: 'plate', code: plates[0]?.code ?? '', qty: 100 }]);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setSimStates(prev => { const n = { ...prev }; delete n[id]; return n; });
    setSelections(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const updateItem = (id: string, patch: Partial<ProjectItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setSelections(prev => { const n = { ...prev }; delete n[id]; return n; });
    setOrderPlaced(false);
  };

  const handleClear = () => {
    const id = genId();
    setItems([{ id, type: 'plate', code: plates[0]?.code ?? '', qty: 100 }]);
    setSimStates({});
    setSelections({});
    setOrderPlaced(false);
    setOrderError(null);
  };

  const handleSelectPath = (itemId: string, path: SimulationPath) => {
    setSelections(prev => ({
      ...prev,
      [itemId]: { path: path.name, cost: path.total_cost_eur, co2_kg: path.estimated_co2_kg, delivery_days: path.delivery_days, pathObj: path },
    }));
    setOrderPlaced(false);
  };

  const handlePlaceOrder = async () => {
    setOrderLoading(true);
    setOrderError(null);
    try {
      for (const itemId of Object.keys(selections)) {
        const sel = selections[itemId];
        const state = simStates[itemId];
        if (!state?.result) continue;
        await api.approveProject({
          plate_code: state.result.plate_code,
          plate_name: state.result.plate_name,
          gasket_code: state.result.gasket_code,
          quantity: state.result.quantity,
          path_name: sel.path,
          plant: sel.pathObj.plant,
          mode: sel.pathObj.mode,
          total_cost_eur: sel.pathObj.total_cost_eur,
          delivery_days: sel.pathObj.delivery_days,
          carbon_score: sel.pathObj.carbon_score,
        });
      }
      setOrderPlaced(true);
    } catch (e) {
      setOrderError(String(e));
    } finally {
      setOrderLoading(false);
    }
  };

  const totalCost = Object.values(selections).reduce((s, a) => s + a.cost, 0);
  const totalCO2 = Object.values(selections).reduce((s, a) => s + a.co2_kg, 0);
  const selectedCount = Object.keys(selections).length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e40af 100%)', borderRadius: 12, padding: '20px 24px', color: '#fff' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>New Project Simulation</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Build a project with plates and gaskets. BOM is exploded per item, inventory checked, and three production paths compared. Select a path per item, then place the entire order.
        </p>
      </div>

      {/* Project item list */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 12 }}>
          Project Items
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item, idx) => {
            const list = item.type === 'plate' ? plates : gaskets;
            const sel = selections[item.id];
            return (
              <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 20, textAlign: 'right', flexShrink: 0 }}>
                  {idx + 1}.
                </span>
                {/* Type toggle */}
                <div style={{ display: 'flex', borderRadius: 6, border: '1px solid #d1d5db', overflow: 'hidden', flexShrink: 0 }}>
                  {(['plate', 'gasket'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => updateItem(item.id, { type: t, code: (t === 'plate' ? plates : gaskets)[0]?.code ?? '' })}
                      style={{
                        padding: '5px 10px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: item.type === t ? '#2563eb' : '#fff',
                        color: item.type === t ? '#fff' : '#6b7280',
                        textTransform: 'capitalize',
                      }}
                    >
                      {t === 'plate' ? '🔩 Plate' : '⭕ Gasket'}
                    </button>
                  ))}
                </div>
                {/* Material dropdown — description first */}
                <select
                  value={item.code}
                  onChange={e => updateItem(item.id, { code: e.target.value })}
                  style={{ flex: 2, minWidth: 200, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                >
                  {list.map(m => (
                    <option key={m.code} value={m.code}>{m.name} [{m.code}]</option>
                  ))}
                </select>
                {/* Qty */}
                <input
                  type="number" min={1} step={1} value={item.qty}
                  onChange={e => updateItem(item.id, { qty: Math.max(1, Number(e.target.value)) })}
                  style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                />
                <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>units</span>
                {sel && (
                  <span style={{ fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '2px 8px', flexShrink: 0 }}>
                    ✓ {sel.path}
                  </span>
                )}
                {items.length > 1 && (
                  <button
                    onClick={() => removeItem(item.id)}
                    title="Remove item"
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: '1px solid #fca5a5',
                      background: '#fef2f2', color: '#ef4444', fontSize: 14, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
          <button
            onClick={addItem}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 6, border: '1px solid #2563eb',
              background: '#eff6ff', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Add Item
          </button>
          <button onClick={handleClear} style={clearBtn}>Clear All</button>
        </div>
      </div>

      {/* Order summary + Place Order button */}
      {selectedCount > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
          borderRadius: 10, padding: '16px 22px',
          display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{ color: '#fff', flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Total Project Cost</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>
              €{totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
              {selectedCount} of {items.length} item{items.length > 1 ? 's' : ''} selected
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Est. CO₂</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                {totalCO2 >= 1000 ? `${(totalCO2 / 1000).toFixed(1)}t` : `${Math.round(totalCO2)}kg`}
              </div>
            </div>
            <div style={{ textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Max Delivery</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                {Math.max(...Object.values(selections).map(a => a.delivery_days))}<span style={{ fontSize: 12, opacity: 0.7 }}>d</span>
              </div>
            </div>
            {orderPlaced ? (
              <div style={{
                background: '#d1fae5', borderRadius: 8, padding: '10px 18px',
                color: '#065f46', fontWeight: 700, fontSize: 14, textAlign: 'center',
              }}>
                ✓ Order Placed!
              </div>
            ) : (
              <button
                onClick={handlePlaceOrder}
                disabled={!allSelected || orderLoading}
                title={!allSelected ? `Select a path for all ${items.length} items first` : undefined}
                style={{
                  padding: '10px 22px', borderRadius: 8, border: 'none',
                  background: allSelected ? '#fff' : 'rgba(255,255,255,0.3)',
                  color: allSelected ? '#065f46' : 'rgba(255,255,255,0.6)',
                  fontSize: 14, fontWeight: 700,
                  cursor: allSelected && !orderLoading ? 'pointer' : 'default',
                  flexShrink: 0,
                }}
              >
                {orderLoading ? '⏳ Placing…' : '📦 Place Entire Order'}
              </button>
            )}
          </div>
        </div>
      )}

      {orderError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#991b1b', fontSize: 13 }}>
          {orderError}
        </div>
      )}

      {/* Per-item results */}
      {items.map((item, idx) => {
        const state = simStates[item.id];
        const sel = selections[item.id];
        const list = item.type === 'plate' ? plates : gaskets;
        const desc = list.find(m => m.code === item.code)?.name ?? item.code;
        if (!state) return null;

        return (
          <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '2px 8px' }}>
                Item {idx + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{desc}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>[{item.code}]</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>— {item.qty.toLocaleString()} units</span>
              <span style={{ fontSize: 11, color: item.type === 'plate' ? '#2563eb' : '#7c3aed' }}>
                {item.type === 'plate' ? '🔩' : '⭕'} {item.type}
              </span>
            </div>

            {state.error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#991b1b', fontSize: 13 }}>
                {state.error}
              </div>
            )}

            {state.loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <SkeletonBox height={60} label="Exploding BOM…" />
                <SkeletonBox height={60} label="Computing paths…" />
                <SkeletonBox height={60} label="Checking inventory…" />
              </div>
            )}

            {!state.loading && state.result && (
              <>
                <BOMSummary result={state.result} />
                {state.result.warning && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>
                    ⚠ {state.result.warning}
                  </div>
                )}
                {state.result.paths.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                    {state.result.paths.map(path => (
                      <PathCard
                        key={path.name}
                        path={path}
                        onSelect={() => handleSelectPath(item.id, path)}
                        isSelected={sel?.path === path.name}
                        anySelected={!!sel}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                    No feasible production paths found for this material.
                  </div>
                )}
              </>
            )}

            {idx < items.length - 1 && (
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: 4 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── BOM Summary ───────────────────────────────────────────────────────────────

function BOMSummary({ result }: { result: ProjectSimulationResult }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>
        BOM Explosion
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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

        {result.raw_materials.length > 0 && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Raw Material Inventory</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {result.raw_materials.map(rm => <RMChip key={rm.code} rm={rm} />)}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>🏭 Feasible Plants</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.feasible_plants.map(p => {
              const info = PLANT_INFO[p];
              return (
                <div key={p} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px',
                }}>
                  <span style={{ fontSize: 18 }}>{info?.flag ?? '🏭'}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{p} — {info?.short ?? p}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{info?.region}</div>
                  </div>
                </div>
              );
            })}
            {result.feasible_plants.length === 0 && (
              <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>No feasible plants found</span>
            )}
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
        <strong>{rm.name || rm.code}</strong>{' — '}
        {rm.available_qty.toLocaleString()} / {rm.needed_qty.toLocaleString()} {rm.unit}
      </span>
    </div>
  );
}

// ── Path Card ─────────────────────────────────────────────────────────────────

function PathCard({ path, onSelect, isSelected, anySelected }: {
  path: SimulationPath; onSelect: () => void; isSelected: boolean; anySelected: boolean;
}) {
  const t = THEME[path.name] ?? THEME['The Budget Path'];
  const total = path.raw_material_lt_days + path.production_lt_days + path.logistics_lt_days;
  const rawPct  = total > 0 ? (path.raw_material_lt_days / total) * 100 : 33;
  const prodPct = total > 0 ? (path.production_lt_days  / total) * 100 : 33;
  const shipPct = total > 0 ? (path.logistics_lt_days    / total) * 100 : 34;
  const co2Display = path.estimated_co2_kg >= 1000
    ? `${(path.estimated_co2_kg / 1000).toFixed(1)} t`
    : `${Math.round(path.estimated_co2_kg)} kg`;

  return (
    <div style={{
      background: t.bg, border: `2px solid ${isSelected ? t.accent : t.border}`,
      borderRadius: 12, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
      opacity: anySelected && !isSelected ? 0.45 : 1,
      transition: 'opacity 0.2s, border-color 0.15s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 22 }}>{path.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{path.name}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{path.plant} · {path.plant_name}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, background: t.tag, color: t.tagText, borderRadius: 4, padding: '2px 7px' }}>
          {path.mode}
        </span>
      </div>

      {/* Cost */}
      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Total Cost</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: t.accent }}>
          €{path.total_cost_eur.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
          plate €{Math.round(path.plate_cost).toLocaleString()} · gasket €{Math.round(path.gasket_cost).toLocaleString()} · ship €{Math.round(path.shipping_cost).toLocaleString()}
        </div>
      </div>

      {/* Delivery bar */}
      <div>
        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
          Delivery — {path.delivery_days}d total
        </div>
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 10, gap: 1 }}>
          <div title={`Raw materials: ${path.raw_material_lt_days}d`} style={{ width: `${rawPct}%`, background: '#78716c' }} />
          <div title={`Production: ${path.production_lt_days}d`}      style={{ width: `${prodPct}%`, background: t.accent }} />
          <div title={`Logistics: ${path.logistics_lt_days}d`}        style={{ width: `${shipPct}%`, background: '#60a5fa' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
          <LegendDot color="#78716c" label={`🪨 ${path.raw_material_lt_days}d raw`} />
          <LegendDot color={t.accent} label={`🔧 ${path.production_lt_days}d prod`} />
          <LegendDot color="#60a5fa"  label={`🚢 ${path.logistics_lt_days}d ship`} />
        </div>
      </div>

      {/* CO₂ + grid */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Est. CO₂</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: co2Color(path.estimated_co2_kg) }}>{co2Display}</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Grid CO₂</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#6b7280' }}>{path.grid_intensity.toFixed(2)}</div>
          <div style={{ fontSize: 9, color: '#9ca3af' }}>kgCO₂/kWh</div>
        </div>
      </div>

      {/* Select button */}
      <button
        onClick={onSelect}
        style={{
          padding: '8px 0', borderRadius: 6, border: isSelected ? `2px solid ${t.accent}` : 'none',
          width: '100%',
          background: isSelected ? '#fff' : anySelected ? '#f3f4f6' : t.accent,
          color: isSelected ? t.accent : anySelected ? '#9ca3af' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        {isSelected ? '✓ Selected' : 'Select Path'}
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: '#6b7280' }}>{label}</span>
    </div>
  );
}

function co2Color(kg: number): string {
  if (kg < 500) return '#16a34a';
  if (kg < 2000) return '#d97706';
  return '#dc2626';
}

function SkeletonBox({ height, label }: { height: number; label: string }) {
  return (
    <div style={{
      background: '#f3f4f6', borderRadius: 10, height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#9ca3af', fontSize: 13,
    }}>
      {label}
    </div>
  );
}

const clearBtn: React.CSSProperties = {
  padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db',
  background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
