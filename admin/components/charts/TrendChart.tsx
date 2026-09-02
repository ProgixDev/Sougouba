'use client';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { DailyPoint } from '@/lib/api/stats';
import { formatCad, formatDate } from '@/lib/format';

const GRID = '#E2DED7';
const AXIS = '#8A8175';

export function TrendChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDate(d).replace(/ \d{4}$/, '')}
          tick={{ fontSize: 11, fill: AXIS }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tickFormatter={(v: number) => formatCad(v).replace(',00', '')}
          tick={{ fontSize: 11, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip
          formatter={(value: number, name: string) => [name === 'gmv' ? formatCad(value) : value, name === 'gmv' ? 'GMV' : 'Commandes']}
          labelFormatter={(d: string) => formatDate(d)}
          contentStyle={{ borderRadius: 12, border: '1px solid #E2DED7', fontSize: 12.5 }}
        />
        <Line type="monotone" dataKey="gmv" stroke="#246B47" strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
