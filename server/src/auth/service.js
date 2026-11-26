import { createSlug } from './slug.js';
import { timingSafeEqual } from 'node:crypto';
import { Organisation, Outlet, User, AuditLog } from '../models/index.js';
import { hashPassword, verifyPassword } from '../security/passwords.js';
import { createAccessToken, newRefreshSession, parseRefreshToken } from '../security/tokens.js';

function safeUser(user) {
  return { id: user._id.toString(), organisationId: user.organisation.toString(), name: user.name, email: user.email, role: user.role };
}

async function issueSession(user) {
  const now = new Date();
  user.refreshSessions = user.refreshSessions.filter(session => session.expiresAt > now).slice(-7);
  const refresh = newRefreshSession(user);
  user.refreshSessions.push({ sid: refresh.sid, digest: refresh.digest, createdAt: now, expiresAt: refresh.expiresAt });
  await user.save();
  return { user: safeUser(user), refreshToken: refresh.token, accessToken: await createAccessToken(user, refresh.sid) };
}

export async function register(input, auditContext) {
  const session = await Organisation.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const organisation = await Organisation.create([{
        name: input.organisationName,
        slug: createSlug(input.organisationName),
        timezone: input.timezone
      }], { session }).then(docs => docs[0]);
      const outlet = await Outlet.create([{
        organisation: organisation._id,
        name: input.outletName,
        slug: createSlug(input.outletName),
        timezone: input.timezone
      }], { session }).then(docs => docs[0]);
      const user = await User.create([{
        organisation: organisation._id,
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: 'admin'
      }], { session }).then(docs => docs[0]);
      const now = new Date();
      const refresh = newRefreshSession(user);
      user.refreshSessions.push({ sid: refresh.sid, digest: refresh.digest, createdAt: now, expiresAt: refresh.expiresAt });
      await user.save({ session });
      await AuditLog.create([{
        organisation: organisation._id, actor: user._id, action: 'organisation.registered', entityType: 'Organisation', entityId: organisation._id,
        metadata: { outletId: outlet._id }, ipAddress: auditContext.ip, userAgent: auditContext.userAgent
      }], { session });
      result = { user: safeUser(user), refreshToken: refresh.token, accessToken: await createAccessToken(user, refresh.sid) };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function login(input, auditContext) {
  const organisation = await Organisation.findOne({ slug: input.organisationSlug, isActive: true }).select('_id');
  const user = organisation
    ? await User.findOne({ organisation: organisation._id, email: input.email, isActive: true }).select('+passwordHash')
    : null;
  const verified = user && await verifyPassword(user.passwordHash, input.password);
  if (!verified) return null;
  const result = await issueSession(user);
  await AuditLog.create({
    organisation: user.organisation, actor: user._id, action: 'auth.login', entityType: 'User', entityId: user._id,
    metadata: {}, ipAddress: auditContext.ip, userAgent: auditContext.userAgent
  });
  return result;
}

export async function refresh(rawToken) {
  const parsed = parseRefreshToken(rawToken);
  if (!parsed) return null;
  const user = await User.findOne({ _id: parsed.userId, organisation: parsed.organisationId, isActive: true }).select('+refreshSessions.digest');
  if (!user) return null;
  const oldSession = user.refreshSessions.find(session => session.sid === parsed.sid);
  if (!oldSession) return null;
  const oldDigest = Buffer.from(oldSession.digest);
  const presentedDigest = Buffer.from(parsed.digest);
  const digestMatches = oldDigest.length === presentedDigest.length && timingSafeEqual(oldDigest, presentedDigest);
  if (oldSession.expiresAt <= new Date() || !digestMatches) {
    await User.updateOne({ _id: parsed.userId, organisation: parsed.organisationId }, { $pull: { refreshSessions: { sid: parsed.sid } } });
    return null;
  }
  const now = new Date();
  const next = newRefreshSession(user, parsed.sid);
  const rotated = await User.updateOne({
    _id: parsed.userId,
    organisation: parsed.organisationId,
    refreshSessions: { $elemMatch: { sid: parsed.sid, digest: parsed.digest, expiresAt: { $gt: now } } }
  }, { $set: {
    'refreshSessions.$.digest': next.digest,
    'refreshSessions.$.createdAt': now,
    'refreshSessions.$.expiresAt': next.expiresAt
  } });
  if (rotated.modifiedCount !== 1) return null;
  return { user: safeUser(user), refreshToken: next.token, accessToken: await createAccessToken(user, next.sid) };
}

export async function logout(rawToken) {
  const parsed = parseRefreshToken(rawToken);
  if (!parsed) return;
  await User.updateOne({
    _id: parsed.userId,
    organisation: parsed.organisationId,
    refreshSessions: { $elemMatch: { sid: parsed.sid } }
  }, { $pull: { refreshSessions: { sid: parsed.sid } } });
}

export async function makeUser(input, organisationId) {
  const [user] = await User.create([{
    organisation: organisationId, name: input.name, email: input.email,
    passwordHash: await hashPassword(input.password), role: input.role
  }]);
  return safeUser(user);
}

export function toSafeUser(user) { return safeUser(user); }

export function authContext(req) {
  return {
    ip: req.ip || '',
    userAgent: String(req.get('user-agent') || '').slice(0, 300)
  };
}
