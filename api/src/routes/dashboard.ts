import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const macroFields = ['calories', 'protein', 'fat', 'carbs', 'fiber', 'sugar', 'sodium'] as const;

export function createDashboardRouter(prisma: PrismaClient): Router {
  const router = Router();

  // GET /api/dashboard/meals?date=YYYY-MM-DD
  router.get('/meals', async (req, res) => {
    const userId = (req as any).auth?.payload?.sub;
    if (!userId) return res.status(401).json({ error: 'Missing user identity' });

    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const dayStart = new Date(date + 'T00:00:00.000Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');

    const entries = await prisma.mealLogEntry.findMany({
      where: {
        userId,
        loggedAt: { gte: dayStart, lte: dayEnd },
      },
      include: {
        items: true,
        mealSchema: { select: { name: true } },
      },
      orderBy: { loggedAt: 'asc' },
    });

    const totals: Record<string, number> = {};
    const meals = entries.map(entry => {
      const items = entry.items.map(item => {
        for (const field of macroFields) {
          const val = item[field];
          if (val != null) {
            totals[field] = (totals[field] ?? 0) + val;
          }
        }
        return {
          name: item.name,
          quantity: item.quantity,
          calories: item.calories,
          protein: item.protein,
          fat: item.fat,
          carbs: item.carbs,
        };
      });

      return {
        id: entry.id,
        loggedAt: entry.loggedAt.toISOString(),
        timeOfDay: entry.timeOfDay,
        schemaName: entry.mealSchema?.name ?? null,
        notes: entry.notes,
        items,
      };
    });

    res.json({
      date,
      meals,
      totals: {
        calories: totals.calories != null ? Math.round(totals.calories) : 0,
        protein: totals.protein != null ? Math.round(totals.protein * 10) / 10 : 0,
        fat: totals.fat != null ? Math.round(totals.fat * 10) / 10 : 0,
        carbs: totals.carbs != null ? Math.round(totals.carbs * 10) / 10 : 0,
        fiber: totals.fiber != null ? Math.round(totals.fiber * 10) / 10 : 0,
        sugar: totals.sugar != null ? Math.round(totals.sugar * 10) / 10 : 0,
        sodium: totals.sodium != null ? Math.round(totals.sodium) : 0,
      },
    });
  });

  // GET /api/dashboard/metrics?days=7
  router.get('/metrics', async (req, res) => {
    const userId = (req as any).auth?.payload?.sub;
    if (!userId) return res.status(401).json({ error: 'Missing user identity' });

    const days = parseInt(req.query.days as string) || 7;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const metrics = await prisma.metric.findMany({
      where: { userId },
      include: {
        entries: {
          where: { date: { gte: fromDate } },
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      days,
      metrics: metrics.map(m => ({
        id: m.id,
        name: m.name,
        unit: m.unit,
        resolution: m.resolution,
        type: m.type,
        entries: m.entries.map(e => ({
          date: e.date.slice(0, 10),
          value: e.value,
          timestamp: e.timestamp.toISOString(),
        })),
      })),
    });
  });

  // GET /api/dashboard/nutrition-history?days=7
  router.get('/nutrition-history', async (req, res) => {
    const userId = (req as any).auth?.payload?.sub;
    if (!userId) return res.status(401).json({ error: 'Missing user identity' });

    const days = Math.min(parseInt(req.query.days as string) || 7, 90);
    const now = new Date();
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const rangeStart = new Date(dates[0] + 'T00:00:00.000Z');
    const rangeEnd = new Date(dates[dates.length - 1] + 'T23:59:59.999Z');

    const entries = await prisma.mealLogEntry.findMany({
      where: {
        userId,
        loggedAt: { gte: rangeStart, lte: rangeEnd },
      },
      include: { items: true },
    });

    const buckets: Record<string, { calories: number; protein: number; fat: number; carbs: number }> = {};
    for (const date of dates) {
      buckets[date] = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    }

    for (const entry of entries) {
      const date = entry.loggedAt.toISOString().slice(0, 10);
      const bucket = buckets[date];
      if (!bucket) continue;
      for (const item of entry.items) {
        if (item.calories != null) bucket.calories += item.calories;
        if (item.protein != null) bucket.protein += item.protein;
        if (item.fat != null) bucket.fat += item.fat;
        if (item.carbs != null) bucket.carbs += item.carbs;
      }
    }

    const series = dates.map(date => ({
      date,
      calories: Math.round(buckets[date].calories),
      protein: Math.round(buckets[date].protein * 10) / 10,
      fat: Math.round(buckets[date].fat * 10) / 10,
      carbs: Math.round(buckets[date].carbs * 10) / 10,
    }));

    res.json({ days, series });
  });

  return router;
}
