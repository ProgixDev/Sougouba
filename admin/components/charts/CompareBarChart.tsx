'use client';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import { formatCad } from '@/lib/format';

const AXIS = '#8A8175';
const GRID = '#E2DED7';
const COLORS = ['#246B47', '#BF5122', '#D89A1E', '#82BE9C', '#E67D48', '#F4DD8C'];

export function CompareBarChart({ data }: { data: { name: string; revenueCad: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={(v: number) => formatCad(v).replace(',00', '')} tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11.5, fill: AXIS }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value: number) => formatCad(value)} contentStyle={{ borderRadius: 12, border: '1px solid #E2DED7', fontSize: 12.5 }} />
        <Bar dataKey="revenueCad" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
