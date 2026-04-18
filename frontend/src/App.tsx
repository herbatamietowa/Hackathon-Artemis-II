import { useEffect, useState } from 'react';
import { api } from './api/client';
import { Agent2Panel } from './components/Agent2Panel';
import { BottleneckAlert } from './components/BottleneckAlert';
import { CapacityChart } from './components/CapacityChart';
import { DataQualityBadge } from './components/DataQualityBadge';
import { FactorySelector } from './components/FactorySelector';
import { LoadingState } from './components/LoadingState';
import { ScenarioSelector } from './components/ScenarioSelector';
import { SourcingPanel } from './components/SourcingPanel';
import type { AnalyzeResponse, SourcingResponse } from './types';

type Tab = 'capacity' | 'sourcing';

export default function App() {
  const [factories, setFactories] = useState<string[]>(['NW01']);
  const [scenarios, setScenarios] = useState<string[]>(['100_pct', 'probability_weighted', 'high_prob_only']);
  const [factory, setFactory] = useState('NW01');
  const [scenario, setScenario] = useState('probability_weighted');
  const [tab, setTab] = useState<Tab>('capacity');

  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [loadingSourcing, setLoadingSourcing] = useState(false);
  const [capacityResult, setCapacityResult] = useState<AnalyzeResponse | null>(null);
  const [sourcingResult, setSourcingResult] = useState<SourcingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.factories().then(r => setFactories(r.factories)).catch(() => {});
    api.scenarios().then(r => setScenarios(r.scenarios)).catch(() => {});
  }, []);

  const run = async () => {
    setError(null);
    if (tab === 'capacity') {
      setLoadingCapacity(true);
      try {
        const res = await api.analyze({ factory, scenario });
        setCapacityResult(res);
        setOffline(res.agent1_result.fallback && res.agent2_verdict.fallback);
      } catch (e) { setError(String(e)); }
      finally { setLoadingCapacity(false); }
    } else {
      setLoadingSourcing(true);
      try {
        const res = await api.sourcing({ factory, scenario });
        setSourcingResult(res);
      } catch (e) { setError(String(e)); }
      finally { setLoadingSourcing(false); }
    }
  };

  const loading = tab === 'capacity' ? loadingCapacity : loadingSourcing;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
        Predictive Manufacturing
      </h1>
      <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 14 }}>
        Capacity planning &amp; supply chain scenario analysis
      </p>

      {/* Offline banner */}
      {offline && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>&#9888;</span>
          <span style={{ fontSize: 13, color: '#92400e' }}>
            <strong>OFFLINE MODE</strong> — live AI agents unavailable. Results computed by deterministic engine only.
          </span>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <FactorySelector factories={factories} value={factory} onChange={setFactory} />
        <ScenarioSelector scenarios={scenarios} value={scenario} onChange={setScenario} />
        <button onClick={run} disabled={loading} style={btnStyle}>
          {loading ? 'Running…' : 'Run Analysis'}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
        <TabButton active={tab === 'capacity'} onClick={() => setTab('capacity')}>
          Capacity
        </TabButton>
        <TabButton active={tab === 'sourcing'} onClick={() => setTab('sourcing')}>
          Sourcing
        </TabButton>
      </div>

      {loading && <LoadingState />}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Capacity tab */}
      {tab === 'capacity' && capacityResult && !loadingCapacity && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {capacityResult.agent1_result.factory} · {capacityResult.agent1_result.period} · Overall utilization:{' '}
              <strong style={{ color: '#111827' }}>
                {(capacityResult.agent1_result.capacity_utilization * 100).toFixed(1)}%
              </strong>
            </span>
            <DataQualityBadge
              excludedRows={capacityResult.agent1_result.excluded_rows}
              flagCount={capacityResult.agent1_result.flag_count}
              reconstructedRows={capacityResult.agent1_result.reconstructed_rows}
            />
          </div>
          <CapacityChart data={capacityResult.per_work_center} />
          <BottleneckAlert result={capacityResult.agent1_result} />
          <Agent2Panel verdict={capacityResult.agent2_verdict} />
        </div>
      )}

      {/* Sourcing tab */}
      {tab === 'sourcing' && sourcingResult && !loadingSourcing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
            {sourcingResult.factory} · {sourcingResult.period} · {sourcingResult.scenario.replace('_', ' ')}
          </p>
          <SourcingPanel data={sourcingResult} />
        </div>
      )}

      {/* Empty state prompts */}
      {tab === 'capacity' && !capacityResult && !loading && !error && (
        <EmptyState text="Select a factory and scenario, then click Run Analysis." />
      )}
      {tab === 'sourcing' && !sourcingResult && !loading && !error && (
        <EmptyState text="Select a factory and scenario, then click Run Analysis to see raw material order schedule." />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 20px',
      border: 'none',
      borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
      marginBottom: -2,
      background: 'none',
      fontSize: 14,
      fontWeight: active ? 600 : 400,
      color: active ? '#2563eb' : '#6b7280',
      cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
      {text}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '7px 20px', borderRadius: 6, border: 'none',
  background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600,
  cursor: 'pointer', height: 36,
};
