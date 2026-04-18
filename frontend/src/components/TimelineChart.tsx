import {
  Area,
  AreaChart,
  CartesianGrid,
  Dot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimelinePoint } from '../types';

interface Props {
  points: TimelinePoint[];
  loading?: boolean;
  error?: boolean;
}

interface ChartPoint {
  period: string;
  util: number;
  bottleneck: boolean;
  available: number;
  demanded: number;
}

function BottleneckDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload?.bottleneck) return null;
  return <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d: ChartPoint = payload[0]?.payload;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
      padding: '10px 14px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,.1)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#111827' }}>{label}</div>
      <div style={{ color: d.util >= 90 ? '#ef4444' : d.util >= 80 ? '#f59e0b' : '#22c55e' }}>
        Utilization: <strong>{d.util.toFixed(1)}%</strong>
      </div>
      <div style={{ color: '#6b7280', marginTop: 2 }}>Available: {d.available.toFixed(0)} h</div>
      <div style={{ color: '#6b7280' }}>Demanded: {d.demanded.toFixed(0)} h</div>
      {d.bottleneck && (
        <div style={{ color: '#ef4444', marginTop: 4, fontWeight: 600 }}>⚠ Bottleneck detected</div>
      )}
    </div>
  );
}

export function TimelineChart({ points, loading, error }: Props) {
  const placeholder = (msg: string) => (
    <div style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.1)', minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#9ca3af', fontSize: 13 }}>{msg}</span>
    </div>
  );

  if (loading) return placeholder('Loading 36-month capacity forecast…');
  if (error)   return placeholder('Could not load timeline — check backend connection.');
  if (!points.length) return placeholder('No timeline data available for this factory/scenario.');

  const chartData: ChartPoint[] = points.map(p => ({
    period: p.period,
    util: Math.round(p.capacity_utilization * 1000) / 10,
    bottleneck: p.bottleneck_detected,
    available: p.available_hours,
    demanded: p.demanded_hours,
  }));

  const bottleneckCount = chartData.filter(p => p.bottleneck).length;
  const maxUtil = Math.max(...chartData.map(p => p.util));

  // Show every 3rd label to avoid crowding
  const tickFormatter = (_: string, index: number) =>
    index % 3 === 0 ? chartData[index]?.period ?? '' : '';

  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>
          36-Month Capacity Forecast
        </h3>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#6b7280' }}>
          <span>Peak: <strong style={{ color: maxUtil >= 90 ? '#ef4444' : '#111827' }}>{maxUtil.toFixed(1)}%</strong></span>
          {bottleneckCount > 0 && (
            <span style={{ color: '#ef4444', fontWeight: 600 }}>
              ⚠ {bottleneckCount} bottleneck month{bottleneckCount !== 1 ? 's' : ''}
            </span>
          )}
          {bottleneckCount === 0 && (
            <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ No bottlenecks forecast</span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="utilGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 10 }}
            tickFormatter={tickFormatter}
            interval={0}
          />
          <YAxis
            domain={[0, Math.max(120, Math.ceil(maxUtil / 10) * 10 + 10)]}
            tickFormatter={v => `${v}%`}
            tick={{ fontSize: 11 }}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={90}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: '90% threshold', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }}
          />
          <Area
            type="monotone"
            dataKey="util"
            stroke="#2563eb"
            strokeWidth={2}
            fill="url(#utilGradient)"
            dot={<BottleneckDot />}
            activeDot={{ r: 4, fill: '#2563eb' }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          Bottleneck month
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 24, height: 2, background: '#ef4444', display: 'inline-block', opacity: 0.6 }} />
          90% threshold
        </span>
      </div>
    </div>
  );
}
