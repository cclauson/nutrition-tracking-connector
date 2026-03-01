"use client";

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

export default function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-sm font-medium text-gray-900">{metric.name}</h3>
        {metric.unit && (
          <span className="text-xs text-gray-400">{metric.unit}</span>
        )}
      </div>
      {metric.entries.length === 0 ? (
        <p className="text-xs text-gray-400">No entries yet.</p>
      ) : (
        <ul className="space-y-1">
          {metric.entries.slice(0, 5).map((entry, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between text-sm"
            >
              <span className="text-gray-400 tabular-nums">{entry.date}</span>
              <span className="text-gray-700 font-medium tabular-nums">
                {metric.type === "checkin"
                  ? "done"
                  : entry.value ?? "-"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
