import { useEffect, useState } from 'react';
import { api } from './api/client';
import { Agent2Panel } from './components/Agent2Panel';
import { BottleneckAlert } from './components/BottleneckAlert';
import { CapacityChart } from './components/CapacityChart';
import { DataQualityBadge } from './components/DataQualityBadge';
import { FactorySelector } from './components/FactorySelector';
import { LoadingState } from './components/LoadingState';
import { ScenarioSelector } from './components/ScenarioSelector';
import type { AnalyzeResponse } from './types';

export default function App() {
  const [factories, setFactories] = useState<string[]>(['NW01']);
  const [scenarios, setScenarios] = useState<string[]>(['100_pct', 'probability_weighted', 'high_prob_only']);
  const [factory, setFactory] = useState('NW01');
  const [scenario, setScenario] = useState('probability_weighted');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.factories().then(r => setFactories(r.factories)).catch(() => {});
    api.scenarios().then(r => setScenarios(r.scenarios)).catch(() => {});
  }, []);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.analyze({ factory, scenario });
      setResult(res);
      setOffline(res.agent1_result.fallback && res.agent2_verdict.fallback);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
        Predictive Manufacturing
      </h1>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>
        Capacity planning & supply chain scenario analysis
      </p>

      {offline && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fbbf24',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>&#9888;</span>
          <span style={{ fontSize: 13, color: '#92400e' }}>
            <strong>OFFLINE MODE</strong> — live AI agents unavailable. Results computed by deterministic engine only.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
        <FactorySelector factories={factories} value={factory} onChange={setFactory} />
        <ScenarioSelector scenarios={scenarios} value={scenario} onChange={setScenario} />
        <button onClick={run} disabled={loading} style={btnStyle}>
          {loading ? 'Running…' : 'Run Analysis'}
        </button>
      </div>

      {loading && <LoadingState />}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {result.agent1_result.factory} · {result.agent1_result.period} · Overall utilization:{' '}
                <strong style={{ color: '#111827' }}>
                  {(result.agent1_result.capacity_utilization * 100).toFixed(1)}%
                </strong>
              </span>
            </div>
            <DataQualityBadge
              excludedRows={result.agent1_result.excluded_rows}
              flagCount={result.agent1_result.flag_count}
              reconstructedRows={result.agent1_result.reconstructed_rows}
            />
          </div>

          <CapacityChart data={result.per_work_center} />
          <BottleneckAlert result={result.agent1_result} />
          <Agent2Panel verdict={result.agent2_verdict} />
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '7px 20px',
  borderRadius: 6,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  height: 36,
};
