"use client";

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

const badgeColors: Record<string, string> = {
  breakfast: "bg-amber-50 text-amber-700",
  lunch: "bg-blue-50 text-blue-700",
  dinner: "bg-violet-50 text-violet-700",
  snack: "bg-gray-100 text-gray-600",
};

export default function MealCard({ meal }: { meal: Meal }) {
  const time = new Date(meal.loggedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const badge = meal.timeOfDay ?? "snack";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${badgeColors[badge] ?? badgeColors.snack}`}
        >
          {badge}
        </span>
        <span className="text-xs text-gray-400">{time}</span>
        {meal.schemaName && (
          <span className="text-sm font-medium text-gray-700">
            {meal.schemaName}
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {meal.items.map((item, i) => (
          <li key={i} className="flex items-baseline justify-between text-sm">
            <span className="text-gray-700">
              {item.name ?? "Unnamed"}
              {item.quantity != null && (
                <span className="text-gray-400 ml-1">x{item.quantity}</span>
              )}
            </span>
            {item.calories != null && (
              <span className="text-gray-400 tabular-nums">
                {Math.round(item.calories)} cal
              </span>
            )}
          </li>
        ))}
      </ul>
      {meal.notes && (
        <p className="text-xs text-gray-400 mt-3">{meal.notes}</p>
      )}
    </div>
  );
}
