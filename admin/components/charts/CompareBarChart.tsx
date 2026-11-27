'use client';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import { formatCad } from '@/lib/format';
import { ChartTooltip } from './ChartTooltip';
import { useLocale } from '@/lib/i18n';

const AXIS = '#8A8175';
/** Translucent, so the grid stays quiet on the light and the dark theme alike. */
const GRID = 'rgba(138, 129, 117, 0.22)';
const COLORS = ['#246B47', '#BF5122', '#D89A1E', '#82BE9C', '#E67D48', '#F4DD8C'];

export function CompareBarChart({ data }: { data: { name: string; revenueCad: number }[] }) {
  useLocale();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => formatCad(v).replace(',00', '')} tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11.5, fill: AXIS }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(53,135,92,0.12)' }} content={<ChartTooltip formatValue={(v) => formatCad(v)} />} />
        <Bar dataKey="revenueCad" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
