"use client";

interface Totals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

function SummaryCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 tracking-tight">
        {value}
        <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
      </p>
    </div>
  );
}

export function DailySummarySkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg border border-gray-200 p-5"
        >
          <div className="h-4 w-16 bg-gray-100 rounded animate-pulse mb-2" />
          <div className="h-7 w-20 bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function DailySummary({ totals }: { totals: Totals }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <SummaryCard label="Calories" value={totals.calories} unit="kcal" />
      <SummaryCard label="Protein" value={totals.protein} unit="g" />
      <SummaryCard label="Fat" value={totals.fat} unit="g" />
      <SummaryCard label="Carbs" value={totals.carbs} unit="g" />
    </div>
  );
}
