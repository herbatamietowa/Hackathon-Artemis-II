import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { AgentTurn, DebateProjectPathResponse, MaterialOption, ProjectArchitectResponse, ProjectSimulationResult, RawMaterialStatus, ScenarioPath, SimulationPath } from '../types';

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
  'Eco-Warrior':     { bg: '#f0fdf4', border: '#86efac', accent: '#16a34a', tag: '#dcfce7', tagText: '#15803d' },
  'Budget Master':   { bg: '#fffbeb', border: '#fde68a', accent: '#d97706', tag: '#fef3c7', tagText: '#b45309' },
  'Speed Demon':     { bg: '#eff6ff', border: '#bfdbfe', accent: '#2563eb', tag: '#dbeafe', tagText: '#1d4ed8' },
  'The AI Consensus': { bg: '#faf5ff', border: '#c4b5fd', accent: '#7c3aed', tag: '#ede9fe', tagText: '#6d28d9' },
};

type ProjectItem = { id: string; type: 'plate' | 'gasket'; code: string; qty: number };
type ItemSimState = {
  loading: boolean;
  plateResult: ProjectSimulationResult | null;
  gasketResult: ProjectArchitectResponse | null;
  error: string | null;
};
type Approval = { path: string; cost: number; carbon_score: number; delivery_days: number };
type DebateState = {
  loading: boolean;
  result: DebateProjectPathResponse | null;
  error: string | null;
  userArg: string;
  showFull: boolean;
};

let _id = 0;
const genId = () => String(++_id);

