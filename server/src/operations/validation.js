import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.').refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Choose a real calendar date.');
const meal = z.enum(['breakfast', 'lunch', 'snacks', 'dinner']);

export const menuItemSchema = z.object({
  outletId: objectId,
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(60),
  unit: z.enum(['kg', 'litre', 'plate', 'piece']),
  costPerUnit: z.coerce.number().finite().nonnegative().max(1_000_000),
  batchSize: z.coerce.number().finite().positive().max(1_000_000),
  shelfLifeHours: z.coerce.number().int().nonnegative().max(8760),
  isSafelyReusable: z.boolean().default(false)
}).strict();

export const menuItemUpdateSchema = menuItemSchema.partial().omit({ outletId: true }).strict().refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.');
export const manualEstimateSchema = z.object({ meal, quantity: z.preprocess(value => value === null || value === '' ? null : value, z.coerce.number().finite().nonnegative().max(1_000_000).nullable()) }).strict();

export const dailyLogSchema = z.object({
  outletId: objectId,
  date,
  meal,
  itemId: objectId,
  prepared: z.coerce.number().finite().nonnegative().max(1_000_000),
  unservedLeftover: z.coerce.number().finite().nonnegative().max(1_000_000),
  plateWaste: z.coerce.number().finite().nonnegative().max(1_000_000).default(0),
  soldOut: z.boolean().default(false),
  soldOutAt: z.string().datetime({ offset: true }).optional().nullable(),
  customerCount: z.preprocess(value => value === '' || value === undefined || value === null ? null : value, z.coerce.number().int().nonnegative().max(1_000_000).nullable()),
  remarks: z.string().trim().max(500).default('')
}).strict().superRefine((value, context) => {
  if (value.unservedLeftover > value.prepared) context.addIssue({ code: 'custom', path: ['unservedLeftover'], message: 'Unserved leftover cannot exceed prepared quantity.' });
  if (value.plateWaste > value.prepared - value.unservedLeftover) context.addIssue({ code: 'custom', path: ['plateWaste'], message: 'Plate waste cannot exceed the served quantity.' });
  if (value.soldOut && !value.soldOutAt) context.addIssue({ code: 'custom', path: ['soldOutAt'], message: 'Add the time the item sold out.' });
  if (!value.soldOut && value.soldOutAt) context.addIssue({ code: 'custom', path: ['soldOutAt'], message: 'A sold-out time requires soldOut to be true.' });
});

export const calendarEventSchema = z.object({
  outletId: objectId.nullable().optional(),
  date,
  type: z.enum(['holiday', 'exam', 'college_event', 'vacation', 'special_menu']),
  title: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).default('')
}).strict();

export const importRowSchema = z.object({
  outletId: objectId,
  date,
  meal,
  itemId: objectId,
  prepared: z.coerce.number().finite().nonnegative().max(1_000_000),
  unservedLeftover: z.coerce.number().finite().nonnegative().max(1_000_000),
  plateWaste: z.coerce.number().finite().nonnegative().max(1_000_000).default(0),
  soldOut: z.enum(['true', 'false', 'yes', 'no', '1', '0']).transform(value => ['true', 'yes', '1'].includes(value.toLowerCase())),
  soldOutAt: z.string().trim().optional().default(''),
  customerCount: z.union([z.literal(''), z.coerce.number().int().nonnegative().max(1_000_000)]).optional().transform(value => value === '' || value === undefined ? null : value),
  remarks: z.string().max(500).default('')
}).strict();
