import { z } from 'zod';

const email = z.email().max(254);
const password = z.string().min(12, 'Use at least 12 characters.').max(128);
export const loginSchema = z.object({ organisationSlug: z.string().trim().min(2, 'Enter your workspace slug.'), email, password: z.string().min(1) });
export const registerSchema = z.object({
  organisationName: z.string().trim().min(2).max(100),
  outletName: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(100),
  email,
  password,
  timezone: z.string().trim().min(1).max(80)
});
export const outletSchema = z.object({ name: z.string().trim().min(2).max(100), timezone: z.string().trim().min(1).max(80) });
export const userSchema = z.object({ name: z.string().trim().min(2).max(100), email, password, role: z.enum(['admin', 'manager', 'staff']) });
