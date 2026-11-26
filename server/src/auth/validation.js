import { z } from 'zod';

const password = z.string().min(12).max(128);
const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const name = z.string().trim().min(2).max(100);

export const registerSchema = z.object({
  organisationName: z.string().trim().min(2).max(100),
  outletName: z.string().trim().min(2).max(100).default('Main kitchen'),
  name,
  email,
  password,
  timezone: z.string().trim().min(1).max(80).default('Asia/Kolkata')
}).strict();

export const loginSchema = z.object({
  organisationSlug: z.string().trim().min(2).max(100).transform(value => value.toLowerCase()),
  email,
  password: z.string().min(1).max(128)
}).strict();

export const userCreateSchema = z.object({ name, email, password, role: z.enum(['admin', 'manager', 'staff']) }).strict();
export const userUpdateSchema = z.object({ role: z.enum(['admin', 'manager', 'staff']).optional(), isActive: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0);
export const outletCreateSchema = z.object({ name: z.string().trim().min(2).max(100), timezone: z.string().trim().min(1).max(80).default('Asia/Kolkata') }).strict();
export const outletUpdateSchema = z.object({ name: z.string().trim().min(2).max(100).optional(), timezone: z.string().trim().min(1).max(80).optional(), isActive: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0);
