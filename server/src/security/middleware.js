import { Organisation, User } from '../models/index.js';
import { ACCESS_COOKIE } from './cookies.js';
import { verifyAccessToken } from './tokens.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' } });
  let payload;
  try {
    ({ payload } = await verifyAccessToken(token));
    if (typeof payload.sub !== 'string' || typeof payload.org !== 'string' || typeof payload.sid !== 'string') throw new Error('Invalid claims');
  } catch {
    return res.status(401).json({ error: { code: 'AUTH_INVALID', message: 'Please sign in again.' } });
  }
  try {
    const user = await User.findOne({
      _id: payload.sub,
      organisation: payload.org,
      isActive: true,
      refreshSessions: { $elemMatch: { sid: payload.sid, expiresAt: { $gt: new Date() } } }
    }).select('_id organisation name email role');
    if (!user) return res.status(401).json({ error: { code: 'SESSION_EXPIRED', message: 'Please sign in again.' } });
    const organisation = await Organisation.findOne({ _id: user.organisation, isActive: true }).select('_id');
    if (!organisation) return res.status(403).json({ error: { code: 'ORGANISATION_INACTIVE', message: 'This organisation is not active.' } });
    req.auth = { userId: user._id, organisationId: user.organisation, name: user.name, email: user.email, role: user.role, sessionId: payload.sid };
    next();
  } catch (error) { next(error); }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' } });
    }
    next();
  };
}
