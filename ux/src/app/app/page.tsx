"use client";

import MsalAuthWrapper from "../../components/MsalAuthWrapper";
import DashboardShell from "../../components/dashboard/DashboardShell";
import MealList from "../../components/dashboard/MealList";
import MetricsSection from "../../components/dashboard/MetricsSection";

function DashboardContent() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
          Today
        </h1>
        <p className="text-sm text-gray-400 mt-1">{today}</p>
      </div>

      <MealList />

      <div className="mt-12">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Metrics</h2>
        <MetricsSection />
      </div>
    </DashboardShell>
  );
}

export default function AppPage() {
  return (
    <MsalAuthWrapper>
      <DashboardContent />
    </MsalAuthWrapper>
  );
}
