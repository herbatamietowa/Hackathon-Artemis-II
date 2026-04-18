import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import type { WCLoad } from '../types';

interface Props {
  data: WCLoad[];
}

function barColor(utilization: number): string {
  if (utilization >= 0.95) return '#ef4444'; // red
  if (utilization >= 0.80) return '#f59e0b'; // amber
  return '#22c55e';                           // green
}

export function CapacityChart({ data }: Props) {
  const chartData = data.map(d => ({
    name: d.wc,
    utilization: Math.round(d.utilization * 1000) / 10, // percentage with 1dp
    available: d.available,
    demanded: d.demanded,
  }));

  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.1)' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#111827' }}>
        Work Center Utilization
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
          <YAxis domain={[0, 120]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v: number) => [`${v}%`, 'Utilization']}
            contentStyle={{ fontSize: 12 }}
          />
          <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '90% threshold', position: 'insideTopRight', fontSize: 11, fill: '#ef4444' }} />
          <Bar dataKey="utilization" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={barColor(entry.utilization / 100)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
