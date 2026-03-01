import { Configuration, LogLevel } from "@azure/msal-browser";

const clientId = process.env.NEXT_PUBLIC_AUTH_CLIENT_ID ?? "";
const authority = process.env.NEXT_PUBLIC_AUTH_AUTHORITY ?? "";

export function isAuthConfigured(): boolean {
  return clientId !== "" && authority !== "";
}

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    knownAuthorities: authority ? [new URL(authority).hostname] : [],
    redirectUri: typeof window !== "undefined" ? window.location.origin + "/app" : "/app",
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
    },
    iframeBridgeTimeout: 3000,
  },
};

export const loginRequest = {
  scopes: ["openid", "profile"],
};

const apiScope = process.env.NEXT_PUBLIC_API_SCOPE ?? "";

export const apiTokenRequest = {
  scopes: apiScope ? [apiScope] : [],
};
