import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { MaterialOption, ProjectArchitectResponse, ScenarioPath } from '../types';

const TODAY = new Date().toISOString().split('T')[0];

const THEME: Record<string, { bg: string; border: string; accent: string; tag: string; tagText: string }> = {
  'Eco-Warrior':   { bg: '#f0fdf4', border: '#86efac', accent: '#16a34a', tag: '#dcfce7', tagText: '#15803d' },
  'Budget Master': { bg: '#fffbeb', border: '#fde68a', accent: '#d97706', tag: '#fef3c7', tagText: '#b45309' },
  'Speed Demon':   { bg: '#eff6ff', border: '#bfdbfe', accent: '#2563eb', tag: '#dbeafe', tagText: '#1d4ed8' },
};

export function ProjectArchitect({ materials }: { materials: MaterialOption[] }) {
  const [material, setMaterial] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [deadline, setDeadline] = useState('');
  const [result, setResult] = useState<ProjectArchitectResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (materials.length > 0 && !material) {
      setMaterial(materials[0].code);
    }
  }, [materials]);

  useEffect(() => {
    if (!material) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.projectArchitect({
          material_code: material,
          quantity,
          deadline: deadline || undefined,
        });
        setResult(res);
      } catch (e) {
        setError(String(e));
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [material, quantity, deadline, version]);

  const handleConfirm = async (path: ScenarioPath) => {
    if (!result) return;
    try {
      await api.confirmProject({
        material_code: result.material_code,
        material_name: result.material_name,
        quantity: result.quantity,
        deadline: result.deadline ?? undefined,
        chosen_path: path.name,
        chosen_plant: path.plant,
        cost_eur: path.cost_eur,
        delivery_date: path.delivery_date,
      });
      setConfirmed(path.name);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleClear = () => {
    setMaterial(materials[0]?.code ?? '');
    setQuantity(100);
    setDeadline('');
    setConfirmed(null);
    setError(null);
    setResult(null);
    setVersion(v => v + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
        borderRadius: 12, padding: '20px 24px', color: '#fff',
      }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>Project Architect</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Configure a production order and instantly compare Eco, Cost, and Speed scenarios — updates automatically as you type.
        </p>
      </div>

      {/* Controls */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' as const }}>
              Material
            </label>
            <select
              value={material}
              onChange={e => { setMaterial(e.target.value); setConfirmed(null); }}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: '100%' }}
            >
              {materials.map(m => (
                <option key={m.code} value={m.code}>{m.code} — {m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' as const }}>
              Quantity (units)
            </label>
            <input
              type="number" min={1} step={1} value={quantity}
              onChange={e => { setQuantity(Math.max(1, Number(e.target.value))); setConfirmed(null); }}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 110 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' as const }}>
              Required Delivery Date
            </label>
            <input
              type="date" min={TODAY} value={deadline}
              onChange={e => { setDeadline(e.target.value); setConfirmed(null); }}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            />
          </div>

          <button
            onClick={handleClear}
            style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer', height: 34 }}
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {confirmed && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', color: '#15803d', fontSize: 13, fontWeight: 600 }}>
          ✓ <strong>{confirmed}</strong> path confirmed for {result?.material_name}. Saved to project log.
        </div>
      )}

      {/* Skeleton / loading cards */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {(['🌿 Eco-Warrior', '💰 Budget Master', '⚡ Speed Demon']).map(s => (
            <div key={s} style={{
              background: '#f3f4f6', borderRadius: 12, padding: 24, minHeight: 220,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14,
            }}>
              {s} — computing…
            </div>
          ))}
        </div>
      )}

      {/* Scenario cards */}
      {!loading && result && result.paths.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {result.paths.map(path => (
            <PathCard
              key={path.name}
              path={path}
              onConfirm={() => handleConfirm(path)}
              isConfirmed={confirmed === path.name}
              anyConfirmed={!!confirmed}
            />
          ))}
        </div>
      )}

      {!loading && result && result.paths.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
          No scenario paths found for this material. Check that it has active multi-plant tooling.
        </div>
      )}

      {!loading && !result && !error && !material && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
          Select a material to compute production scenarios.
        </div>
      )}
    </div>
  );
}

function PathCard({
  path, onConfirm, isConfirmed, anyConfirmed,
}: {
  path: ScenarioPath;
  onConfirm: () => void;
  isConfirmed: boolean;
  anyConfirmed: boolean;
}) {
  const t = THEME[path.name] ?? THEME['Speed Demon'];
  const co2Color = path.grid_intensity < 0.3 ? '#16a34a' : path.grid_intensity > 0.5 ? '#ef4444' : '#d97706';

  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
      opacity: anyConfirmed && !isConfirmed ? 0.55 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 26 }}>{path.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{path.name}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{path.plant} · {path.region}</div>
        </div>
        {!path.meets_deadline && (
          <span style={{ fontSize: 10, fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: 4, padding: '2px 6px' }}>
            LATE
          </span>
        )}
      </div>

      {/* Big Three metrics */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
        background: 'rgba(255,255,255,0.65)', borderRadius: 8, padding: '10px 8px',
      }}>
        <Metric label="Total Cost" value={formatCost(path.cost_eur)} accent={t.accent} />
        <Metric
          label="Delivery"
          value={formatDate(path.delivery_date)}
          sub={path.days_margin !== 0 ? `${path.days_margin > 0 ? '+' : ''}${path.days_margin}d` : undefined}
          accent={path.meets_deadline ? t.accent : '#ef4444'}
        />
        <Metric label="Grid CO₂" value={path.grid_intensity.toFixed(2)} sub="gCO₂/kWh" accent={co2Color} />
      </div>

      {/* Mode badge */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, background: t.tag, color: t.tagText, borderRadius: 4, padding: '2px 8px' }}>
          {path.mode}
        </span>
        <span style={{ fontSize: 11, color: '#6b7280' }}>{path.transport_lt_days}d transit · {path.plant_name}</span>
      </div>

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        disabled={isConfirmed || anyConfirmed}
        style={{
          padding: '8px 0', borderRadius: 6, border: 'none', width: '100%',
          background: isConfirmed ? '#d1fae5' : anyConfirmed ? '#f3f4f6' : t.accent,
          color: isConfirmed ? '#065f46' : anyConfirmed ? '#9ca3af' : '#fff',
          fontSize: 13, fontWeight: 600,
          cursor: isConfirmed || anyConfirmed ? 'default' : 'pointer',
        }}
      >
        {isConfirmed ? '✓ Confirmed' : 'Confirm Project'}
      </button>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: accent }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function formatCost(eur: number): string {
  if (eur >= 1_000_000) return `€${(eur / 1_000_000).toFixed(1)}M`;
  if (eur >= 1_000) return `€${(eur / 1_000).toFixed(0)}k`;
  return `€${eur.toFixed(0)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}
