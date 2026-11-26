import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthApp from './AuthApp.jsx';

describe('WasteWise account access', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

  it('shows the sign-in page and validates required credentials', async () => {
    window.history.replaceState({}, '', '/login');
    render(<AuthApp/>);
    expect(screen.getByRole('heading', { name: 'Welcome Back!' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter your workspace slug.')).toBeInTheDocument();
    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
  });

  it('shows first-workspace fields for registration', () => {
    window.history.replaceState({}, '', '/register');
    render(<AuthApp/>);
    expect(screen.getByRole('heading', { name: 'Start Reducing Food Waste.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Organization name')).toBeInTheDocument();
    expect(screen.getByLabelText('First kitchen')).toBeInTheDocument();
    const timezone = screen.getByLabelText('Kitchen time zone');
    expect(timezone).toHaveValue('Asia/Kolkata');
    expect(timezone).toHaveAttribute('list', 'kitchen-timezone-options');
    expect(document.getElementById('kitchen-timezone-options').options[0].value).toBe('Asia/Kolkata');
  });

  it('redirects a fresh session with no refresh cookie to sign-in', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url.endsWith('/auth/csrf')) return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-test-token' }) };
      return { ok: false, status: 401, json: async () => ({ error: { code: 'SESSION_EXPIRED', message: 'Your session expired. Please sign in again.' } }) };
    }));
    window.history.replaceState({}, '', '/');
    render(<AuthApp/>);
    expect(await screen.findByRole('heading', { name: 'Welcome Back!' })).toBeInTheDocument();
    expect(screen.queryByText('Your session expired. Please sign in again.')).not.toBeInTheDocument();
  });
});
