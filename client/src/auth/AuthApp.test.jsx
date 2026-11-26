import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthApp from './AuthApp.jsx';

describe('WasteWise account access', () => {
  afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); });

  it('shows the sign-in page and validates required credentials', async () => {
    window.history.replaceState({}, '', '/login');
    render(<AuthApp/>);
    expect(screen.getByRole('heading', { name: 'Sign in to WasteWise' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter your workspace slug.')).toBeInTheDocument();
    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
  });

  it('shows first-workspace fields for registration', () => {
    window.history.replaceState({}, '', '/register');
    render(<AuthApp/>);
    expect(screen.getByRole('heading', { name: 'Create your workspace' })).toBeInTheDocument();
    expect(screen.getByLabelText('Organisation name')).toBeInTheDocument();
    expect(screen.getByLabelText('First outlet')).toBeInTheDocument();
    expect(screen.getByLabelText('Kitchen time zone')).toHaveValue('Asia/Kolkata');
  });
});
