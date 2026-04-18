import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { GCIResponse, GCIRoute, MaterialOption } from '../types';

const MODES = ['Economy', 'Standard', 'Express'] as const;
type Mode = typeof MODES[number];

const MODE_COLORS: Record<string, string> = {
  Economy: '#22c55e',
  Standard: '#3b82f6',
  Express: '#ef4444',
};

const SIZE_LABEL: Record<string, string> = { S: '3300T', M: '5500T', L: '8000T+' };

function ScoreBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function RouteCard({ route, isRecommended }: { route: GCIRoute; isRecommended: boolean }) {
  const borderColor = isRecommended ? '#2563eb' : route.carbon_penalty ? '#fca5a5' : '#e5e7eb';
  const bg = isRecommended ? '#eff6ff' : route.carbon_penalty ? '#fff5f5' : '#fff';

  return (
    <div style={{
      border: `1.5px solid ${borderColor}`,
      borderRadius: 8,
      padding: '12px 16px',
      background: bg,
      position: 'relative',
    }}>
      {isRecommended && (
        <span style={{
          position: 'absolute', top: -10, left: 12,
          background: '#2563eb', color: '#fff',
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
        }}>RECOMMENDED</span>
      )}
      {route.carbon_penalty && !isRecommended && (
        <span style={{
          position: 'absolute', top: -10, left: 12,
          background: '#ef4444', color: '#fff',
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
        }}>CARBON PENALTY</span>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        {/* Left */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{route.plant}</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{route.plant_name}</span>
            <span style={{
              background: MODE_COLORS[route.mode] ?? '#6b7280',
              color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '1px 7px', borderRadius: 4,
            }}>{route.mode}</span>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
            Grid: <strong style={{ color: '#374151' }}>{route.grid_intensity.toFixed(2)} gCO₂/kWh</strong>
            &nbsp;·&nbsp;Press: {SIZE_LABEL[route.dominant_size] ?? route.dominant_size}
            &nbsp;·&nbsp;Scrap factor: {route.scrap_factor.toFixed(3)}
          </div>
          <div style={{ width: 180 }}>
            <ScoreBar value={route.cost_score} color="#f59e0b" label="Cost score" />
            <ScoreBar value={route.carbon_score} color="#10b981" label="Carbon score" />
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Stat label="GCI" value={(route.gci * 100).toFixed(1)} unit="%" highlight={isRecommended ? 'optimal' : undefined} />
          <Stat label="Cost" value={`€${route.raw_cost_eur.toFixed(0)}`} />
          <Stat label="Arrival" value={new Date(route.arrival_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} />
          <Stat
            label="vs RDD"
            value={route.meets_rdd ? `+${route.days_margin}d` : `${route.days_margin}d`}
            color={route.meets_rdd ? '#22c55e' : '#ef4444'}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, highlight, color }: {
  label: string; value: string; unit?: string; highlight?: string; color?: string;
}) {
  return (
    <div style={{ textAlign: 'right', minWidth: 50 }}>
      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? '#111827' }}>{value}{unit}</div>
      {highlight && <div style={{ fontSize: 10, color: '#2563eb' }}>{highlight}</div>}
    </div>
  );
}

export function GCIPanel() {
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [materialCode, setMaterialCode] = useState('');
  const [rdd, setRdd] = useState('');
  const [alpha, setAlpha] = useState(0.5);
  const [forcedMode, setForcedMode] = useState<Mode | ''>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GCIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.materials().then(r => {
      setMaterials(r.materials);
      if (r.materials.length > 0) setMaterialCode(r.materials[0].code);
    }).catch(() => {});
  }, []);

  const run = async () => {
    if (!materialCode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.gci({
        material_code: materialCode,
        rdd: rdd || undefined,
        alpha,
        forced_mode: forcedMode || undefined,
      });
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const alphaLabel = alpha < 0.3 ? 'Max Sustainability' : alpha > 0.7 ? 'Max Cost Efficiency' : 'Balanced';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Material selector */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>
              Material
            </label>
            <select
              value={materialCode}
              onChange={e => setMaterialCode(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 220 }}
            >
              {materials.map(m => (
                <option key={m.code} value={m.code}>{m.code} — {m.name.slice(0, 30)}</option>
              ))}
            </select>
          </div>

          {/* RDD */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>
              Requested Delivery Date
            </label>
            <input
              type="date"
              value={rdd}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setRdd(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            />
          </div>

          {/* Mode override */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>
              Mode Override
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['', ...MODES] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setForcedMode(m as Mode | '')}
                  style={{
                    padding: '5px 10px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                    border: '1px solid',
                    borderColor: forcedMode === m ? (m ? MODE_COLORS[m] : '#2563eb') : '#d1d5db',
                    background: forcedMode === m ? (m ? MODE_COLORS[m] + '22' : '#eff6ff') : '#fff',
                    color: forcedMode === m ? (m ? MODE_COLORS[m] : '#2563eb') : '#6b7280',
                    cursor: 'pointer',
                  }}
                >
                  {m || 'Auto'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={run}
            disabled={loading || !materialCode}
            style={{
              padding: '7px 20px', borderRadius: 6, border: 'none',
              background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', height: 36,
            }}
          >
            {loading ? 'Computing…' : 'Optimise'}
          </button>
        </div>

        {/* Slider */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            <span>🌿 Sustainability</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{alphaLabel}</span>
            <span>💰 Cost Efficiency</span>
          </div>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={alpha}
            onChange={e => setAlpha(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#2563eb' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#d1d5db' }}>
            <span>α=0</span>
            <span>α=0.5</span>
            <span>α=1</span>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
              {result.material_code}
            </span>
            <span style={{ fontSize: 13, color: '#6b7280' }}>{result.material_name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280' }}>
              {result.routes.length} plant{result.routes.length !== 1 ? 's' : ''} evaluated
            </span>
            {result.green_potential_saving_pct > 0 && (
              <span style={{
                background: '#f0fdf4', border: '1px solid #86efac',
                borderRadius: 6, padding: '3px 10px', fontSize: 12, color: '#166534', fontWeight: 600,
              }}>
                🌿 {result.green_potential_saving_pct.toFixed(1)}% carbon saving available
              </span>
            )}
          </div>

          {/* AI Insight */}
          <div style={{
            background: '#f0f9ff', border: '1px solid #bae6fd',
            borderRadius: 8, padding: '12px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', marginBottom: 6 }}>
              AI Strategic Insight
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#0c4a6e', lineHeight: 1.6 }}>{result.ai_insight}</p>
          </div>

          {/* Route cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {result.routes.map(route => (
              <RouteCard
                key={route.plant}
                route={route}
                isRecommended={route.plant === result.recommended_plant}
              />
            ))}
          </div>
        </>
      )}

      {!result && !loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
          Select a material and click Optimise to compute the Green-Cost Index across all capable plants.
        </div>
      )}
    </div>
  );
}
