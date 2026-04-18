import { useEffect, useState } from 'react';
import { api } from './api/client';
import { Agent2Panel } from './components/Agent2Panel';
import { BottleneckAlert } from './components/BottleneckAlert';
import { CapacityChart } from './components/CapacityChart';
import { DataQualityBadge } from './components/DataQualityBadge';
import { DisasterPanel } from './components/DisasterPanel';
import { FactorySelector } from './components/FactorySelector';
import { LoadingState } from './components/LoadingState';
import { ProjectArchitect } from './components/ProjectArchitect';
import { ProjectSimulator } from './components/ProjectSimulator';
import { ReallocationBanner } from './components/ReallocationBanner';
import { ScenarioSelector } from './components/ScenarioSelector';
import { SourcingPanel } from './components/SourcingPanel';
import type { AnalyzeResponse, MaterialOption, SourcingResponse } from './types';

type Tab = 'project' | 'order' | 'pulse' | 'stream' | 'disaster';

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
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [plates, setPlates] = useState<MaterialOption[]>([]);
  const [factory, setFactory] = useState('NW01');
  const [scenario, setScenario] = useState('probability_weighted');
  const [tab, setTab] = useState<Tab>('project');

  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [loadingSourcing, setLoadingSourcing] = useState(false);
  const [capacityResult, setCapacityResult] = useState<AnalyzeResponse | null>(null);
  const [sourcingResult, setSourcingResult] = useState<SourcingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.factories().then(r => setFactories(r.factories)).catch(() => {});
    api.scenarios().then(r => setScenarios(r.scenarios)).catch(() => {});
    api.materials().then(r => setMaterials(r.materials)).catch(() => {});
    api.plates().then(r => setPlates(r.materials)).catch(() => {});
  }, []);

  // Auto-run capacity analysis whenever Factory Pulse tab is active and inputs change
  useEffect(() => {
    if (tab !== 'pulse') return;
    let cancelled = false;
    setLoadingCapacity(true);
    setError(null);
    api.analyze({ factory, scenario })
      .then(res => {
        if (cancelled) return;
        setCapacityResult(res);
        setOffline(res.agent1_result.fallback && res.agent2_verdict.fallback);
      })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoadingCapacity(false); });
    return () => { cancelled = true; };
  }, [factory, scenario, tab]);

  // Auto-run sourcing analysis whenever Supply Stream tab is active and inputs change
  useEffect(() => {
    if (tab !== 'stream') return;
    let cancelled = false;
    setLoadingSourcing(true);
    setError(null);
    api.sourcing({ factory, scenario })
      .then(res => { if (!cancelled) setSourcingResult(res); })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoadingSourcing(false); });
    return () => { cancelled = true; };
  }, [factory, scenario, tab]);

  const loading = tab === 'pulse' ? loadingCapacity : tab === 'stream' ? loadingSourcing : false;
  const hasResults = (tab === 'pulse' && !!capacityResult) || (tab === 'stream' && !!sourcingResult);
  const showControls = tab === 'pulse' || tab === 'stream';

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
        Project-level optimization &amp; supply chain scenario analysis
      </p>

      {/* Print-only header */}
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

      {/* Factory/Scenario controls — only on pulse and stream tabs */}
      {showControls && (
        <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
          <FactorySelector factories={factories} value={factory} onChange={setFactory} />
          <ScenarioSelector scenarios={scenarios} value={scenario} onChange={setScenario} />
          {loading && (
            <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center' }}>Updating…</span>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="no-print" style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
        <TabButton active={tab === 'project'} onClick={() => setTab('project')}>
          New Project
        </TabButton>
        <TabButton active={tab === 'order'} onClick={() => setTab('order')}>
          Order Materials
        </TabButton>
        <TabButton active={tab === 'pulse'} onClick={() => setTab('pulse')}>
          Factory Pulse
        </TabButton>
        <TabButton active={tab === 'stream'} onClick={() => setTab('stream')}>
          Supply Stream
        </TabButton>
        <TabButton active={tab === 'disaster'} onClick={() => setTab('disaster')} danger>
          Disruption Sim
        </TabButton>
      </div>

      {loading && <LoadingState />}

      {error && (
        <div className="no-print" style={{
          background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '12px 16px', color: '#991b1b', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* New Project (BOM explosion simulation) */}
      {tab === 'project' && <ProjectSimulator plates={plates} />}

      {/* Order Materials (GCI-based scenario optimiser) */}
      {tab === 'order' && <ProjectArchitect materials={materials} />}

      {/* Factory Pulse (capacity analysis — auto-loads) */}
      {capacityResult && !loadingCapacity && (
        <div
          className="print-section"
          style={{ display: tab === 'pulse' ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}
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
          {capacityResult.reallocation && (
            <ReallocationBanner reallocation={capacityResult.reallocation} />
          )}
          <Agent2Panel verdict={capacityResult.agent2_verdict} />
        </div>
      )}

      {/* Supply Stream (sourcing analysis — auto-loads) */}
      {sourcingResult && !loadingSourcing && (
        <div
          className="print-section"
          style={{ display: tab === 'stream' ? 'flex' : 'none', flexDirection: 'column', gap: 12 }}
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

      {/* Disruption Sim */}
      {tab === 'disaster' && <DisasterPanel factories={factories} scenarios={scenarios} />}
    </div>
  );
}

function TabButton({ active, onClick, children, danger }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const accent = danger ? '#dc2626' : '#2563eb';
  return (
    <button onClick={onClick} style={{
      padding: '8px 18px',
      border: 'none',
      borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
      marginBottom: -2,
      background: 'none',
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      color: active ? accent : '#6b7280',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </button>
  );
}

const printBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
  background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
};
