"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useApiFetch } from "../../lib/useApiFetch";

interface DayPoint {
  date: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface NutritionHistoryResponse {
  days: number;
  series: DayPoint[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDay(date: string) {
  const d = new Date(date + "T12:00:00Z");
  return DAY_NAMES[d.getUTCDay()];
}

export function NutritionChartSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-4" />
      <div className="h-[200px] bg-gray-50 rounded animate-pulse" />
    </div>
  );
}

export default function NutritionChart() {
  const { apiFetch } = useApiFetch();
  const [data, setData] = useState<NutritionHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<NutritionHistoryResponse>("/api/dashboard/nutrition-history?days=7")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiFetch]);

  if (loading) return <NutritionChartSkeleton />;

  const hasData = data?.series.some((d) => d.calories > 0 || d.protein > 0);
  if (!data || !hasData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-900 mb-2">7-Day Trend</h3>
        <p className="text-xs text-gray-400">No nutrition data in the past 7 days.</p>
      </div>
    );
  }

  const chartData = data.series.map((d) => ({
    ...d,
    label: formatDay(d.date),
  }));

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-sm font-medium text-gray-900 mb-4">7-Day Trend</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="calories"
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <YAxis
            yAxisId="protein"
            orientation="right"
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />
          <Line
            yAxisId="calories"
            type="monotone"
            dataKey="calories"
            stroke="#14b8a6"
            strokeWidth={2}
            dot={false}
            name="Calories (kcal)"
          />
          <Line
            yAxisId="protein"
            type="monotone"
            dataKey="protein"
            stroke="#6b7280"
            strokeWidth={2}
            dot={false}
            name="Protein (g)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
