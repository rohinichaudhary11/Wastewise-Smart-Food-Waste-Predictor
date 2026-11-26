import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Organisation, Outlet, User, AuditLog } from '../models/index.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../security/cookies.js';
import { csrfCookieOptions, createCsrfToken, CSRF_COOKIE, requireCsrf } from '../security/csrf.js';
import { requireAuth, requireRole } from '../security/middleware.js';
import { authContext, login, logout, makeUser, refresh, register, toSafeUser } from './service.js';
import { createSlug } from './slug.js';
import { loginSchema, outletCreateSchema, outletUpdateSchema, registerSchema, userCreateSchema, userUpdateSchema } from './validation.js';

const authRouter = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Wait a few minutes and try again.' } })
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many refresh attempts. Try again shortly.' } })
});
const schemaResult = (schema, body, res) => {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid request data.' } });
  return null;
};
const validTimezone = value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
};

authRouter.use(requireCsrf);

authRouter.get('/csrf', (req, res) => {
  const token = createCsrfToken();
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken: token });
});

authRouter.post('/register', authLimiter, async (req, res, next) => {
  const input = schemaResult(registerSchema, req.body, res);
  if (!input) return;
  if (!validTimezone(input.timezone)) return res.status(400).json({ error: { code: 'INVALID_TIMEZONE', message: 'Choose a valid time zone.' } });
  try {
    const session = await register(input, authContext(req));
    setAuthCookies(res, session.accessToken, session.refreshToken, true);
    res.status(201).json({ user: session.user });
  } catch (error) { next(error); }
});

authRouter.post('/login', authLimiter, async (req, res, next) => {
  const input = schemaResult(loginSchema, req.body, res);
  if (!input) return;
  try {
    const session = await login(input, authContext(req));
    if (!session) return res.status(401).json({ error: { code: 'LOGIN_FAILED', message: 'Organisation, email or password is incorrect.' } });
    setAuthCookies(res, session.accessToken, session.refreshToken, session.rememberMe);
    res.json({ user: session.user });
  } catch (error) { next(error); }
});

authRouter.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const session = await refresh(req.cookies?.[REFRESH_COOKIE]);
    if (!session) {
      clearAuthCookies(res);
      return res.status(401).json({ error: { code: 'SESSION_EXPIRED', message: 'Your session expired. Please sign in again.' } });
    }
    setAuthCookies(res, session.accessToken, session.refreshToken, session.rememberMe);
    res.json({ user: session.user });
  } catch (error) { next(error); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    await logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    res.status(204).end();
  } catch (error) { next(error); }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.auth.userId, organisation: req.auth.organisationId, isActive: true }).select('_id organisation name email role');
    if (!user) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' } });
    const organisation = await Organisation.findOne({ _id: req.auth.organisationId, isActive: true }).select('name slug timezone currency');
    if (!organisation) return res.status(403).json({ error: { code: 'ORGANISATION_INACTIVE', message: 'This organisation is not active.' } });
    res.json({ user: toSafeUser(user), organisation });
  } catch (error) { next(error); }
});

const outletRouter = Router();
outletRouter.use(requireAuth);
outletRouter.get('/', async (req, res, next) => {
  try {
    const outlets = await Outlet.find({ organisation: req.auth.organisationId }).sort({ name: 1 }).limit(100).lean();
    res.json({ data: outlets });
  } catch (error) { next(error); }
});
outletRouter.post('/', requireRole('admin'), async (req, res, next) => {
  const input = schemaResult(outletCreateSchema, req.body, res);
  if (!input) return;
  if (!validTimezone(input.timezone)) return res.status(400).json({ error: { code: 'INVALID_TIMEZONE', message: 'Choose a valid time zone.' } });
  try {
    const [outlet] = await Outlet.create([{ organisation: req.auth.organisationId, name: input.name, timezone: input.timezone, slug: createSlug(input.name) }]);
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'outlet.created', entityType: 'Outlet', entityId: outlet._id });
    res.status(201).json({ data: outlet });
  } catch (error) { next(error); }
});
outletRouter.patch('/:outletId', requireRole('admin'), async (req, res, next) => {
  const input = schemaResult(outletUpdateSchema, req.body, res);
  if (!input) return;
  if (input.timezone && !validTimezone(input.timezone)) return res.status(400).json({ error: { code: 'INVALID_TIMEZONE', message: 'Choose a valid time zone.' } });
  try {
    const update = { ...input };
    if (update.name) update.slug = createSlug(update.name);
    const outlet = await Outlet.findOneAndUpdate({ _id: req.params.outletId, organisation: req.auth.organisationId }, update, { returnDocument: 'after', runValidators: true });
    if (!outlet) return res.status(404).json({ error: { code: 'OUTLET_NOT_FOUND', message: 'Outlet not found.' } });
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'outlet.updated', entityType: 'Outlet', entityId: outlet._id });
    res.json({ data: outlet });
  } catch (error) { next(error); }
});

const userRouter = Router();
userRouter.use(requireAuth, requireRole('admin'));
userRouter.get('/', async (req, res, next) => {
  try {
    const users = await User.find({ organisation: req.auth.organisationId }).select('_id organisation name email role isActive createdAt').sort({ name: 1 }).limit(200).lean();
    res.json({ data: users.map(user => ({ ...user, id: user._id.toString(), _id: undefined })) });
  } catch (error) { next(error); }
});
userRouter.post('/', async (req, res, next) => {
  const input = schemaResult(userCreateSchema, req.body, res);
  if (!input) return;
  try {
    const user = await makeUser(input, req.auth.organisationId);
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'user.created', entityType: 'User', entityId: user.id, metadata: { role: user.role } });
    res.status(201).json({ data: user });
  } catch (error) { next(error); }
});
userRouter.patch('/:userId', async (req, res, next) => {
  const input = schemaResult(userUpdateSchema, req.body, res);
  if (!input) return;
  if (req.params.userId === req.auth.userId.toString() && input.isActive === false) return res.status(400).json({ error: { code: 'SELF_DEACTIVATION', message: 'Ask another administrator to deactivate this account.' } });
  if (req.params.userId === req.auth.userId.toString() && input.role && input.role !== req.auth.role) return res.status(400).json({ error: { code: 'SELF_ROLE_CHANGE', message: 'Ask another administrator to change your role.' } });
  try {
    const user = await User.findOneAndUpdate({ _id: req.params.userId, organisation: req.auth.organisationId }, input, { returnDocument: 'after', runValidators: true }).select('_id organisation name email role isActive');
    if (!user) return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
    if (input.isActive === false) user.refreshSessions = [];
    if (input.isActive === false) await user.save();
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'user.updated', entityType: 'User', entityId: user._id, metadata: input });
    res.json({ data: toSafeUser(user), isActive: user.isActive });
  } catch (error) { next(error); }
});

export { authRouter, outletRouter, userRouter };
