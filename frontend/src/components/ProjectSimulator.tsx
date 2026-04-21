import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { DataQualityBadge } from './DataQualityBadge';
import type {
  AgentTurn,
  CompatibleGasketsResult,
  DebateProjectPathResponse,
  DeliveryDestination,
  MaterialOption,
  ProjectSimulationResult,
  RawMaterialStatus,
  SimulationPath,
} from '../types';

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
  'The Green Path':   { bg: '#f0fdf4', border: '#86efac', accent: '#16a34a', tag: '#dcfce7', tagText: '#15803d' },
  'The Fast Path':    { bg: '#eff6ff', border: '#bfdbfe', accent: '#2563eb', tag: '#dbeafe', tagText: '#1d4ed8' },
  'The Budget Path':  { bg: '#fffbeb', border: '#fde68a', accent: '#d97706', tag: '#fef3c7', tagText: '#b45309' },
  'The AI Consensus': { bg: '#faf5ff', border: '#c4b5fd', accent: '#7c3aed', tag: '#ede9fe', tagText: '#6d28d9' },
};

const TRANSPORT_ICON: Record<string, string> = {
  road: '🚛', rail: '🚂', sea: '🚢', air: '✈️',
};

type ProjectItem = { id: string; type: 'plate' | 'gasket'; code: string; qty: number; pairedGasketCode?: string };
type ItemSimState = { loading: boolean; result: ProjectSimulationResult | null; error: string | null };
type Selection = { path: string; cost: number; co2_kg: number; delivery_days: number; pathObj: SimulationPath };
type DebateState = { loading: boolean; result: DebateProjectPathResponse | null; error: string | null; userArg: string; showFull: boolean };
type CompatState = { loading: boolean; result: CompatibleGasketsResult | null; shown: boolean };

let _id = 0;
const genId = () => String(++_id);

