import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { RawMaterialItem } from '../types';

const TODAY = new Date().toISOString().split('T')[0];

type OrderRecord = {
  order_id: string;
  material_code: string;
  material_name: string;
  unit: string;
  qty: number;
  factory: string;
  deadline: string;
  ordered_at: string;
};

export function ProjectArchitect({
  rawMaterials,
  factories,
  initialMaterial,
  initialQty,
  initialUnit,
  initialDeadline,
}: {
  rawMaterials: RawMaterialItem[];
  factories: string[];
  initialMaterial?: string;
  initialQty?: number;
  initialUnit?: string;
  initialDeadline?: string;
}) {
  const [material, setMaterial] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [factory, setFactory] = useState(factories[0] ?? 'NW01');
  const [deadline, setDeadline] = useState('');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rawMaterials.length > 0 && !material) setMaterial(rawMaterials[0].code);
  }, [rawMaterials]);

  useEffect(() => {
    if (factories.length > 0 && !factory) setFactory(factories[0]);
  }, [factories]);

  // Apply values pre-selected from Raw Material Needs
  useEffect(() => {
    if (initialMaterial) setMaterial(initialMaterial);
    if (initialQty !== undefined) setQuantity(Math.ceil(initialQty));
    if (initialDeadline) setDeadline(initialDeadline);
  }, [initialMaterial, initialQty, initialUnit, initialDeadline]);

  const selected = rawMaterials.find(m => m.code === material);
  const estimatedCost = selected?.unit_cost_eur != null ? quantity * selected.unit_cost_eur : null;
  const unit = selected?.unit ?? initialUnit ?? 'PC';

  const handleOrder = async () => {
    if (!material || !selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.orderRawMaterial({
        material_code: material,
        material_name: selected.name,
        unit,
        quantity,
        factory,
        deadline: deadline || undefined,
      });
      setOrders(prev => [...prev, {
        order_id: res.order_id,
        material_code: material,
        material_name: selected.name,
        unit,
        qty: quantity,
        factory,
        deadline,
        ordered_at: new Date().toLocaleString(),
      }]);
      setDeadline('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMaterial(rawMaterials[0]?.code ?? '');
    setQuantity(100);
    setDeadline('');
    setError(null);
  };

  const totalOrders = orders.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0369a1 100%)',
        borderRadius: 12, padding: '20px 24px', color: '#fff',
      }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>Order Raw Materials</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Order the raw materials your factory needs. Select the material, quantity (in the correct unit), destination factory, and required delivery date.
        </p>
      </div>

      {/* Order form */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Material selector */}
          <div style={{ flex: 3, minWidth: 240 }}>
            <label style={lbl}>Raw Material</label>
            <select
              value={material}
              onChange={e => setMaterial(e.target.value)}
              style={inp}
            >
              {rawMaterials.map(m => (
                <option key={m.code} value={m.code}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity + unit */}
          <div>
            <label style={lbl}>Quantity ({unit})</label>
            <input
              type="number" min={0.001} step={0.001} value={quantity}
              onChange={e => setQuantity(Math.max(0.001, Number(e.target.value)))}
              style={{ ...inp, width: 120 }}
            />
          </div>

          {/* Factory */}
          <div>
            <label style={lbl}>Destination Factory</label>
            <select value={factory} onChange={e => setFactory(e.target.value)} style={inp}>
              {factories.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Deadline */}
          <div>
            <label style={lbl}>Required Delivery Date</label>
            <input
              type="date" value={deadline}
              onChange={e => setDeadline(e.target.value)}
              style={{ ...inp, borderColor: deadline && deadline < TODAY ? '#f97316' : undefined }}
            />
            {deadline && deadline < TODAY && (
              <div style={{ fontSize: 11, color: '#c2410c', marginTop: 3, fontWeight: 600 }}>⚠ Date is in the past</div>
            )}
          </div>

          <button onClick={handleClear} style={clearBtn}>Clear</button>
        </div>

        {/* Stock info for selected material */}
        {selected && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StockChip label="Current stock" value={`${selected.stock_qty.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${selected.unit}`} color={selected.stock_qty > 0 ? '#16a34a' : '#dc2626'} />
              <StockChip label="You're ordering" value={`${quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${unit}`} color="#2563eb" />
              {selected.stock_qty > 0 && (
                <StockChip
                  label="After delivery"
                  value={`≈ ${(selected.stock_qty + quantity).toLocaleString('en-US', { maximumFractionDigits: 1 })} ${unit}`}
                  color="#7c3aed"
                />
              )}
              {estimatedCost != null && (
                <StockChip
                  label="Est. order cost *"
                  value={`€${estimatedCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                  color="#b45309"
                />
              )}
            </div>
            {estimatedCost != null && (
              <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>
                * Estimated cost based on finished goods standard cost (SAP). Actual raw material purchase price may differ.
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Place Order button */}
      <button
        onClick={handleOrder}
        disabled={loading || !material}
        style={{
          padding: '12px 0', borderRadius: 8, border: 'none',
          background: loading ? '#93c5fd' : '#2563eb',
          color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: loading || !material ? 'default' : 'pointer',
          width: '100%', letterSpacing: 0.3,
        }}
      >
        {loading ? '⏳ Placing order…' : '📦 Place Order'}
      </button>

      {/* Orders log */}
      {orders.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>📋 Orders this session</span>
              <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 8 }}>{totalOrders} order{totalOrders > 1 ? 's' : ''} placed</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orders.map((o, i) => {
              const isOverdue = !!o.deadline && o.deadline < TODAY;
              return (
                <div key={o.order_id} style={{
                  background: isOverdue ? '#fff7ed' : '#f0fdf4',
                  border: `1px solid ${isOverdue ? '#fed7aa' : '#86efac'}`,
                  borderRadius: 8, padding: '12px 16px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 8px',
                      color: isOverdue ? '#c2410c' : '#15803d',
                      background: isOverdue ? '#ffedd5' : '#dcfce7',
                    }}>
                      {isOverdue ? '⚠ OVERDUE' : `✓ #${i + 1}`}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: isOverdue ? '#7c2d12' : '#14532d' }}>{o.material_code}</div>
                      <div style={{ fontSize: 11, color: isOverdue ? '#9a3412' : '#166534' }}>{o.material_name}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <OStat label="Qty" value={`${o.qty.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${o.unit}`} overdue={isOverdue} />
                    <OStat label="Factory" value={o.factory} overdue={isOverdue} />
                    {o.deadline && (
                      <OStat
                        label="Deliver by"
                        value={new Date(o.deadline + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                        overdue={isOverdue}
                        highlight={isOverdue}
                      />
                    )}
                    <OStat label="Ref" value={o.order_id} mono overdue={isOverdue} />
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', alignSelf: 'flex-end' }}>{o.ordered_at}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rawMaterials.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
          Loading raw materials…
        </div>
      )}
    </div>
  );
}

function StockChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
      padding: '6px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function OStat({ label, value, mono, overdue, highlight }: { label: string; value: string; mono?: boolean; overdue?: boolean; highlight?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit', color: highlight ? '#c2410c' : overdue ? '#7c2d12' : '#14532d' }}>{value}</div>
    </div>
  );
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
