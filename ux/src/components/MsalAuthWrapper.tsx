"use client";

import { useEffect, useState, ReactNode } from "react";
import {
  PublicClientApplication,
  EventType,
  AuthenticationResult,
  InteractionStatus,
} from "@azure/msal-browser";
import { MsalProvider, useMsal, useIsAuthenticated } from "@azure/msal-react";
import { msalConfig, loginRequest, isAuthConfigured } from "../lib/authConfig";

function AuthenticatedContent({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (!isAuthenticated && accounts.length === 0 && inProgress === InteractionStatus.None) {
      instance.ssoSilent(loginRequest).catch(() => {
        instance.loginRedirect(loginRequest);
      });
    }
  }, [isAuthenticated, accounts, instance, inProgress]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-gray-600">Signing in...</p>
      </div>
    );
  }

  return <>{children}</>;
}

export default function MsalAuthWrapper({ children }: { children: ReactNode }) {
  const [msalInstance, setMsalInstance] = useState<PublicClientApplication | null>(null);

  useEffect(() => {
    if (!isAuthConfigured()) return;

    const instance = new PublicClientApplication(msalConfig);
    instance.initialize().then(() => {
      instance.handleRedirectPromise().then((response: AuthenticationResult | null) => {
        if (response) {
          instance.setActiveAccount(response.account);
        } else {
          const accounts = instance.getAllAccounts();
          if (accounts.length > 0) {
            instance.setActiveAccount(accounts[0]);
          }
        }
        setMsalInstance(instance);
      });

      instance.addEventCallback((event) => {
        if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
          const payload = event.payload as AuthenticationResult;
          instance.setActiveAccount(payload.account);
        }
      });
    });
  }, []);

  if (!isAuthConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Authentication Not Configured</h2>
          <p className="text-gray-600">
            The authentication provider has not been set up for this environment.
          </p>
        </div>
      </div>
    );
  }

  if (!msalInstance) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <MsalProvider instance={msalInstance}>
      <AuthenticatedContent>{children}</AuthenticatedContent>
    </MsalProvider>
  );
}
