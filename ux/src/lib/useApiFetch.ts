"use client";

import { useState, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { apiTokenRequest } from "./authConfig";

export function useApiFetch() {
  const { instance } = useMsal();

  const apiFetch = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const account = instance.getActiveAccount();
      if (!account) throw new Error("No active account");

      const response = await instance.acquireTokenSilent({
        ...apiTokenRequest,
        account,
      });

      const res = await fetch(path, {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${response.accessToken}`,
        },
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      return res.json();
    },
    [instance]
  );

  return { apiFetch };
}