export function ProjectSimulator({ plates, gaskets }: { plates: MaterialOption[]; gaskets: MaterialOption[] }) {
  const [items, setItems] = useState<ProjectItem[]>([{ id: genId(), type: 'plate', code: '', qty: 100 }]);
  const [simStates, setSimStates]       = useState<Record<string, ItemSimState>>({});
  const [selections, setSelections]     = useState<Record<string, Selection>>({});
  const [debateStates, setDebateStates] = useState<Record<string, DebateState>>({});
  const [compatStates, setCompatStates] = useState<Record<string, CompatState>>({});
  const [orderPlaced, setOrderPlaced]   = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError]     = useState<string | null>(null);

  // Delivery destination
  const [destinations, setDestinations]   = useState<DeliveryDestination[]>([]);
  const [delivery, setDelivery]           = useState<DeliveryDestination | null>(null);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load delivery destinations once
  useEffect(() => {
    api.deliveryDestinations().then(setDestinations).catch(() => {});
  }, []);

  // Default plate code once lists load
  useEffect(() => {
    setItems(prev => prev.map(item => {
      if (item.code) return item;
      const list = item.type === 'plate' ? plates : gaskets;
      return list.length > 0 ? { ...item, code: list[0].code } : item;
    }));
  }, [plates, gaskets]);

  // Debounced simulation per item whenever code, qty, or delivery changes
  const deliveryKey = delivery ? `${delivery.lat},${delivery.lon}` : 'none';
  useEffect(() => {
    items.forEach(item => {
      if (timersRef.current[item.id]) clearTimeout(timersRef.current[item.id]);
      if (!item.code) return;
      timersRef.current[item.id] = setTimeout(async () => {
        setSimStates(prev => ({ ...prev, [item.id]: { loading: true, result: null, error: null } }));
        try {
          const res = await api.simulateProject({
            plate_code: item.code,
            quantity: item.qty,
            item_type: item.type,
            ...(delivery ? { delivery_lat: delivery.lat, delivery_lon: delivery.lon, delivery_name: delivery.name } : {}),
            ...(item.pairedGasketCode ? { gasket_override: item.pairedGasketCode } : {}),
          });
          setSimStates(prev => ({ ...prev, [item.id]: { loading: false, result: res, error: null } }));
        } catch (e) {
          setSimStates(prev => ({ ...prev, [item.id]: { loading: false, result: null, error: String(e) } }));
        }
      }, 500);
    });
    return () => { Object.values(timersRef.current).forEach(clearTimeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items.map(i => ({ id: i.id, code: i.code, qty: i.qty, paired: i.pairedGasketCode }))), deliveryKey]);

  const addItem = () => {
    const id = genId();
    setItems(prev => [...prev, { id, type: 'plate', code: plates[0]?.code ?? '', qty: 100 }]);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setSimStates(prev => { const n = { ...prev }; delete n[id]; return n; });
    setSelections(prev => { const n = { ...prev }; delete n[id]; return n; });
    setDebateStates(prev => { const n = { ...prev }; delete n[id]; return n; });
    setCompatStates(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const updateItem = (id: string, patch: Partial<ProjectItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setSelections(prev => { const n = { ...prev }; delete n[id]; return n; });
    setDebateStates(prev => { const n = { ...prev }; delete n[id]; return n; });
    setCompatStates(prev => { const n = { ...prev }; delete n[id]; return n; });
    setOrderPlaced(false);
  };

  const handlePairGasket = (itemId: string, gasketCode: string) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, pairedGasketCode: gasketCode } : i));
    setSelections(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    setDebateStates(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    setCompatStates(prev => ({ ...prev, [itemId]: { ...prev[itemId], shown: false } }));
    setOrderPlaced(false);
  };

  const handleUnpairGasket = (itemId: string) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, pairedGasketCode: undefined } : i));
    setSelections(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    setDebateStates(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    setOrderPlaced(false);
  };

  const handleClear = () => {
    const id = genId();
    setItems([{ id, type: 'plate', code: plates[0]?.code ?? '', qty: 100 }]);
    setSimStates({}); setSelections({}); setDebateStates({}); setCompatStates({});
    setOrderPlaced(false); setOrderError(null);
  };

  const handleShowCompatible = async (itemId: string, plateCode: string) => {
    const already = compatStates[itemId];
    if (already?.result) {
      // toggle visibility
      setCompatStates(prev => ({ ...prev, [itemId]: { ...prev[itemId], shown: !prev[itemId].shown } }));
      return;
    }
    setCompatStates(prev => ({ ...prev, [itemId]: { loading: true, result: null, shown: true } }));
    try {
      const res = await api.compatibleGaskets(plateCode);
      setCompatStates(prev => ({ ...prev, [itemId]: { loading: false, result: res, shown: true } }));
    } catch {
      setCompatStates(prev => ({ ...prev, [itemId]: { loading: false, result: null, shown: false } }));
    }
  };

  const handleRunDebate = async (itemId: string, plateCode: string, qty: number, userArg?: string) => {
    setDebateStates(prev => ({
      ...prev,
      [itemId]: { loading: true, result: null, error: null, userArg: userArg ?? prev[itemId]?.userArg ?? '', showFull: false },
    }));
    try {
      const res = await api.debateProjectPath({
        plate_code: plateCode,
        quantity: qty,
        user_argument: userArg || undefined,
        ...(delivery ? { delivery_lat: delivery.lat, delivery_lon: delivery.lon, delivery_name: delivery.name } : {}),
      });
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

  const handleSelectPath = (itemId: string, path: SimulationPath) => {
    setSelections(prev => ({
      ...prev,
      [itemId]: { path: path.name, cost: path.total_cost_eur, co2_kg: path.estimated_co2_kg, delivery_days: path.delivery_days, pathObj: path },
    }));
    setOrderPlaced(false);
  };

  const handlePlaceOrder = async () => {
    setOrderLoading(true); setOrderError(null);
    try {
      for (const itemId of Object.keys(selections)) {
        const sel   = selections[itemId];
        const state = simStates[itemId];
        if (!state?.result) continue;
        await api.approveProject({
          plate_code:    state.result.plate_code,
          plate_name:    state.result.plate_name,
          gasket_code:   state.result.gasket_code,
          quantity:      state.result.quantity,
          path_name:     sel.path,
          plant:         sel.pathObj.plant,
          mode:          sel.pathObj.mode,
          total_cost_eur: sel.pathObj.total_cost_eur,
          delivery_days: sel.pathObj.delivery_days,
          carbon_score:  sel.pathObj.carbon_score,
        });
      }
      setOrderPlaced(true);
    } catch (e) {
      setOrderError(String(e));
    } finally {
      setOrderLoading(false);
    }
  };

  const totalCost      = Object.values(selections).reduce((s, a) => s + a.cost, 0);
  const totalCO2       = Object.values(selections).reduce((s, a) => s + a.co2_kg, 0);
  const selectedCount  = Object.keys(selections).length;
  const allSelected    = items.length > 0 && selectedCount === items.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e40af 100%)', borderRadius: 12, padding: '20px 24px', color: '#fff' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>New Project Simulation</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Select plates and gaskets, choose a delivery destination, and compare production paths with real inventory, shipping cost, and transport CO₂.
        </p>
      </div>

      {/* Delivery destination selector */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>📍</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', marginBottom: 4 }}>
            Delivery Destination
          </div>
          <select
            value={delivery?.name ?? ''}
            onChange={e => {
              const dest = destinations.find(d => d.name === e.target.value) ?? null;
              setDelivery(dest);
              setSelections({});
              setOrderPlaced(false);
            }}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #bae6fd', fontSize: 13, minWidth: 240, background: '#fff' }}
          >
            <option value=''>— No destination selected —</option>
            {destinations.map(d => (
              <option key={d.name} value={d.name}>
                {d.name}{d.island ? ' 🏝' : ''} ({d.continent})
              </option>
            ))}
          </select>
        </div>
        {delivery && (
          <div style={{ fontSize: 12, color: '#0369a1' }}>
            <div style={{ fontWeight: 600 }}>{delivery.continent}</div>
            <div style={{ opacity: 0.7, fontSize: 11 }}>{delivery.lat.toFixed(2)}°, {delivery.lon.toFixed(2)}°</div>
            {delivery.island && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#d97706', fontWeight: 600 }}>
                🏝 Island — sea crossing or air required
              </div>
            )}
          </div>
        )}
        {!delivery && (
          <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
            Shipping costs and times estimated without a destination.
          </div>
        )}
      </div>

      {/* Project item list */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 12 }}>
          Project Items
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item, idx) => {
            const list = item.type === 'plate' ? plates : gaskets;
            const sel  = selections[item.id];
            const cs   = compatStates[item.id];
            return (
              <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Main row */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', width: 20, textAlign: 'right', flexShrink: 0 }}>{idx + 1}.</span>
                  {/* Type toggle */}
                  <div style={{ display: 'flex', borderRadius: 6, border: '1px solid #d1d5db', overflow: 'hidden', flexShrink: 0 }}>
                    {(['plate', 'gasket'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => updateItem(item.id, { type: t, code: (t === 'plate' ? plates : gaskets)[0]?.code ?? '' })}
                        style={{
                          padding: '5px 10px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          background: item.type === t ? '#2563eb' : '#fff',
                          color:      item.type === t ? '#fff'    : '#6b7280',
                          textTransform: 'capitalize',
                        }}
                      >{t === 'plate' ? '🔩 Plate' : '⭕ Gasket'}</button>
                    ))}
                  </div>
                  {/* Material dropdown */}
                  <select
                    value={item.code}
                    onChange={e => updateItem(item.id, { code: e.target.value })}
                    style={{ flex: 2, minWidth: 200, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                  >
                    {list.map(m => <option key={m.code} value={m.code}>{m.name} [{m.code}]</option>)}
                  </select>
                  {/* Qty */}
                  <input
                    type="number" min={1} step={1} value={item.qty}
                    onChange={e => updateItem(item.id, { qty: Math.max(1, Number(e.target.value)) })}
                    style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                  />
                  <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>units</span>
                  {sel && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '2px 8px' }}>
                        ✓ {sel.path}
                      </span>
                      <button
                        onClick={() => setSelections(prev => { const n = { ...prev }; delete n[item.id]; return n; })}
                        style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
                      >× Change</button>
                    </span>
                  )}
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(item.id)}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444', fontSize: 14, cursor: 'pointer', flexShrink: 0 }}
                    >×</button>
                  )}
                </div>

                {/* Compatible gaskets toggle — only for plates */}
                {item.type === 'plate' && item.code && (
                  <div style={{ marginLeft: 30, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleShowCompatible(item.id, item.code)}
                        style={{
                          alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 6,
                          border: '1px solid #c4b5fd', background: cs?.shown ? '#ede9fe' : '#faf5ff',
                          color: '#6d28d9', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {cs?.loading ? '⏳ Loading…' : cs?.shown ? '▲ Hide gaskets' : item.pairedGasketCode ? '⭕ Change gasket' : '⭕ Show compatible gaskets'}
                      </button>
                      {item.pairedGasketCode && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, background: '#ede9fe', color: '#6d28d9', borderRadius: 4, padding: '2px 8px' }}>
                            BOM pair: {gaskets.find(g => g.code === item.pairedGasketCode)?.name ?? item.pairedGasketCode}
                          </span>
                          <button
                            onClick={() => handleUnpairGasket(item.id)}
                            style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
                          >× Remove</button>
                        </span>
                      )}
                    </div>

                    {cs?.shown && cs.result && (
                      <div style={{ background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9' }}>
                            Compatible gaskets for this plate family
                          </span>
                          {cs.result.tool_prefixes.length > 0 && (
                            <span style={{ fontSize: 11, color: '#7c3aed', background: '#ede9fe', borderRadius: 4, padding: '1px 6px' }}>
                              Tool prefix: {cs.result.tool_prefixes.join(', ')}
                            </span>
                          )}
                          {cs.result.data_quality_warning && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <DataQualityBadge excludedRows={0} flagCount={1} reconstructedRows={0} />
                              <span style={{ fontSize: 11, color: '#92400e' }}>
                                {cs.result.warning_message}
                              </span>
                            </div>
                          )}
                        </div>

                        {cs.result.compatible_gaskets.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {cs.result.compatible_gaskets.map(g => (
                              <div key={g.code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: '#374151', background: '#f3f4f6', borderRadius: 3, padding: '1px 5px' }}>{g.code}</span>
                                <span style={{ fontSize: 12, color: '#4b5563' }}>{g.name}</span>
                                <button
                                  onClick={() => handlePairGasket(item.id, g.code)}
                                  style={{
                                    fontSize: 11, padding: '2px 8px', borderRadius: 4, marginLeft: 'auto', cursor: 'pointer',
                                    border: item.pairedGasketCode === g.code ? '1px solid #6d28d9' : '1px solid #a78bfa',
                                    background: item.pairedGasketCode === g.code ? '#6d28d9' : '#ede9fe',
                                    color: item.pairedGasketCode === g.code ? '#fff' : '#5b21b6',
                                  }}
                                >{item.pairedGasketCode === g.code ? '✓ Paired' : 'Pair with plate'}</button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No compatible gaskets found in catalog.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
          <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6, border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Add Item
          </button>
          <button onClick={handleClear} style={clearBtn}>Clear All</button>
        </div>
      </div>

      {/* Order summary */}
      {selectedCount > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)', borderRadius: 10, padding: '16px 22px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ color: '#fff', flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Total Project Cost</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>
              €{totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
              {selectedCount} of {items.length} item{items.length > 1 ? 's' : ''} selected
              {delivery ? ` · to ${delivery.name}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Transport CO₂</div>
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
              <div style={{ background: '#d1fae5', borderRadius: 8, padding: '10px 18px', color: '#065f46', fontWeight: 700, fontSize: 14 }}>✓ Order Placed!</div>
            ) : (
              <button
                onClick={handlePlaceOrder}
                disabled={!allSelected || orderLoading}
                title={!allSelected ? `Select a path for all ${items.length} items first` : undefined}
                style={{
                  padding: '10px 22px', borderRadius: 8, border: 'none',
                  background: allSelected ? '#fff' : 'rgba(255,255,255,0.3)',
                  color: allSelected ? '#065f46' : 'rgba(255,255,255,0.6)',
                  fontSize: 14, fontWeight: 700, cursor: allSelected && !orderLoading ? 'pointer' : 'default', flexShrink: 0,
                }}
              >
                {orderLoading ? '⏳ Placing…' : '📦 Place Entire Order'}
              </button>
            )}
          </div>
        </div>
      )}

      {orderError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#991b1b', fontSize: 13 }}>{orderError}</div>
      )}

      {/* Per-item results */}
      {items.map((item, idx) => {
        const state = simStates[item.id];
        const sel   = selections[item.id];
        const list  = item.type === 'plate' ? plates : gaskets;
        const desc  = list.find(m => m.code === item.code)?.name ?? item.code;
        if (!state) return null;

        return (
          <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '2px 8px' }}>Item {idx + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{desc}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>[{item.code}]</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>— {item.qty.toLocaleString()} units</span>
              <span style={{ fontSize: 11, color: item.type === 'plate' ? '#2563eb' : '#7c3aed' }}>
                {item.type === 'plate' ? '🔩' : '⭕'} {item.type}
              </span>
            </div>

            {state.error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#991b1b', fontSize: 13 }}>{state.error}</div>
            )}

            {state.loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <SkeletonBox height={60} label="Checking inventory…" />
                <SkeletonBox height={60} label="Computing shipping…" />
                <SkeletonBox height={60} label="Comparing paths…" />
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                    {state.result.paths.map(path => (
                      <PathCard
                        key={path.name}
                        path={path}
                        quantity={item.qty}
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

                {/* AI Debate */}
                {state.result.paths.length > 0 && (() => {
                  const ds = debateStates[item.id];
                  return (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <input
                          placeholder="Optional: add a constraint for the AI (e.g. 'prioritise speed')"
                          value={ds?.userArg ?? ''}
                          onChange={e => setDebateStates(prev => ({
                            ...prev,
                            [item.id]: { ...(prev[item.id] ?? { loading: false, result: null, error: null, showFull: false }), userArg: e.target.value },
                          }))}
                          style={{ flex: 1, minWidth: 200, padding: '7px 10px', borderRadius: 6, border: '1px solid #c4b5fd', fontSize: 13 }}
                        />
                        <button
                          onClick={() => handleRunDebate(item.id, item.code, item.qty, ds?.userArg)}
                          disabled={ds?.loading}
                          style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: ds?.loading ? '#e9d5ff' : '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 600, cursor: ds?.loading ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {ds?.loading ? '🤖 Debating…' : '🤖 Let AI Decide'}
                        </button>
                      </div>

                      {ds?.error && (
                        <div style={{ marginTop: 8, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#991b1b', fontSize: 13 }}>{ds.error}</div>
                      )}

                      {ds?.result && (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <ConsensusPathCard
                            path={ds.result.agreed_path!}
                            status={ds.result.status}
                            onApprove={() => handleSelectPath(item.id, ds.result!.agreed_path!)}
                            isApproved={sel?.path === ds.result.agreed_path?.name || sel?.path === 'The AI Consensus'}
                            anyApproved={!!sel}
                          />
                          <DebateSummaryPanel
                            debate={ds.result}
                            showFull={ds.showFull}
                            onToggleFull={() => setDebateStates(prev => ({ ...prev, [item.id]: { ...prev[item.id], showFull: !prev[item.id].showFull } }))}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}

            {idx < items.length - 1 && <div style={{ borderTop: '1px dashed #e5e7eb', marginTop: 4 }} />}
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
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>BOM Explosion</div>
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
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px' }}>
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
  const color  = ratio >= 1 ? '#16a34a' : ratio >= 0.5 ? '#d97706' : '#dc2626';
  const icon   = ratio >= 1 ? '✓' : ratio >= 0.5 ? '⚠' : '✗';
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

function PathCard({ path, quantity, onSelect, isSelected, anySelected }: {
  path: SimulationPath; quantity: number; onSelect: () => void; isSelected: boolean; anySelected: boolean;
}) {
  const t = THEME[path.name] ?? THEME['The Budget Path'];

  // Delivery bar segments — only show RM wait if actually ordered
  const hasRmWait  = path.rm_ordered_at_plant && path.raw_material_lt_days > 0;
  const hasProd    = path.production_lt_days > 0;
  const hasJoin    = path.is_bom_pair && path.joining_time_days > 0;
  const rmDays     = hasRmWait ? path.raw_material_lt_days : 0;
  const prodDays   = hasProd   ? path.production_lt_days   : 0;
  const joinDays   = hasJoin   ? path.joining_time_days    : 0;
  const shipDays   = path.logistics_lt_days;
  const total      = rmDays + prodDays + joinDays + shipDays || 1;
  const rmPct      = (rmDays   / total) * 100;
  const prodPct    = (prodDays / total) * 100;
  const joinPct    = (joinDays / total) * 100;
  const shipPct    = (shipDays / total) * 100;

  const co2Display = path.estimated_co2_kg >= 1000
    ? `${(path.estimated_co2_kg / 1000).toFixed(1)} t`
    : `${Math.round(path.estimated_co2_kg)} kg`;

  // Inventory status chip
  const stockQty = path.stock_available_qty;
  const shortfall = Math.max(0, quantity - stockQty);
  const inventoryChip = stockQty >= quantity
    ? { label: `✅ ${stockQty.toLocaleString()} in stock — ship only`,      color: '#15803d', bg: '#dcfce7' }
    : shortfall > 0 && !path.rm_ordered_at_plant
    ? { label: `⚙ Producing ${shortfall.toLocaleString()} units`,           color: '#1d4ed8', bg: '#dbeafe' }
    : path.rm_ordered_at_plant
    ? { label: `📦 RM ordering required (+${path.raw_material_lt_days}d)`,  color: '#92400e', bg: '#fef3c7' }
    : { label: `⚙ Production required`,                                      color: '#1d4ed8', bg: '#dbeafe' };

  return (
    <div style={{
      background: t.bg, border: `2px solid ${isSelected ? t.accent : t.border}`,
      borderRadius: 12, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 10,
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

      {/* Transport route */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>{TRANSPORT_ICON[path.transport_mode] ?? '🚛'}</span>
        <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.6)', borderRadius: 4, padding: '2px 7px', color: '#374151' }}>
          {path.transport_mode.toUpperCase()}
        </span>
        {path.delivery_name !== 'Unspecified' && (
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            → {path.delivery_name} · {path.delivery_dist_km.toLocaleString()} km
          </span>
        )}
      </div>

      {/* Transport note warning */}
      {path.transport_note && (
        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#92400e' }}>
          ⚠ {path.transport_note}
        </div>
      )}

      {/* Inventory status */}
      <div style={{ background: inventoryChip.bg, borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, color: inventoryChip.color }}>
        {inventoryChip.label}
      </div>
      {path.rm_ordered_at_plant && (
        <div style={{ fontSize: 10, color: '#78716c', fontStyle: 'italic', marginTop: -6 }}>
          RM procurement estimated from BOM supplier lead time — no supplier record in dataset.
        </div>
      )}

      {/* Cost */}
      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Total Cost</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: t.accent }}>
          €{path.total_cost_eur.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
          {path.plate_cost > 0 && <>plate €{Math.round(path.plate_cost).toLocaleString()} · </>}
          gasket €{Math.round(path.gasket_cost).toLocaleString()} · ship €{Math.round(path.shipping_cost).toLocaleString()}
          {path.is_bom_pair && path.inter_plant_cost_eur > 0 && (
            <> · inter-plant €{Math.round(path.inter_plant_cost_eur).toLocaleString()}</>
          )}
        </div>
      </div>

      {/* Delivery bar */}
      <div>
        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
          Delivery — {path.delivery_days}d total
        </div>
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 10, gap: 1 }}>
          {hasRmWait && <div title={`RM ordering: ${rmDays}d`}  style={{ width: `${rmPct}%`,   background: '#f59e0b' }} />}
          {hasProd   && <div title={`Production: ${prodDays}d`} style={{ width: `${prodPct}%`, background: t.accent }} />}
          {hasJoin   && <div title={`Joining: ${joinDays}d`}    style={{ width: `${joinPct}%`, background: '#a855f7' }} />}
          <div title={`Shipping: ${shipDays}d`} style={{ width: `${shipPct}%`, background: '#60a5fa', flex: (!hasRmWait && !hasProd && !hasJoin) ? 1 : undefined }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
          {hasRmWait && <LegendDot color="#f59e0b" label={`📦 ${rmDays}d RM wait`} />}
          {hasProd   && <LegendDot color={t.accent} label={`🔧 ${prodDays}d prod`} />}
          {hasJoin   && <LegendDot color="#a855f7"  label={`🔗 ${joinDays}d joining`} />}
          <LegendDot color="#60a5fa" label={`${TRANSPORT_ICON[path.transport_mode] ?? '🚢'} ${shipDays}d ship`} />
        </div>
      </div>

      {/* CO₂ — transport only */}
      <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
          Transport CO₂ only
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: co2Color(path.estimated_co2_kg) }}>{co2Display}</div>
        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>GLEC {path.transport_mode} factor</div>
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
  if (kg < 200) return '#16a34a';
  if (kg < 1000) return '#d97706';
  return '#dc2626';
}

function SkeletonBox({ height, label }: { height: number; label: string }) {
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 10, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
      {label}
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
    <div style={{ background: t.bg, border: `2px solid ${t.border}`, borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, opacity: anyApproved && !isApproved ? 0.5 : 1, position: 'relative' }}>
      <div style={{ position: 'absolute', top: -10, left: 14 }}>
        <span style={{ background: t.accent, color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 8px' }}>🤖 AI CONSENSUS</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 22 }}>🤝</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>The AI Consensus</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Agreed: {path.name} · {path.plant}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, background: t.tag, color: t.tagText, borderRadius: 4, padding: '2px 7px' }}>{statusLabel}</span>
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
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Transport CO₂</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: co2Color(path.estimated_co2_kg) }}>
            {path.estimated_co2_kg >= 1000 ? `${(path.estimated_co2_kg / 1000).toFixed(1)}t` : `${Math.round(path.estimated_co2_kg)}kg`}
          </div>
        </div>
      </div>
      <button
        onClick={onApprove}
        disabled={anyApproved}
        style={{ padding: '8px 0', borderRadius: 6, border: 'none', width: '100%', background: isApproved ? '#ede9fe' : anyApproved ? '#f3f4f6' : t.accent, color: isApproved ? '#6d28d9' : anyApproved ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 600, cursor: anyApproved ? 'default' : 'pointer' }}
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
              <span key={p} style={{ fontSize: 10, fontWeight: 600, background: '#ede9fe', color: '#6d28d9', borderRadius: 3, padding: '2px 6px' }}>{p}</span>
            ))}
          </div>
        )}
        <button onClick={onToggleFull} style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
          {showFull ? 'Hide ▲' : 'Full debate ▼'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: showFull ? 10 : 6 }}>
        {debate.debate_history.map((turn: AgentTurn, i: number) => {
          const s = agentStyle(turn.agent_name);
          return showFull ? (
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
          ) : (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{turn.agent_name}</span>
                {turn.verdict && (
                  <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, color: turn.verdict === 'APPROVED' ? '#16a34a' : '#d97706' }}>[{turn.verdict}]</span>
                )}
                <span style={{ fontSize: 12, color: '#374151', marginLeft: 6 }}>
                  {turn.message.length > 120 ? turn.message.slice(0, 120) + '…' : turn.message}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {debate.tradeoffs.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #ddd6fe' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', marginBottom: 5 }}>⚖️ Trade-offs</div>
          {debate.tradeoffs.map((tr, i) => (
            <div key={i} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 6, marginBottom: 2 }}>
              <span style={{ color: '#7c3aed', flexShrink: 0 }}>→</span><span>{tr}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const clearBtn: React.CSSProperties = {
  padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db',
  background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
