import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const CSRF_COOKIE = `${config.cookieSecure ? '__Host-' : ''}ww_csrf`;

function sign(nonce) {
  return createHmac('sha256', config.CSRF_SECRET).update(nonce).digest('base64url');
}

export function createCsrfToken() {
  const nonce = randomBytes(32).toString('base64url');
  return `${nonce}.${sign(nonce)}`;
}

export function isValidCsrfToken(cookieValue, submittedValue) {
  if (typeof cookieValue !== 'string' || typeof submittedValue !== 'string') return false;
  const [nonce, signature, extra] = cookieValue.split('.');
  if (!nonce || !signature || extra !== undefined) return false;
  const expected = Buffer.from(sign(nonce));
  const received = Buffer.from(signature);
  const supplied = Buffer.from(submittedValue);
  const cookie = Buffer.from(cookieValue);
  return expected.length === received.length && cookie.length === supplied.length &&
    timingSafeEqual(expected, received) && timingSafeEqual(cookie, supplied);
}

export function csrfCookieOptions() {
  return { httpOnly: false, secure: config.cookieSecure, sameSite: 'strict', path: '/', maxAge: 12 * 60 * 60 * 1000 };
}

export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!isValidCsrfToken(req.cookies?.[CSRF_COOKIE], req.get('x-csrf-token'))) {
    return res.status(403).json({ error: { code: 'CSRF_INVALID', message: 'Refresh the page and try again.' } });
  }
  next();
}
