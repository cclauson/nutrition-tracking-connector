import { Router, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { createEntraAuthProvider } from './auth/entra-auth.js';

function getUserId(extra: any): string {
  const sub = extra?.authInfo?.extra?.sub;
  if (!sub) throw new Error('Missing user identity');
  return sub as string;
}

function createMcpServer(prisma: PrismaClient): McpServer {
  const server = new McpServer({
    name: 'nutrition-tracking-mcp',
    version: '1.0.0',
  });

  const macroFields = ['calories', 'protein', 'fat', 'carbs', 'fiber', 'sugar', 'sodium'] as const;

  // =====================
  // Food library (NutritionalDataItem CRUD)
  // =====================

  // --- create_food ---
  server.tool(
    'create_food',
    'Add a food item to your library with nutritional data per base unit',
    {
      name: z.string().describe('Food name (e.g. "Chicken Breast")'),
      baseUnit: z.string().describe('What one unit means (e.g. "1 oz", "1 medium apple")'),
      defaultServings: z.array(z.string()).optional().describe('Common serving sizes (e.g. ["16 oz (1 lb)"])'),
      calories: z.number().optional().describe('Calories per base unit'),
      protein: z.number().optional().describe('Protein in grams per base unit'),
      fat: z.number().optional().describe('Fat in grams per base unit'),
      carbs: z.number().optional().describe('Carbs in grams per base unit'),
      fiber: z.number().optional().describe('Fiber in grams per base unit'),
      sugar: z.number().optional().describe('Sugar in grams per base unit'),
      sodium: z.number().optional().describe('Sodium in milligrams per base unit'),
      source: z.enum(['verified', 'estimated', 'unknown']).optional().describe('Data quality source'),
    },
    async ({ name, baseUnit, defaultServings, calories, protein, fat, carbs, fiber, sugar, sodium, source }, extra) => {
      const userId = getUserId(extra);
      try {
        const food = await prisma.nutritionalDataItem.create({
          data: { userId, name, baseUnit, defaultServings: defaultServings ?? [], calories, protein, fat, carbs, fiber, sugar, sodium, source },
        });
        const macros = [calories != null ? `${calories} cal` : null, protein != null ? `${protein}g protein` : null, fat != null ? `${fat}g fat` : null, carbs != null ? `${carbs}g carbs` : null].filter(Boolean).join(', ');
        return { content: [{ type: 'text' as const, text: `Created food "${food.name}" (per ${food.baseUnit})${macros ? `: ${macros}` : ''}` }] };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return { content: [{ type: 'text' as const, text: `A food named "${name}" already exists.` }], isError: true };
        }
        throw err;
      }
    },
  );

  // --- update_food ---
  server.tool(
    'update_food',
    'Update an existing food item in your library',
    {
      name: z.string().describe('Food name to update'),
      newName: z.string().optional().describe('Rename the food'),
      baseUnit: z.string().optional().describe('New base unit'),
      defaultServings: z.array(z.string()).optional().describe('New default servings list'),
      calories: z.number().nullable().optional().describe('Calories per base unit (null to clear)'),
      protein: z.number().nullable().optional().describe('Protein in grams (null to clear)'),
      fat: z.number().nullable().optional().describe('Fat in grams (null to clear)'),
      carbs: z.number().nullable().optional().describe('Carbs in grams (null to clear)'),
      fiber: z.number().nullable().optional().describe('Fiber in grams (null to clear)'),
      sugar: z.number().nullable().optional().describe('Sugar in grams (null to clear)'),
      sodium: z.number().nullable().optional().describe('Sodium in milligrams (null to clear)'),
      source: z.enum(['verified', 'estimated', 'unknown']).optional().describe('Data quality source'),
    },
    async ({ name, newName, baseUnit, defaultServings, calories, protein, fat, carbs, fiber, sugar, sodium, source }, extra) => {
      const userId = getUserId(extra);
      const data: any = {};
      if (newName !== undefined) data.name = newName;
      if (baseUnit !== undefined) data.baseUnit = baseUnit;
      if (defaultServings !== undefined) data.defaultServings = defaultServings;
      if (calories !== undefined) data.calories = calories;
      if (protein !== undefined) data.protein = protein;
      if (fat !== undefined) data.fat = fat;
      if (carbs !== undefined) data.carbs = carbs;
      if (fiber !== undefined) data.fiber = fiber;
      if (sugar !== undefined) data.sugar = sugar;
      if (sodium !== undefined) data.sodium = sodium;
      if (source !== undefined) data.source = source;

      try {
        const food = await prisma.nutritionalDataItem.update({
          where: { userId_name: { userId, name } },
          data,
        });
        return { content: [{ type: 'text' as const, text: `Updated food "${food.name}".` }] };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return { content: [{ type: 'text' as const, text: `No food named "${name}" found.` }], isError: true };
        }
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return { content: [{ type: 'text' as const, text: `A food named "${newName}" already exists.` }], isError: true };
        }
        throw err;
      }
    },
  );

  // --- list_foods ---
  server.tool(
    'list_foods',
    'List food items in your library, optionally filtered by name',
    {
      search: z.string().optional().describe('Case-insensitive name filter'),
    },
    async ({ search }, extra) => {
      const userId = getUserId(extra);
      const foods = await prisma.nutritionalDataItem.findMany({
        where: {
          userId,
          ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
        },
        orderBy: { name: 'asc' },
      });
      if (foods.length === 0) {
        return { content: [{ type: 'text' as const, text: search ? `No foods matching "${search}".` : 'No foods in your library yet. Use create_food to get started.' }] };
      }
      const lines = foods.map(f => {
        const macros = [f.calories != null ? `${f.calories} cal` : null, f.protein != null ? `${f.protein}g P` : null, f.fat != null ? `${f.fat}g F` : null, f.carbs != null ? `${f.carbs}g C` : null].filter(Boolean).join(', ');
        return `- ${f.name} (per ${f.baseUnit})${macros ? ` — ${macros}` : ''}`;
      });
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // --- get_food ---
  server.tool(
    'get_food',
    'Get full details for a food item',
    {
      name: z.string().describe('Food name'),
    },
    async ({ name }, extra) => {
      const userId = getUserId(extra);
      const food = await prisma.nutritionalDataItem.findUnique({
        where: { userId_name: { userId, name } },
      });
      if (!food) {
        return { content: [{ type: 'text' as const, text: `No food named "${name}" found.` }], isError: true };
      }
      const details = [
        `Name: ${food.name}`,
        `Base unit: ${food.baseUnit}`,
        food.defaultServings.length > 0 ? `Default servings: ${food.defaultServings.join(', ')}` : null,
        `Source: ${food.source}`,
        '',
        'Macros per base unit:',
        `  Calories: ${food.calories ?? '—'}`,
        `  Protein: ${food.protein != null ? food.protein + 'g' : '—'}`,
        `  Fat: ${food.fat != null ? food.fat + 'g' : '—'}`,
        `  Carbs: ${food.carbs != null ? food.carbs + 'g' : '—'}`,
        `  Fiber: ${food.fiber != null ? food.fiber + 'g' : '—'}`,
        `  Sugar: ${food.sugar != null ? food.sugar + 'g' : '—'}`,
        `  Sodium: ${food.sodium != null ? food.sodium + 'mg' : '—'}`,
      ].filter(line => line !== null).join('\n');
      return { content: [{ type: 'text' as const, text: details }] };
    },
  );

  // --- delete_food ---
  server.tool(
    'delete_food',
    'Delete a food item from your library. Meal schema ingredients using it are removed; logged meal items keep their snapshotted macros.',
    {
      name: z.string().describe('Food name to delete'),
    },
    async ({ name }, extra) => {
      const userId = getUserId(extra);
      try {
        await prisma.nutritionalDataItem.delete({
          where: { userId_name: { userId, name } },
        });
        return { content: [{ type: 'text' as const, text: `Deleted food "${name}".` }] };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return { content: [{ type: 'text' as const, text: `No food named "${name}" found.` }], isError: true };
        }
        throw err;
      }
    },
  );

  // =====================
  // Meal templates (MealSchema CRUD)
  // =====================

  // --- create_meal_schema ---
  server.tool(
    'create_meal_schema',
    'Create a reusable meal template with ingredients from your food library',
    {
      name: z.string().describe('Meal template name (e.g. "Morning Oatmeal")'),
      description: z.string().optional().describe('Optional description'),
      ingredients: z.array(z.object({
        foodName: z.string().describe('Name of a food from your library'),
        defaultQuantity: z.number().optional().describe('Default quantity in base units (omit to prompt at log time)'),
      })).describe('List of ingredients'),
    },
    async ({ name, description, ingredients }, extra) => {
      const userId = getUserId(extra);

      // Validate all food names exist
      const foodNames = ingredients.map(i => i.foodName);
      const foods = await prisma.nutritionalDataItem.findMany({
        where: { userId, name: { in: foodNames } },
      });
      const foodMap = new Map(foods.map(f => [f.name, f]));
      const missing = foodNames.filter(n => !foodMap.has(n));
      if (missing.length > 0) {
        return { content: [{ type: 'text' as const, text: `Foods not found: ${missing.join(', ')}. Create them first with create_food.` }], isError: true };
      }

      try {
        const schema = await prisma.$transaction(async (tx) => {
          const created = await tx.mealSchema.create({
            data: { userId, name, description },
          });
          await tx.mealSchemaIngredient.createMany({
            data: ingredients.map(i => ({
              mealSchemaId: created.id,
              nutritionalDataItemId: foodMap.get(i.foodName)!.id,
              defaultQuantity: i.defaultQuantity,
            })),
          });
          return created;
        });
        return { content: [{ type: 'text' as const, text: `Created meal template "${schema.name}" with ${ingredients.length} ingredient(s).` }] };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return { content: [{ type: 'text' as const, text: `A meal template named "${name}" already exists.` }], isError: true };
        }
        throw err;
      }
    },
  );

  // --- list_meal_schemas ---
  server.tool(
    'list_meal_schemas',
    'List your meal templates',
    {},
    async (_args, extra) => {
      const userId = getUserId(extra);
      const schemas = await prisma.mealSchema.findMany({
        where: { userId },
        include: { _count: { select: { ingredients: true } } },
        orderBy: { name: 'asc' },
      });
      if (schemas.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No meal templates yet. Use create_meal_schema to get started.' }] };
      }
      const lines = schemas.map(s =>
        `- ${s.name}${s.description ? ` — ${s.description}` : ''} (${s._count.ingredients} ingredient${s._count.ingredients === 1 ? '' : 's'})`
      );
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // --- get_meal_schema ---
  server.tool(
    'get_meal_schema',
    'Get full details for a meal template including ingredients and computed macro totals',
    {
      name: z.string().describe('Meal template name'),
    },
    async ({ name }, extra) => {
      const userId = getUserId(extra);
      const schema = await prisma.mealSchema.findUnique({
        where: { userId_name: { userId, name } },
        include: {
          ingredients: {
            include: { nutritionalDataItem: true },
          },
        },
      });
      if (!schema) {
        return { content: [{ type: 'text' as const, text: `No meal template named "${name}" found.` }], isError: true };
      }

      const totals: Record<string, number> = {};
      const ingredientLines = schema.ingredients.map(ing => {
        const food = ing.nutritionalDataItem;
        const qty = ing.defaultQuantity;
        let line = `- ${food.name}`;
        if (qty != null) {
          line += ` × ${qty} ${food.baseUnit}`;
          // Accumulate totals for ingredients with default quantities
          for (const field of macroFields) {
            const perUnit = food[field];
            if (perUnit != null) {
              totals[field] = (totals[field] ?? 0) + perUnit * qty;
            }
          }
        } else {
          line += ` (quantity set at log time, per ${food.baseUnit})`;
        }
        return line;
      });

      const totalParts = [
        totals.calories != null ? `${Math.round(totals.calories)} cal` : null,
        totals.protein != null ? `${Math.round(totals.protein * 10) / 10}g protein` : null,
        totals.fat != null ? `${Math.round(totals.fat * 10) / 10}g fat` : null,
        totals.carbs != null ? `${Math.round(totals.carbs * 10) / 10}g carbs` : null,
      ].filter(Boolean);

      const lines = [
        `${schema.name}${schema.description ? ` — ${schema.description}` : ''}`,
        '',
        'Ingredients:',
        ...ingredientLines,
      ];
      if (totalParts.length > 0) {
        lines.push('', `Estimated totals (default quantities): ${totalParts.join(', ')}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // --- delete_meal_schema ---
  server.tool(
    'delete_meal_schema',
    'Delete a meal template. Logged meals that used it keep their data.',
    {
      name: z.string().describe('Meal template name to delete'),
    },
    async ({ name }, extra) => {
      const userId = getUserId(extra);
      try {
        await prisma.mealSchema.delete({
          where: { userId_name: { userId, name } },
        });
        return { content: [{ type: 'text' as const, text: `Deleted meal template "${name}".` }] };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return { content: [{ type: 'text' as const, text: `No meal template named "${name}" found.` }], isError: true };
        }
        throw err;
      }
    },
  );

  // =====================
  // Logging & querying
  // =====================

  // --- log_meal ---
  server.tool(
    'log_meal',
    'Log a meal. Use a meal template, ad-hoc food items, anonymous items with inline macros, or any combination.',
    {
      mealSchemaName: z.string().optional().describe('Name of a meal template to log from'),
      items: z.array(z.union([
        z.object({
          foodName: z.string().describe('Name of a food from your library'),
          quantity: z.number().describe('Quantity in base units'),
        }),
        z.object({
          name: z.string().describe('Description of the anonymous item'),
          calories: z.number().optional(),
          protein: z.number().optional(),
          fat: z.number().optional(),
          carbs: z.number().optional(),
          fiber: z.number().optional(),
          sugar: z.number().optional(),
          sodium: z.number().optional(),
        }),
      ])).optional().describe('Additional or ad-hoc items'),
      timeOfDay: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional().describe('Meal type'),
      loggedAt: z.string().optional().describe('ISO datetime or YYYY-MM-DD (defaults to now)'),
      notes: z.string().optional().describe('Optional notes'),
    },
    async ({ mealSchemaName, items, timeOfDay, loggedAt, notes }, extra) => {
      const userId = getUserId(extra);

      if (!mealSchemaName && (!items || items.length === 0)) {
        return { content: [{ type: 'text' as const, text: 'At least one of mealSchemaName or items is required.' }], isError: true };
      }

      // Resolve meal schema if provided
      let schema: Awaited<ReturnType<typeof prisma.mealSchema.findUnique>> & { ingredients?: any[] } | null = null;
      if (mealSchemaName) {
        schema = await prisma.mealSchema.findUnique({
          where: { userId_name: { userId, name: mealSchemaName } },
          include: {
            ingredients: {
              include: { nutritionalDataItem: true },
            },
          },
        });
        if (!schema) {
          return { content: [{ type: 'text' as const, text: `No meal template named "${mealSchemaName}" found.` }], isError: true };
        }
      }

      // Resolve ad-hoc food items
      const adHocFoodNames = (items ?? []).filter((i): i is { foodName: string; quantity: number } => 'foodName' in i).map(i => i.foodName);
      let foodMap = new Map<string, any>();
      if (adHocFoodNames.length > 0) {
        const foods = await prisma.nutritionalDataItem.findMany({
          where: { userId, name: { in: adHocFoodNames } },
        });
        foodMap = new Map(foods.map(f => [f.name, f]));
        const missing = adHocFoodNames.filter(n => !foodMap.has(n));
        if (missing.length > 0) {
          return { content: [{ type: 'text' as const, text: `Foods not found: ${missing.join(', ')}. Create them first with create_food.` }], isError: true };
        }
      }

      // Parse loggedAt
      let loggedAtDate: Date | undefined;
      if (loggedAt) {
        loggedAtDate = new Date(loggedAt.length === 10 ? loggedAt + 'T12:00:00.000Z' : loggedAt);
      }

      // Build log items
      const logItems: Array<{
        nutritionalDataItemId: string | null;
        quantity: number | null;
        name: string | null;
        calories: number | null;
        protein: number | null;
        fat: number | null;
        carbs: number | null;
        fiber: number | null;
        sugar: number | null;
        sodium: number | null;
      }> = [];

      // Items from meal schema
      if (schema?.ingredients) {
        for (const ing of schema.ingredients) {
          const food = ing.nutritionalDataItem;
          const qty = ing.defaultQuantity;
          logItems.push({
            nutritionalDataItemId: food.id,
            quantity: qty,
            name: food.name,
            calories: qty != null && food.calories != null ? food.calories * qty : food.calories,
            protein: qty != null && food.protein != null ? food.protein * qty : food.protein,
            fat: qty != null && food.fat != null ? food.fat * qty : food.fat,
            carbs: qty != null && food.carbs != null ? food.carbs * qty : food.carbs,
            fiber: qty != null && food.fiber != null ? food.fiber * qty : food.fiber,
            sugar: qty != null && food.sugar != null ? food.sugar * qty : food.sugar,
            sodium: qty != null && food.sodium != null ? food.sodium * qty : food.sodium,
          });
        }
      }

      // Ad-hoc items
      for (const item of items ?? []) {
        if ('foodName' in item) {
          const food = foodMap.get(item.foodName)!;
          const qty = item.quantity;
          logItems.push({
            nutritionalDataItemId: food.id,
            quantity: qty,
            name: food.name,
            calories: food.calories != null ? food.calories * qty : null,
            protein: food.protein != null ? food.protein * qty : null,
            fat: food.fat != null ? food.fat * qty : null,
            carbs: food.carbs != null ? food.carbs * qty : null,
            fiber: food.fiber != null ? food.fiber * qty : null,
            sugar: food.sugar != null ? food.sugar * qty : null,
            sodium: food.sodium != null ? food.sodium * qty : null,
          });
        } else {
          // Anonymous item — inline macros
          logItems.push({
            nutritionalDataItemId: null,
            quantity: null,
            name: item.name,
            calories: item.calories ?? null,
            protein: item.protein ?? null,
            fat: item.fat ?? null,
            carbs: item.carbs ?? null,
            fiber: item.fiber ?? null,
            sugar: item.sugar ?? null,
            sodium: item.sodium ?? null,
          });
        }
      }

      const entry = await prisma.$transaction(async (tx) => {
        const created = await tx.mealLogEntry.create({
          data: {
            userId,
            mealSchemaId: schema?.id ?? null,
            loggedAt: loggedAtDate,
            timeOfDay,
            notes,
          },
        });
        await tx.mealLogItem.createMany({
          data: logItems.map(li => ({ mealLogEntryId: created.id, ...li })),
        });
        return created;
      });

      // Summarize
      const totalCal = logItems.reduce((sum, li) => sum + (li.calories ?? 0), 0);
      const parts = [
        `Logged ${logItems.length} item(s)`,
        timeOfDay ? `for ${timeOfDay}` : null,
        `(${Math.round(totalCal)} cal total)`,
        entry.loggedAt ? `at ${entry.loggedAt.toISOString().slice(0, 16)}` : null,
      ].filter(Boolean);
      return { content: [{ type: 'text' as const, text: parts.join(' ') }] };
    },
  );

  // --- get_meal_log ---
  server.tool(
    'get_meal_log',
    'Query meal log entries by date range',
    {
      from: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to today'),
      to: z.string().optional().describe('End date (YYYY-MM-DD), defaults to today'),
      timeOfDay: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional().describe('Filter by meal type'),
    },
    async ({ from, to, timeOfDay }, extra) => {
      const userId = getUserId(extra);
      const today = new Date().toISOString().slice(0, 10);
      const fromDate = new Date((from || today) + 'T00:00:00.000Z');
      const toDate = new Date((to || today) + 'T23:59:59.999Z');

      const entries = await prisma.mealLogEntry.findMany({
        where: {
          userId,
          loggedAt: { gte: fromDate, lte: toDate },
          ...(timeOfDay ? { timeOfDay } : {}),
        },
        include: {
          items: true,
          mealSchema: { select: { name: true } },
        },
        orderBy: { loggedAt: 'asc' },
      });

      if (entries.length === 0) {
        return { content: [{ type: 'text' as const, text: `No meals logged between ${from || today} and ${to || today}.` }] };
      }

      const lines: string[] = [];
      let grandTotals: Record<string, number> = {};

      for (const entry of entries) {
        const time = entry.loggedAt.toISOString().slice(0, 16);
        const header = [time, entry.timeOfDay, entry.mealSchema?.name ? `(${entry.mealSchema.name})` : null].filter(Boolean).join(' ');
        lines.push(header);

        for (const item of entry.items) {
          const macros = [item.calories != null ? `${Math.round(item.calories)} cal` : null, item.protein != null ? `${Math.round(item.protein * 10) / 10}g P` : null].filter(Boolean).join(', ');
          lines.push(`  - ${item.name || 'unnamed'}${item.quantity != null ? ` × ${item.quantity}` : ''}${macros ? ` — ${macros}` : ''}`);
        }

        // Accumulate grand totals
        for (const item of entry.items) {
          for (const field of macroFields) {
            const val = item[field];
            if (val != null) {
              grandTotals[field] = (grandTotals[field] ?? 0) + val;
            }
          }
        }

        if (entry.notes) lines.push(`  Note: ${entry.notes}`);
        lines.push('');
      }

      const totalParts = [
        grandTotals.calories != null ? `${Math.round(grandTotals.calories)} cal` : null,
        grandTotals.protein != null ? `${Math.round(grandTotals.protein * 10) / 10}g protein` : null,
        grandTotals.fat != null ? `${Math.round(grandTotals.fat * 10) / 10}g fat` : null,
        grandTotals.carbs != null ? `${Math.round(grandTotals.carbs * 10) / 10}g carbs` : null,
      ].filter(Boolean);

      if (totalParts.length > 0) {
        lines.push(`Totals: ${totalParts.join(', ')}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // --- get_daily_summary ---
  server.tool(
    'get_daily_summary',
    'Get a daily nutrition summary with total macros and per-meal-type breakdown',
    {
      date: z.string().optional().describe('Date in YYYY-MM-DD format (defaults to today)'),
    },
    async ({ date }, extra) => {
      const userId = getUserId(extra);
      const targetDate = date || new Date().toISOString().slice(0, 10);
      const dayStart = new Date(targetDate + 'T00:00:00.000Z');
      const dayEnd = new Date(targetDate + 'T23:59:59.999Z');

      const entries = await prisma.mealLogEntry.findMany({
        where: {
          userId,
          loggedAt: { gte: dayStart, lte: dayEnd },
        },
        include: { items: true },
        orderBy: { loggedAt: 'asc' },
      });

      if (entries.length === 0) {
        return { content: [{ type: 'text' as const, text: `No meals logged on ${targetDate}.` }] };
      }

      const dayTotals: Record<string, number> = {};
      const byMealType: Record<string, Record<string, number>> = {};

      for (const entry of entries) {
        const mealType = entry.timeOfDay || 'unspecified';
        if (!byMealType[mealType]) byMealType[mealType] = {};

        for (const item of entry.items) {
          for (const field of macroFields) {
            const val = item[field];
            if (val != null) {
              dayTotals[field] = (dayTotals[field] ?? 0) + val;
              byMealType[mealType][field] = (byMealType[mealType][field] ?? 0) + val;
            }
          }
        }
      }

      const formatMacros = (t: Record<string, number>) => {
        return [
          t.calories != null ? `${Math.round(t.calories)} cal` : null,
          t.protein != null ? `${Math.round(t.protein * 10) / 10}g protein` : null,
          t.fat != null ? `${Math.round(t.fat * 10) / 10}g fat` : null,
          t.carbs != null ? `${Math.round(t.carbs * 10) / 10}g carbs` : null,
          t.fiber != null ? `${Math.round(t.fiber * 10) / 10}g fiber` : null,
          t.sugar != null ? `${Math.round(t.sugar * 10) / 10}g sugar` : null,
          t.sodium != null ? `${Math.round(t.sodium)}mg sodium` : null,
        ].filter(Boolean).join(', ');
      };

      const lines = [
        `Daily summary for ${targetDate}`,
        `${entries.length} meal(s) logged`,
        '',
        `Totals: ${formatMacros(dayTotals)}`,
      ];

      const mealTypeOrder = ['breakfast', 'lunch', 'dinner', 'snack', 'unspecified'];
      for (const mt of mealTypeOrder) {
        if (byMealType[mt]) {
          lines.push(`  ${mt}: ${formatMacros(byMealType[mt])}`);
        }
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // =====================
  // Generic metrics (weight, steps, custom)
  // =====================

  // --- create_metric ---
  server.tool(
    'create_metric',
    'Define a new metric to track (e.g. Weight, Steps, Workouts)',
    {
      name: z.string().describe('Metric name (e.g. "Weight", "Steps")'),
      unit: z.string().optional().describe('Unit of measurement (e.g. "lbs", "steps")'),
      resolution: z.enum(['daily', 'timestamped']).describe('daily = one entry per day, timestamped = multiple entries per day'),
      type: z.enum(['numeric', 'checkin']).describe('numeric = has a value, checkin = presence-only'),
    },
    async ({ name, unit, resolution, type }, extra) => {
      const userId = getUserId(extra);
      try {
        const metric = await prisma.metric.create({
          data: { userId, name, unit, resolution, type },
        });
        return { content: [{ type: 'text' as const, text: `Created metric "${metric.name}" (${metric.type}, ${metric.resolution})${metric.unit ? ` in ${metric.unit}` : ''}` }] };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return { content: [{ type: 'text' as const, text: `A metric named "${name}" already exists.` }], isError: true };
        }
        throw err;
      }
    },
  );

  // --- list_metrics ---
  server.tool(
    'list_metrics',
    'List all metrics you are tracking',
    {},
    async (_args, extra) => {
      const userId = getUserId(extra);
      const metrics = await prisma.metric.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });
      if (metrics.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No metrics defined yet. Use create_metric to get started.' }] };
      }
      const lines = metrics.map(m =>
        `- ${m.name} (${m.type}, ${m.resolution})${m.unit ? ` [${m.unit}]` : ''}`
      );
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // --- log_metric ---
  server.tool(
    'log_metric',
    'Log an entry for a metric',
    {
      name: z.string().describe('Metric name'),
      value: z.number().optional().describe('Value to log (required for numeric metrics, omit for checkin)'),
      date: z.string().optional().describe('Date in YYYY-MM-DD format (defaults to today). Ignored for timestamped metrics.'),
    },
    async ({ name, value, date }, extra) => {
      const userId = getUserId(extra);
      const metric = await prisma.metric.findUnique({
        where: { userId_name: { userId, name } },
      });
      if (!metric) {
        return { content: [{ type: 'text' as const, text: `No metric named "${name}" found. Use create_metric first.` }], isError: true };
      }

      if (metric.type === 'numeric' && value == null) {
        return { content: [{ type: 'text' as const, text: `Metric "${name}" is numeric — a value is required.` }], isError: true };
      }
      if (metric.type === 'checkin' && value != null) {
        return { content: [{ type: 'text' as const, text: `Metric "${name}" is checkin — value should not be provided.` }], isError: true };
      }

      const now = new Date();
      let entryDate: string;
      let timestamp: Date;
      if (metric.resolution === 'daily') {
        entryDate = date || now.toISOString().slice(0, 10);
        timestamp = new Date(entryDate + 'T00:00:00.000Z');
      } else {
        timestamp = now;
        entryDate = now.toISOString();
      }

      if (metric.resolution === 'daily') {
        await prisma.metricEntry.upsert({
          where: { metricId_date: { metricId: metric.id, date: entryDate } },
          create: { metricId: metric.id, value, date: entryDate, timestamp },
          update: { value, timestamp },
        });
      } else {
        await prisma.metricEntry.create({
          data: { metricId: metric.id, value, date: entryDate, timestamp },
        });
      }

      const display = metric.type === 'checkin' ? 'checked in' : `logged ${value}${metric.unit ? ` ${metric.unit}` : ''}`;
      return { content: [{ type: 'text' as const, text: `${metric.name}: ${display} on ${entryDate.slice(0, 10)}` }] };
    },
  );

  // --- get_metric_entries ---
  server.tool(
    'get_metric_entries',
    'Query entries for a metric over a date range',
    {
      name: z.string().describe('Metric name'),
      from: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to 7 days ago'),
      to: z.string().optional().describe('End date (YYYY-MM-DD), defaults to today'),
    },
    async ({ name, from, to }, extra) => {
      const userId = getUserId(extra);
      const metric = await prisma.metric.findUnique({
        where: { userId_name: { userId, name } },
      });
      if (!metric) {
        return { content: [{ type: 'text' as const, text: `No metric named "${name}" found.` }], isError: true };
      }

      const today = new Date().toISOString().slice(0, 10);
      const fromDate = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const toDate = to || today;

      const entries = await prisma.metricEntry.findMany({
        where: {
          metricId: metric.id,
          date: { gte: fromDate, lte: toDate + '\uffff' },
        },
        orderBy: { date: 'asc' },
      });

      if (entries.length === 0) {
        return { content: [{ type: 'text' as const, text: `No entries for "${name}" between ${fromDate} and ${toDate}.` }] };
      }

      const lines = entries.map(e => {
        const dateStr = e.date.slice(0, 10);
        if (metric.type === 'checkin') return `- ${dateStr}: ✓`;
        return `- ${dateStr}: ${e.value}${metric.unit ? ` ${metric.unit}` : ''}`;
      });
      return { content: [{ type: 'text' as const, text: `${metric.name} (${fromDate} to ${toDate}):\n${lines.join('\n')}` }] };
    },
  );

  // --- delete_metric ---
  server.tool(
    'delete_metric',
    'Delete a metric and all its entries',
    {
      name: z.string().describe('Metric name to delete'),
    },
    async ({ name }, extra) => {
      const userId = getUserId(extra);
      try {
        await prisma.metric.delete({
          where: { userId_name: { userId, name } },
        });
        return { content: [{ type: 'text' as const, text: `Deleted metric "${name}" and all its entries.` }] };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return { content: [{ type: 'text' as const, text: `No metric named "${name}" found.` }], isError: true };
        }
        throw err;
      }
    },
  );

  return server;
}

export function createMcpRouter(tenantId: string, entraClientId: string, proxyBaseUrl: string, prisma: PrismaClient, entraAuthority?: string): {
  mcpRouter: Router;
  wellKnownRouter: Router;
} {
  const authProvider = createEntraAuthProvider(tenantId, entraClientId, proxyBaseUrl, entraAuthority);

  // .well-known endpoints (no auth) — mounted at root by the caller
  const wellKnownRouter = Router();

  wellKnownRouter.get('/oauth-protected-resource', (req, res) => {
    authProvider.handleProtectedResourceMetadata(req, res);
  });

  wellKnownRouter.get('/oauth-authorization-server', (req, res) => {
    authProvider.handleAuthServerMetadata(req, res);
  });

  // MCP transport endpoints — mounted at /api/mcp by the caller
  const mcpRouter = Router();

  // POST - MCP messages (stateless: fresh transport+server per request)
  mcpRouter.post('/', ...authProvider.middleware, async (req: Request, res: Response) => {
    try {
      const server = createMcpServer(prisma);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,  // stateless — no sessions
      });
      await server.connect(transport);
      await transport.handleRequest(req as any, res as any, req.body);
      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (err) {
      console.error('MCP POST handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
      }
    }
  });

  // GET - not supported in stateless mode (SSE streaming requires sessions)
  mcpRouter.get('/', (req: Request, res: Response) => {
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    }));
  });

  // DELETE - not supported in stateless mode (no sessions to terminate)
  mcpRouter.delete('/', (req: Request, res: Response) => {
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    }));
  });

  return { mcpRouter, wellKnownRouter };
}
