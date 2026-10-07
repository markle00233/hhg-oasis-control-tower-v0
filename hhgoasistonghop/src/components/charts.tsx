"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export function DonutProgress({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const data = [
    { name: "done", value: Math.min(value, total) },
    { name: "rest", value: Math.max(total - value, 0.0001) },
  ];
  return (
    <div className="relative h-24 w-24">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={32}
            outerRadius={44}
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
          >
            <Cell fill="#111827" />
            <Cell fill="#e5e7eb" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold">
        {label ?? `${pct}%`}
      </div>
    </div>
  );
}

export function WeeklyStackedBars({
  data,
}: {
  data: { day: string; checkin: number; membership: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} barCategoryGap="35%">
          <CartesianGrid vertical={false} stroke="#f3f4f6" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #ececef",
              boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            }}
          />
          <Bar dataKey="checkin" stackId="a" fill="#111827" radius={[0, 0, 0, 0]} />
          <Bar dataKey="membership" stackId="a" fill="#9ca3af" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalAllocBars({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.name}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-[#6b7280]">{d.name}</span>
            <span className="font-medium text-[#111827]">{d.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#f3f4f6]">
            <div
              className="h-full rounded-full bg-[#111827]"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
