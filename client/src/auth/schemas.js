import { z } from 'zod';

const email = z.email().max(254);
const password = z.string().min(8, 'Use at least 8 characters.').max(128);
export const loginSchema = z.object({ organisationSlug: z.string().trim().min(2, 'Enter your workspace slug.'), email, password: z.string().min(1), rememberMe: z.boolean().optional() });
export const registerSchema = z.object({
  organisationName: z.string().trim().min(2).max(100),
  outletName: z.string().trim().min(2).max(100),
  organisationType: z.enum(['restaurant', 'college-canteen']),
  dailyServingCapacity: z.coerce.number().int().min(1, 'Enter a serving capacity of at least 1.').max(100000),
  name: z.string().trim().min(2).max(100),
  email,
  password,
  confirmPassword: z.string().min(1, 'Confirm your password.'),
  timezone: z.string().trim().min(1).max(80)
}).refine(values => values.password === values.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });
export const outletSchema = z.object({ name: z.string().trim().min(2).max(100), timezone: z.string().trim().min(1).max(80) });
export const userSchema = z.object({ name: z.string().trim().min(2).max(100), email, password, role: z.enum(['admin', 'manager', 'staff']) });
