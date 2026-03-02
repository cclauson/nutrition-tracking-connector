import { NextRequest } from "next/server";

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!authorization) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = req.nextUrl.searchParams.get("days") ?? "";
  const url = `${INTERNAL_API_URL}/api/dashboard/nutrition-history${days ? `?days=${days}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: authorization },
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
