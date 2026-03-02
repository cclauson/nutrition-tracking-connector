"use client";

import { useEffect, useState } from "react";
import { useApiFetch } from "../../lib/useApiFetch";
import MealCard from "./MealCard";
import DailySummary, { DailySummarySkeleton } from "./DailySummary";
import NutritionChart, { NutritionChartSkeleton } from "./NutritionChart";

interface MealItem {
  name: string | null;
  quantity: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

interface Meal {
  id: string;
  loggedAt: string;
  timeOfDay: string | null;
  schemaName: string | null;
  notes: string | null;
  items: MealItem[];
}

interface MealsResponse {
  date: string;
  meals: Meal[];
  totals: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  };
}

export function MealListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg border border-gray-200 p-5"
        >
          <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-3" />
          <div className="space-y-2">
            <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-36 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MealList() {
  const { apiFetch } = useApiFetch();
  const [data, setData] = useState<MealsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<MealsResponse>("/api/dashboard/meals")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiFetch]);

  if (loading) {
    return (
      <>
        <DailySummarySkeleton />
        <div className="mt-6">
          <NutritionChartSkeleton />
        </div>
        <div className="mt-8">
          <MealListSkeleton />
        </div>
      </>
    );
  }

  if (!data || data.meals.length === 0) {
    return (
      <>
        <DailySummary
          totals={{ calories: 0, protein: 0, fat: 0, carbs: 0 }}
        />
        <div className="mt-6">
          <NutritionChart />
        </div>
        <p className="text-sm text-gray-400 mt-8">No meals logged today.</p>
      </>
    );
  }

  return (
    <>
      <DailySummary totals={data.totals} />
      <div className="mt-6">
        <NutritionChart />
      </div>
      <div className="mt-8 space-y-4">
        {data.meals.map((meal) => (
          <MealCard key={meal.id} meal={meal} />
        ))}
      </div>
    </>
  );
}
