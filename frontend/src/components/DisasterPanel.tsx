import { useState } from 'react';
import { api } from '../api/client';
import type { DisasterAlternative, DisasterResult } from '../types';

interface Props {
  factories: string[];
  scenarios: string[];
}

function UtilBar({ before, after }: { before: number; after: number }) {
  const pct = (v: number) => Math.min(v * 100, 100).toFixed(0);
  const color = (v: number) => v >= 1 ? '#ef4444' : v >= 0.9 ? '#f97316' : '#22c55e';
  return (
    <div style={{ width: 120 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>
        <span>Before</span><span>After</span>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct(before)}%`, height: '100%', background: color(before), borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 9, color: '#9ca3af' }}>→</span>
        <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct(after)}%`, height: '100%', background: color(after), borderRadius: 3 }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#374151', marginTop: 2 }}>
        <span>{(before * 100).toFixed(0)}%</span>
        <span style={{ color: after >= 1 ? '#ef4444' : '#374151', fontWeight: after >= 1 ? 700 : 400 }}>
          {after > 9 ? '>900%' : `${(after * 100).toFixed(0)}%`}
        </span>
      </div>
    </div>
  );
}

function DeltaPill({ value, unit, label }: { value: number; unit: string; label: string }) {
  const color = value > 10 ? '#ef4444' : value < -5 ? '#22c55e' : '#6b7280';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}{unit}
      </div>
    </div>
  );
}

function AlternativeCard({ alt }: { alt: DisasterAlternative }) {
  const overloaded = alt.overloaded;
  return (
    <div style={{
      border: `1px solid ${overloaded ? '#fca5a5' : '#e5e7eb'}`,
      background: overloaded ? '#fff5f5' : '#fff',
      borderRadius: 8, padding: '12px 16px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
    }}>
      <div style={{ minWidth: 180 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{alt.plant}</span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{alt.plant_name}</span>
          {overloaded && (
            <span style={{ fontSize: 10, fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>
              WOULD OVERLOAD
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
          {alt.materials_coverable}/{alt.total_offline_materials} materials ({alt.coverage_pct.toFixed(0)}% compatible)
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Headroom</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{alt.capacity_headroom_hours.toFixed(0)}h</div>
        </div>
        <UtilBar before={alt.current_utilization} after={alt.projected_utilization} />
        <DeltaPill value={alt.cost_delta_pct}            unit="%" label="Cost Δ" />
        <DeltaPill value={alt.transport_lt_delta_days}   unit="d" label="LT Δ" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Grid</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: alt.grid_intensity > 0.5 ? '#f97316' : alt.grid_intensity < 0.3 ? '#22c55e' : '#6b7280' }}>
            {alt.grid_intensity.toFixed(2)}
          </div>
        </div>
        <DeltaPill value={alt.carbon_delta_pct} unit="%" label="CO₂ Δ" />
      </div>
    </div>
  );
}

export function DisasterPanel({ factories, scenarios }: Props) {
  const [offlineFactory, setOfflineFactory] = useState(factories[0] ?? 'NW01');
  const [scenario, setScenario] = useState('probability_weighted');
  const [duration, setDuration] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DisasterResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.disaster({ offline_factory: offlineFactory, scenario, duration_months: duration });
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const coverageColor = !result ? '#6b7280'
    : result.network_coverage_pct >= 100 ? '#22c55e'
    : result.network_coverage_pct >= 60  ? '#f59e0b'
    : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Warning header */}
      <div style={{
        background: '#fff5f5', border: '1px solid #fca5a5',
        borderRadius: 8, padding: '12px 16px',
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <span style={{ fontSize: 22 }}>🔴</span>
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: '#991b1b', fontSize: 14 }}>Disruption Scenario Simulator</p>
          <p style={{ margin: 0, fontSize: 13, color: '#7f1d1d' }}>
            Model the impact of a factory going offline and see how the rest of the network responds.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Offline factory */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>
              Offline Factory
            </label>
            <select
              value={offlineFactory}
              onChange={e => setOfflineFactory(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              {factories.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Scenario */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>
              Demand Scenario
            </label>
            <select
              value={scenario}
              onChange={e => setScenario(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              {scenarios.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {/* Duration */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>
              Outage Duration — <strong style={{ color: '#111827' }}>{duration} month{duration > 1 ? 's' : ''}</strong>
            </label>
            <input
              type="range" min={1} max={12} step={1} value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#ef4444' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#d1d5db' }}>
              <span>1 month</span><span>12 months</span>
            </div>
          </div>

          <button
            onClick={run}
            disabled={loading}
            style={{
              padding: '7px 20px', borderRadius: 6, border: 'none',
              background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', height: 36,
            }}
          >
            {loading ? 'Simulating…' : 'Simulate'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <SummaryCard
              label="Displaced Demand"
              value={`${result.displaced_hours.toFixed(0)}h`}
              sub={`over ${result.duration_months} month${result.duration_months > 1 ? 's' : ''}`}
              color="#374151"
            />
            <SummaryCard
              label="Network Coverage"
              value={`${result.network_coverage_pct.toFixed(0)}%`}
              sub={result.network_coverage_pct >= 100 ? 'fully absorbable' : `${result.unabsorbable_hours.toFixed(0)}h unserviceable`}
              color={coverageColor}
            />
            <SummaryCard
              label="Alternatives Found"
              value={String(result.alternatives.length)}
              sub={`${result.alternatives.filter(a => !a.overloaded).length} without overloading`}
              color="#2563eb"
            />
          </div>

          {/* Coverage bar */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Network absorption capacity</span>
              <span style={{ color: coverageColor, fontWeight: 700 }}>{result.network_coverage_pct.toFixed(0)}%</span>
            </div>
            <div style={{ height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(result.network_coverage_pct, 100)}%`,
                height: '100%', borderRadius: 5, background: coverageColor,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>

          {/* AI Insight */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', marginBottom: 6 }}>
              Network Analysis
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#0c4a6e', lineHeight: 1.6 }}>{result.ai_insight}</p>
          </div>

          {/* Alternative cards */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
              Alternative plants (ranked by available headroom)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.alternatives.map(alt => (
                <AlternativeCard key={alt.plant} alt={alt} />
              ))}
            </div>
          </div>
        </>
      )}

      {!result && !loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
          Select a factory, scenario, and outage duration, then click Simulate.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 8, padding: '12px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
