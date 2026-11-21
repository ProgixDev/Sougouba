'use client';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { DailyPoint } from '@/lib/api/stats';
import { ChartTooltip } from './ChartTooltip';
import { formatCad, formatDate } from '@/lib/format';

/** Translucent, so the grid stays quiet on the light and the dark theme alike. */
const GRID = 'rgba(138, 129, 117, 0.22)';
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
          content={
            <ChartTooltip
              formatLabel={(d) => formatDate(String(d))}
              formatValue={(v, name) => (name === 'gmv' ? formatCad(v) : String(v))}
              name={(n) => (n === 'gmv' ? 'Volume' : 'Commandes')}
            />
          }
        />
        <Line type="monotone" dataKey="gmv" stroke="#246B47" strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
