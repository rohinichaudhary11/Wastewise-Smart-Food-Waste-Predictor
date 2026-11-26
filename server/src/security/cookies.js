import { config } from '../config.js';

const securePrefix = config.cookieSecure ? '__Host-' : '';
export const ACCESS_COOKIE = `${securePrefix}ww_access`;
export const REFRESH_COOKIE = `${securePrefix}ww_refresh`;

export function setAuthCookies(res, accessToken, refreshToken, rememberMe = true) {
  const common = { secure: config.cookieSecure, sameSite: 'strict' };
  res.cookie(ACCESS_COOKIE, accessToken, { ...common, httpOnly: true, path: '/', maxAge: config.accessTtlSeconds * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...common, httpOnly: true, path: '/', ...(rememberMe ? { maxAge: config.refreshTtlMs } : {}) });
}

export function clearAuthCookies(res) {
  const common = { secure: config.cookieSecure, sameSite: 'strict' };
  res.clearCookie(ACCESS_COOKIE, { ...common, httpOnly: true, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...common, httpOnly: true, path: '/' });
}
