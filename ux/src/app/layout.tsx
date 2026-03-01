import type { Metadata } from "next";
import "./globals.css";
import AppInsightsProvider from "../components/AppInsightsProvider";

export const metadata: Metadata = {
  title: "Intake",
  description: "Track nutrition through conversation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppInsightsProvider />
        {children}
      </body>
    </html>
  );
}
