"use client";

import { ReactNode } from "react";
import { useMsal } from "@azure/msal-react";

export default function DashboardShell({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const name = accounts[0]?.name ?? accounts[0]?.username ?? "";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-lg font-semibold text-accent-700 tracking-tight">
            Intake
          </span>
          <div className="flex items-center gap-4">
            {name && (
              <span className="text-sm text-gray-500">{name}</span>
            )}
            <button
              onClick={() =>
                instance.logoutRedirect({ postLogoutRedirectUri: "/" })
              }
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
