const API_ROOT = '/api/v1';
let csrfToken = '';
let refreshPromise = null;

async function fetchCsrf() {
  const response = await fetch(`${API_ROOT}/auth/csrf`, { credentials: 'include', headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.csrfToken) throw new Error(body?.error?.message || 'Could not start a secure session.');
  csrfToken = body.csrfToken;
  return csrfToken;
}

async function send(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const { _retried: _ignored, _csrfRetried: _csrfIgnored, ...fetchOptions } = options;
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', csrfToken || await fetchCsrf());
  const response = await fetch(`${API_ROOT}${path}`, { ...fetchOptions, method, headers, credentials: 'include' });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, body };
}

async function renewSession() {
  if (!refreshPromise) {
    refreshPromise = send('/auth/refresh', { method: 'POST' }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body?.error?.message || 'Your session expired. Please sign in again.');
      return body;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function apiFetch(path, options = {}) {
  let result = await send(path, options);
  if (result.response.status === 403 && result.body?.error?.code === 'CSRF_INVALID' && !options._csrfRetried) {
    await fetchCsrf();
    result = await send(path, { ...options, _csrfRetried: true });
  }
  const excluded = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
  if (result.response.status === 401 && !excluded.includes(path) && !options._retried) {
    await renewSession();
    result = await send(path, { ...options, _retried: true });
  }
  if (!result.response.ok) {
    const error = new Error(result.body?.error?.message || 'The request could not be completed.');
    error.status = result.response.status;
    error.code = result.body?.error?.code;
    throw error;
  }
  return result.body;
}

export function fetchSession() { return apiFetch('/auth/me'); }
export async function signIn(values) { return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(values) }); }
export async function signUp(values) { return apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(values) }); }
export async function signOut() { return apiFetch('/auth/logout', { method: 'POST' }); }