export function ProjectSimulator({ plates, gaskets }: { plates: MaterialOption[]; gaskets: MaterialOption[] }) {
  const [items, setItems] = useState<ProjectItem[]>([{ id: genId(), type: 'plate', code: '', qty: 100 }]);
  const [simStates, setSimStates] = useState<Record<string, ItemSimState>>({});
  const [approvals, setApprovals] = useState<Record<string, Approval>>({});
  const [debateStates, setDebateStates] = useState<Record<string, DebateState>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Auto-set first code when materials load
  useEffect(() => {
    setItems(prev => prev.map(item => {
      if (item.code) return item;
      const list = item.type === 'plate' ? plates : gaskets;
      return list.length > 0 ? { ...item, code: list[0].code } : item;
    }));
  }, [plates, gaskets]);

  // Debounced simulation per item
  useEffect(() => {
    items.forEach(item => {
      if (timersRef.current[item.id]) clearTimeout(timersRef.current[item.id]);
      if (!item.code) return;
      timersRef.current[item.id] = setTimeout(async () => {
        setSimStates(prev => ({ ...prev, [item.id]: { loading: true, plateResult: null, gasketResult: null, error: null } }));
        try {
          if (item.type === 'plate') {
            const res = await api.simulateProject({ plate_code: item.code, quantity: item.qty });
            setSimStates(prev => ({ ...prev, [item.id]: { loading: false, plateResult: res, gasketResult: null, error: null } }));
          } else {
            const res = await api.projectArchitect({ material_code: item.code, quantity: item.qty });
            setSimStates(prev => ({ ...prev, [item.id]: { loading: false, plateResult: null, gasketResult: res, error: null } }));
          }
        } catch (e) {
          setSimStates(prev => ({ ...prev, [item.id]: { loading: false, plateResult: null, gasketResult: null, error: String(e) } }));
        }
      }, 500);
    });
    return () => { Object.values(timersRef.current).forEach(clearTimeout); };
  }, [JSON.stringify(items.map(i => ({ id: i.id, code: i.code, qty: i.qty, type: i.type })))]);

  const addItem = () => {
    const id = genId();
    const defaultCode = plates[0]?.code ?? '';
    setItems(prev => [...prev, { id, type: 'plate', code: defaultCode, qty: 100 }]);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setSimStates(prev => { const next = { ...prev }; delete next[id]; return next; });
    setApprovals(prev => { const next = { ...prev }; delete next[id]; return next; });
    setDebateStates(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const updateItem = (id: string, patch: Partial<ProjectItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setApprovals(prev => { const next = { ...prev }; delete next[id]; return next; });
    setDebateStates(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const handleClear = () => {
    const id = genId();
    setItems([{ id, type: 'plate', code: plates[0]?.code ?? '', qty: 100 }]);
    setSimStates({});
    setApprovals({});
    setDebateStates({});
  };

  const handleRunDebate = async (itemId: string, plateCode: string, qty: number, userArg?: string) => {
    setDebateStates(prev => ({
      ...prev,
      [itemId]: { loading: true, result: null, error: null, userArg: userArg ?? prev[itemId]?.userArg ?? '', showFull: false },
    }));
    try {
      const res = await api.debateProjectPath({ plate_code: plateCode, quantity: qty, user_argument: userArg || undefined });
      setDebateStates(prev => ({
        ...prev,
        [itemId]: { loading: false, result: res, error: null, userArg: userArg ?? prev[itemId]?.userArg ?? '', showFull: false },
      }));
    } catch (e) {
      setDebateStates(prev => ({
        ...prev,
        [itemId]: { loading: false, result: null, error: String(e), userArg: userArg ?? prev[itemId]?.userArg ?? '', showFull: false },
      }));
    }
  };

  const setDebateUserArg = (itemId: string, val: string) => {
    setDebateStates(prev => ({ ...prev, [itemId]: { ...prev[itemId], loading: false, result: prev[itemId]?.result ?? null, error: prev[itemId]?.error ?? null, userArg: val, showFull: prev[itemId]?.showFull ?? false } }));
  };

  const toggleDebateFull = (itemId: string) => {
    setDebateStates(prev => ({ ...prev, [itemId]: { ...prev[itemId], showFull: !prev[itemId]?.showFull } }));
  };

  const handleApprove = async (itemId: string, path: SimulationPath) => {
    const state = simStates[itemId];
    if (!state?.plateResult) return;
    try {
      await api.approveProject({
        plate_code: state.plateResult.plate_code,
        plate_name: state.plateResult.plate_name,
        gasket_code: state.plateResult.gasket_code,
        quantity: state.plateResult.quantity,
        path_name: path.name,
        plant: path.plant,
        mode: path.mode,
        total_cost_eur: path.total_cost_eur,
        delivery_days: path.delivery_days,
        carbon_score: path.carbon_score,
      });
      setApprovals(prev => ({ ...prev, [itemId]: { path: path.name, cost: path.total_cost_eur, carbon_score: path.carbon_score, delivery_days: path.delivery_days } }));
    } catch (e) {
      setSimStates(prev => ({ ...prev, [itemId]: { ...prev[itemId], error: String(e) } }));
    }
  };

  const handleGasketConfirm = async (itemId: string, path: ScenarioPath) => {
    const state = simStates[itemId];
    if (!state?.gasketResult) return;
    try {
      await api.confirmProject({
        material_code: state.gasketResult.material_code,
        material_name: state.gasketResult.material_name,
        quantity: state.gasketResult.quantity,
        chosen_path: path.name,
        chosen_plant: path.plant,
        cost_eur: path.cost_eur,
        delivery_date: path.delivery_date,
      });
      setApprovals(prev => ({ ...prev, [itemId]: { path: path.name, cost: path.cost_eur, carbon_score: path.carbon_score, delivery_days: path.transport_lt_days } }));
    } catch (e) {
      setSimStates(prev => ({ ...prev, [itemId]: { ...prev[itemId], error: String(e) } }));
    }
  };

  const totalApprovedCost = Object.values(approvals).reduce((s, a) => s + a.cost, 0);
  const approvedCount = Object.keys(approvals).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e40af 100%)', borderRadius: 12, padding: '20px 24px', color: '#fff' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>New Project Simulation</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Build a project with multiple plates and gaskets. For each item the BOM is exploded, raw material inventory checked, and three production paths compared.
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
                {/* Material dropdown */}
                <select
                  value={item.code}
                  onChange={e => updateItem(item.id, { code: e.target.value })}
                  style={{ flex: 2, minWidth: 180, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                >
                  {list.map(m => <option key={m.code} value={m.code}>{m.code} — {m.name}</option>)}
                </select>
                {/* Qty */}
                <input
                  type="number" min={1} step={1} value={item.qty}
                  onChange={e => updateItem(item.id, { qty: Math.max(1, Number(e.target.value)) })}
                  style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                />
                <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>units</span>
                {/* Remove */}
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

        {/* Actions row */}
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

      {/* Total cost banner */}
      {approvedCount > 0 && (() => {
        const vals = Object.values(approvals);
        const avgCarbon = vals.reduce((s, a) => s + a.carbon_score, 0) / vals.length;
        const maxDelivery = Math.max(...vals.map(a => a.delivery_days));
        return (
          <div style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            borderRadius: 10, padding: '16px 22px',
            display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <div style={{ color: '#fff', flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Total Project Cost</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>
                €{Math.round(totalApprovedCost).toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                {approvedCount} of {items.length} item{items.length > 1 ? 's' : ''} approved
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Avg Carbon Score</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{avgCarbon.toFixed(0)}<span style={{ fontSize: 13, opacity: 0.7 }}>/100</span></div>
              </div>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Max Delivery</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{maxDelivery}<span style={{ fontSize: 13, opacity: 0.7 }}>d</span></div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Per-item results */}
      {items.map((item, idx) => {
        const state = simStates[item.id];
        const approval = approvals[item.id];
        const anyApprovedInItem = !!approval;
        if (!state) return null;

        return (
          <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Item header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '2px 8px' }}>
                Item {idx + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{item.code}</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>— {item.qty.toLocaleString()} units</span>
              <span style={{ fontSize: 12, color: item.type === 'plate' ? '#2563eb' : '#7c3aed' }}>
                {item.type === 'plate' ? '🔩 Plate' : '⭕ Gasket'}
              </span>
              {approval && (
                <span style={{ fontSize: 11, fontWeight: 700, background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '2px 8px' }}>
                  ✓ {approval.path}
                </span>
              )}
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

            {!state.loading && state.plateResult && (
              <>
                <BOMSummary result={state.plateResult} />
                {state.plateResult.warning && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>
                    ⚠ {state.plateResult.warning}
                  </div>
                )}
                {state.plateResult.paths.length > 0 ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                      {state.plateResult.paths.map(path => (
                        <PlatePathCard
                          key={path.name}
                          path={path}
                          onApprove={() => handleApprove(item.id, path)}
                          isApproved={approval?.path === path.name}
                          anyApproved={anyApprovedInItem}
                        />
                      ))}
                      {/* 4th card: AI Consensus */}
                      {debateStates[item.id]?.result?.agreed_path && (
                        <ConsensusPathCard
                          path={debateStates[item.id].result!.agreed_path!}
                          status={debateStates[item.id].result!.status}
                          onApprove={() => handleApprove(item.id, debateStates[item.id].result!.agreed_path!)}
                          isApproved={approval?.path === debateStates[item.id].result!.agreed_path!.name}
                          anyApproved={anyApprovedInItem}
                        />
                      )}
                      {debateStates[item.id]?.loading && (
                        <SkeletonBox height={220} label="🤖 Agents debating…" />
                      )}
                    </div>

                    {/* Debate summary panel */}
                    {debateStates[item.id]?.result && (
                      <DebateSummaryPanel
                        debate={debateStates[item.id].result!}
                        showFull={debateStates[item.id].showFull}
                        onToggleFull={() => toggleDebateFull(item.id)}
                      />
                    )}

                    {/* Debate trigger + reopen */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>
                          {debateStates[item.id]?.result ? 'Add argument to reopen debate' : 'Optional: provide a constraint for the AI debate'}
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. must arrive within 30 days, prefer European plants…"
                          value={debateStates[item.id]?.userArg ?? ''}
                          onChange={e => setDebateUserArg(item.id, e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #c4b5fd', fontSize: 13, boxSizing: 'border-box' }}
                        />
                      </div>
                      <button
                        onClick={() => handleRunDebate(item.id, item.code, item.qty, debateStates[item.id]?.userArg || undefined)}
                        disabled={debateStates[item.id]?.loading}
                        style={{
                          padding: '8px 16px', borderRadius: 6, border: '1px solid #7c3aed',
                          background: debateStates[item.id]?.loading ? '#f3f4f6' : '#7c3aed',
                          color: debateStates[item.id]?.loading ? '#9ca3af' : '#fff',
                          fontSize: 13, fontWeight: 600, cursor: debateStates[item.id]?.loading ? 'default' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {debateStates[item.id]?.loading ? '⏳ Debating…' : debateStates[item.id]?.result ? '🔄 Reopen Debate' : '🤖 Ask AI Agents'}
                      </button>
                    </div>

                    {debateStates[item.id]?.error && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#991b1b' }}>
                        Debate error: {debateStates[item.id].error}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                    No feasible production paths found for this material.
                  </div>
                )}
              </>
            )}

            {!state.loading && state.gasketResult && (
              <>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                    Gasket Material
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{state.gasketResult.material_code}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{state.gasketResult.material_name}</div>
                </div>
                {state.gasketResult.paths.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                    {state.gasketResult.paths.map(path => (
                      <GasketPathCard
                        key={path.name}
                        path={path}
                        onConfirm={() => handleGasketConfirm(item.id, path)}
                        isConfirmed={approval?.path === path.name}
                        anyConfirmed={anyApprovedInItem}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                    No production paths found for this gasket material.
                  </div>
                )}
              </>
            )}

            {/* Divider between items */}
            {idx < items.length - 1 && (
              <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: 4 }} />
            )}
          </div>
        );
      })}

      {items.every(i => !simStates[i.id] && !i.code) && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
          Add items above to start the simulation.
        </div>
      )}
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
              {result.raw_materials.map(rm => <RMChip key={rm.code} rm={rm} />)}
            </div>
          </div>
        )}

        {/* Feasible plants */}
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>🏭 Feasible Plants</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.feasible_plants.map(p => {
              const info = PLANT_INFO[p];
              return (
                <div key={p} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                  padding: '6px 10px',
                }}>
                  <span style={{ fontSize: 18 }}>{info?.flag ?? '🏭'}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
                      {p} — {info?.short ?? p}
                    </div>
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
        <strong>{rm.name || rm.code}</strong>
        {' — '}
        {rm.available_qty.toLocaleString()} / {rm.needed_qty.toLocaleString()} {rm.unit}
      </span>
    </div>
  );
}

// ── Plate Path Card ───────────────────────────────────────────────────────────

function PlatePathCard({ path, onApprove, isApproved, anyApproved }: {
  path: SimulationPath; onApprove: () => void; isApproved: boolean; anyApproved: boolean;
}) {
  const t = THEME[path.name] ?? THEME['The Budget Path'];
  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
      opacity: anyApproved && !isApproved ? 0.5 : 1, transition: 'opacity 0.2s',
    }}>
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

      <div style={{ background: 'rgba(255,255,255,0.65)', borderRadius: 8, padding: '9px 11px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Delivery</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.accent }}>{path.delivery_days}d</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Carbon</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: carbonColor(path.carbon_score) }}>{path.carbon_score.toFixed(0)}/100</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Grid CO₂</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#6b7280' }}>{path.grid_intensity.toFixed(2)}</div>
        </div>
      </div>

      <button
        onClick={onApprove}
        disabled={anyApproved}
        style={{
          padding: '8px 0', borderRadius: 6, border: 'none', width: '100%',
          background: isApproved ? '#d1fae5' : anyApproved ? '#f3f4f6' : t.accent,
          color: isApproved ? '#065f46' : anyApproved ? '#9ca3af' : '#fff',
          fontSize: 13, fontWeight: 600, cursor: anyApproved ? 'default' : 'pointer',
        }}
      >
        {isApproved ? '✓ Approved — Added to Project' : 'Select & Approve'}
      </button>
    </div>
  );
}

// ── Gasket Path Card ──────────────────────────────────────────────────────────

function GasketPathCard({ path, onConfirm, isConfirmed, anyConfirmed }: {
  path: ScenarioPath; onConfirm: () => void; isConfirmed: boolean; anyConfirmed: boolean;
}) {
  const t = THEME[path.name] ?? THEME['Speed Demon'];
  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
      opacity: anyConfirmed && !isConfirmed ? 0.5 : 1, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 22 }}>{path.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{path.name}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{path.plant} · {path.region}</div>
        </div>
        {!path.meets_deadline && (
          <span style={{ fontSize: 10, fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: 4, padding: '2px 6px' }}>
            LATE
          </span>
        )}
      </div>

      <div style={{ background: 'rgba(255,255,255,0.65)', borderRadius: 8, padding: '9px 11px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Delivery</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: path.meets_deadline ? t.accent : '#ef4444' }}>
            {new Date(path.delivery_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
          {path.days_margin !== 0 && (
            <div style={{ fontSize: 10, color: path.meets_deadline ? '#6b7280' : '#ef4444' }}>
              {path.days_margin > 0 ? '+' : ''}{path.days_margin}d
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Grid CO₂</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#6b7280' }}>{path.grid_intensity.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>gCO₂/kWh</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Transit</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#6b7280' }}>{path.transport_lt_days}d</div>
        </div>
      </div>

      <button
        onClick={onConfirm}
        disabled={anyConfirmed}
        style={{
          padding: '8px 0', borderRadius: 6, border: 'none', width: '100%',
          background: isConfirmed ? '#d1fae5' : anyConfirmed ? '#f3f4f6' : t.accent,
          color: isConfirmed ? '#065f46' : anyConfirmed ? '#9ca3af' : '#fff',
          fontSize: 13, fontWeight: 600, cursor: anyConfirmed ? 'default' : 'pointer',
        }}
      >
        {isConfirmed ? '✓ Confirmed — Added to Project' : 'Select & Approve'}
      </button>
    </div>
  );
}

// ── AI Consensus Path Card ────────────────────────────────────────────────────

function ConsensusPathCard({ path, status, onApprove, isApproved, anyApproved }: {
  path: SimulationPath; status: string; onApprove: () => void; isApproved: boolean; anyApproved: boolean;
}) {
  const t = THEME['The AI Consensus'];
  const statusLabel = status === 'CONSENSUS' ? 'Agreed ✓' : status === 'USER_OVERRIDE' ? 'User-guided' : 'Debated';
  return (
    <div style={{
      background: t.bg, border: `2px solid ${t.border}`, borderRadius: 12, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
      opacity: anyApproved && !isApproved ? 0.5 : 1, transition: 'opacity 0.2s',
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: -10, left: 14 }}>
        <span style={{ background: t.accent, color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 8px', letterSpacing: 0.5 }}>
          🤖 AI CONSENSUS
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 22 }}>🤝</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>The AI Consensus</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Agreed: {path.name} · {path.plant}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, background: t.tag, color: t.tagText, borderRadius: 4, padding: '2px 7px' }}>
          {statusLabel}
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.65)', borderRadius: 8, padding: '9px 11px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Cost</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.accent }}>€{Math.round(path.total_cost_eur).toLocaleString()}</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Delivery</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.accent }}>{path.delivery_days}d</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Carbon</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: carbonColor(path.carbon_score) }}>{path.carbon_score.toFixed(0)}/100</div>
        </div>
      </div>
      <button
        onClick={onApprove}
        disabled={anyApproved}
        style={{
          padding: '8px 0', borderRadius: 6, border: 'none', width: '100%',
          background: isApproved ? '#ede9fe' : anyApproved ? '#f3f4f6' : t.accent,
          color: isApproved ? '#6d28d9' : anyApproved ? '#9ca3af' : '#fff',
          fontSize: 13, fontWeight: 600, cursor: anyApproved ? 'default' : 'pointer',
        }}
      >
        {isApproved ? '✓ Approved — AI Choice' : 'Select & Approve'}
      </button>
    </div>
  );
}

// ── Debate Summary Panel ──────────────────────────────────────────────────────

function DebateSummaryPanel({ debate, showFull, onToggleFull }: {
  debate: DebateProjectPathResponse; showFull: boolean; onToggleFull: () => void;
}) {
  const agentStyle = (name: string) => {
    if (name === 'User') return { icon: '👤', color: '#6366f1' };
    if (name === 'Cost Specialist') return { icon: '💰', color: '#0891b2' };
    if (name === 'Sustainability Director') return { icon: '🌱', color: '#059669' };
    return { icon: '🤖', color: '#6b7280' };
  };
  return (
    <div style={{ background: '#faf5ff', border: '1px solid #c4b5fd', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9' }}>📋 Debate Summary</span>
        {debate.parameters_considered.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
            {debate.parameters_considered.map(p => (
              <span key={p} style={{ fontSize: 10, fontWeight: 600, background: '#ede9fe', color: '#6d28d9', borderRadius: 3, padding: '2px 6px' }}>
                {p}
              </span>
            ))}
          </div>
        )}
        <button onClick={onToggleFull} style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {showFull ? 'Hide ▲' : 'Full debate ▼'}
        </button>
      </div>
      {!showFull ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {debate.debate_history.map((turn: AgentTurn, i: number) => {
            const s = agentStyle(turn.agent_name);
            const snippet = turn.message.length > 120 ? turn.message.slice(0, 120) + '…' : turn.message;
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{turn.agent_name}</span>
                  {turn.verdict && (
                    <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, color: turn.verdict === 'APPROVED' ? '#16a34a' : '#d97706' }}>
                      [{turn.verdict}]
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: '#374151', marginLeft: 6 }}>{snippet}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {debate.debate_history.map((turn: AgentTurn, i: number) => {
            const s = agentStyle(turn.agent_name);
            return (
              <div key={i} style={{ borderLeft: `3px solid ${s.color}`, paddingLeft: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 15 }}>{s.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{turn.agent_name}</span>
                  {turn.verdict && (
                    <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 'auto', color: turn.verdict === 'APPROVED' ? '#16a34a' : '#d97706', background: turn.verdict === 'APPROVED' ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)', padding: '1px 6px', borderRadius: 3 }}>
                      {turn.verdict}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{turn.message}</p>
              </div>
            );
          })}
        </div>
      )}
      {debate.tradeoffs && debate.tradeoffs.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #ddd6fe' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', marginBottom: 5 }}>⚖️ Trade-offs made</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {debate.tradeoffs.map((t, i) => (
              <div key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6 }}>
                <span style={{ color: '#7c3aed', flexShrink: 0 }}>→</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #ddd6fe', fontSize: 11, color: '#7c3aed', fontStyle: 'italic' }}>
        💡 Missing a constraint? Add it in the input below and reopen the debate.
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function carbonColor(score: number): string {
  if (score < 25) return '#16a34a';
  if (score < 55) return '#d97706';
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
