"use client";

import { useEffect, useState } from "react";
import { useApiFetch } from "../../lib/useApiFetch";
import MetricCard from "./MetricCard";

interface MetricEntry {
  date: string;
  value: number | null;
  timestamp: string;
}

interface Metric {
  id: string;
  name: string;
  unit: string | null;
  type: string;
  entries: MetricEntry[];
}

interface MetricsResponse {
  days: number;
  metrics: Metric[];
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg border border-gray-200 p-5"
        >
          <div className="h-4 w-20 bg-gray-100 rounded animate-pulse mb-3" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MetricsSection() {
  const { apiFetch } = useApiFetch();
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<MetricsResponse>("/api/dashboard/metrics")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiFetch]);

  if (loading) return <MetricsSkeleton />;

  if (!data || data.metrics.length === 0) {
    return <p className="text-sm text-gray-400">No metrics tracked yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} />
      ))}
    </div>
  );
}
