import { useEffect, useState } from 'react';
import { api } from './api/client';
import { DebatePanel } from './components/DebatePanel';
import { Agent2Panel } from './components/Agent2Panel';
import { BottleneckAlert } from './components/BottleneckAlert';
import { CapacityChart } from './components/CapacityChart';
import { DataQualityBadge } from './components/DataQualityBadge';
import { FactorySelector } from './components/FactorySelector';
import { GCIPanel } from './components/GCIPanel';
import { LoadingState } from './components/LoadingState';
import { ScenarioSelector } from './components/ScenarioSelector';
import { SourcingPanel } from './components/SourcingPanel';
import type { AnalyzeResponse, SourcingResponse } from './types';



type Tab = 'capacity' | 'sourcing' | 'gci';
const PRINT_STYLES = `
@media print {
  .no-print { display: none !important; }
  .print-section { display: flex !important; flex-direction: column; gap: 16px; }
  .print-section + .print-section { margin-top: 32px; page-break-before: always; }
  .print-header { display: block !important; }
  @page { margin: 18mm 14mm; }
}
@media screen {
  .print-header { display: none; }
}
`;


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
  const [userArgument, setUserArgument] = useState('');

  useEffect(() => {
    api.factories().then(r => setFactories(r.factories)).catch(() => {});
    api.scenarios().then(r => setScenarios(r.scenarios)).catch(() => {});
  }, []);

  const run = async () => {
    setError(null);
    if (tab === 'capacity') {
      setLoadingCapacity(true);
      try {
        const res = await api.analyze({ factory, scenario, user_argument: userArgument });
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

  const loading = tab === 'capacity' ? loadingCapacity : tab === 'sourcing' ? loadingSourcing : false;
  
  const hasResults = capacityResult || sourcingResult;

  const handlePrint = () => {
    const date = new Date().toISOString().slice(0, 10);
    const prev = document.title;

    document.title = `${factory}_${scenario}_${date}`;

    const restoreTitle = () => {
      document.title = prev;
      window.removeEventListener('afterprint', restoreTitle);
    };

    window.addEventListener('afterprint', restoreTitle);

    window.print();
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
          Predictive Manufacturing
        </h1>
        {hasResults && (
          <button onClick={handlePrint} className="no-print" style={printBtnStyle} title="Download PDF">
            &#128438; Print / Save PDF
          </button>
        )}
      </div>
      <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 14 }}>
        Capacity planning &amp; supply chain scenario analysis
      </p>

      {/* Print-only header with metadata */}
      <div className="print-header" style={{ marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
          <strong>Factory:</strong> {factory} &nbsp;·&nbsp;
          <strong>Scenario:</strong> {scenario.replace(/_/g, ' ')} &nbsp;·&nbsp;
          <strong>Generated:</strong> {new Date().toLocaleString()}
        </p>
      </div>

      {/* Offline banner */}
      {offline && (
        <div className="no-print" style={{
          background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>&#9888;</span>
          <span style={{ fontSize: 13, color: '#92400e' }}>
            <strong>OFFLINE MODE</strong> — live AI agents unavailable. Results computed by deterministic engine only.
          </span>
        </div>
      )}

      {/* Controls — hidden on GCI tab (it has its own controls) */}
      {tab !== 'gci' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <FactorySelector factories={factories} value={factory} onChange={setFactory} />
            <ScenarioSelector scenarios={scenarios} value={scenario} onChange={setScenario} />
            <button onClick={run} disabled={loading} style={btnStyle}>
              {loading ? 'Running…' : 'Run Analysis'}
            </button>
          </div>
          <textarea
            value={userArgument}
            onChange={(e) => setUserArgument(e.target.value)}
            placeholder="Optional: add a user argument or specific consideration for the debate"
            style={{
              width: '100%',
              minHeight: 80,
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 13,
              resize: 'vertical',
            }}
          />
        </div>
      )}

      {/* Tab bar */}
      <div className="no-print" style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
        <TabButton active={tab === 'capacity'} onClick={() => setTab('capacity')}>
          Capacity
        </TabButton>
        <TabButton active={tab === 'sourcing'} onClick={() => setTab('sourcing')}>
          Sourcing
        </TabButton>
        <TabButton active={tab === 'gci'} onClick={() => setTab('gci')}>
          GCI Optimiser
        </TabButton>
      </div>

      {loading && <LoadingState />}

      {error && (
        <div className="no-print" style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Capacity section — visible on screen only when tab=capacity; always visible in print */}
      {capacityResult && !loadingCapacity && (
        <div
          className="print-section"
          style={{ display: tab === 'capacity' ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              <strong style={{ color: '#111827', fontSize: 15 }}>Capacity Analysis</strong>
              {' — '}
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
          <DebatePanel debateHistory={capacityResult.debate_history} status={capacityResult.status} />
        </div>
      )}

      {/* Sourcing section — visible on screen only when tab=sourcing; always visible in print */}
      {sourcingResult && !loadingSourcing && (
        <div
          className="print-section"
          style={{ display: tab === 'sourcing' ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Sourcing Analysis</span>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {sourcingResult.factory} · {sourcingResult.period} · {sourcingResult.scenario.replace(/_/g, ' ')}
            </span>
          </div>
          <SourcingPanel data={sourcingResult} />
        </div>
      )}

      {/* GCI tab */}
      {tab === 'gci' && <GCIPanel />}

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

const printBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
  background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
};
