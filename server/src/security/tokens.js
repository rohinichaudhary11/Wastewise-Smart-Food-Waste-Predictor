import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const accessKey = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
const jwtOptions = { issuer: config.jwtIssuer, audience: config.jwtAudience };

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function newRefreshSession(user, sessionId = randomBytes(18).toString('base64url'), ttlMs = config.refreshTtlMs) {
  const sid = sessionId;
  const secret = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs);
  return {
    sid,
    secret,
    token: `${user._id}.${user.organisation}.${sid}.${secret}`,
    digest: hashToken(secret),
    expiresAt
  };
}

export async function createAccessToken(user, sid) {
  return new SignJWT({ org: user.organisation.toString(), role: user.role, sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user._id.toString())
    .setIssuer(config.jwtIssuer)
    .setAudience(config.jwtAudience)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTtlSeconds}s`)
    .sign(accessKey);
}

export async function verifyAccessToken(token) {
  return jwtVerify(token, accessKey, { ...jwtOptions, algorithms: ['HS256'] });
}

export function parseRefreshToken(token) {
  if (typeof token !== 'string') return null;
  const [userId, organisationId, sid, secret, extra] = token.split('.');
  if (!/^[a-f\d]{24}$/i.test(userId || '') || !/^[a-f\d]{24}$/i.test(organisationId || '') || !sid || !secret || extra !== undefined || sid.length > 80 || secret.length > 100) return null;
  return { userId, organisationId, sid, secret, digest: hashToken(secret) };
}
