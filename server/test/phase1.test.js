import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createSlug } from '../src/auth/slug.js';
import { createCsrfToken, isValidCsrfToken } from '../src/security/csrf.js';
import DailyLog from '../src/models/DailyLog.js';
import { Organisation, Outlet, User, MenuItem, CalendarEvent, Forecast, ModelRun, Alert, AuditLog } from '../src/models/index.js';
import { isDateOnly } from '../src/models/validators.js';

describe('Phase 1 foundations', () => {
  it('normalises organisation and outlet slugs', () => {
    expect(createSlug('Café — North Campus')).toBe('cafe-north-campus');
    expect(createSlug('東京')).toBe('kitchen');
  });

  it('signs CSRF values and rejects missing or changed values', () => {
    const token = createCsrfToken();
    expect(isValidCsrfToken(token, token)).toBe(true);
    expect(isValidCsrfToken(token, `${token}x`)).toBe(false);
    expect(isValidCsrfToken(token, undefined)).toBe(false);
    expect(isValidCsrfToken('forged.value', 'forged.value')).toBe(false);
  });

  it('declares all ten organisation-aware collections', () => {
    const models = [Organisation, Outlet, User, MenuItem, DailyLog, CalendarEvent, Forecast, ModelRun, Alert, AuditLog];
    expect(models).toHaveLength(10);
    for (const model of models.slice(1)) expect(model.schema.path('organisation')).toBeDefined();
  });

  it('uses the required compound unique key for daily records', () => {
    const uniqueIndex = DailyLog.schema.indexes().find(([keys, options]) =>
      keys.organisation === 1 && keys.outlet === 1 && keys.date === 1 && keys.meal === 1 && keys.item === 1 && options.unique === true
    );
    expect(uniqueIndex).toBeDefined();
  });

  it('keeps service dates as valid local calendar dates instead of UTC timestamps', () => {
    expect(isDateOnly('2026-11-26')).toBe(true);
    expect(isDateOnly('2026-02-29')).toBe(false);
    expect(isDateOnly('2026-11-26T00:00:00Z')).toBe(false);
  });

  it('rejects unserved leftovers above prepared quantity', async () => {
    const id = () => new Organisation()._id;
    const row = new DailyLog({
      organisation: id(), outlet: id(), date: '2026-11-26', timezone: 'Asia/Kolkata', meal: 'lunch', item: id(), unit: 'plate',
      prepared: 10, unservedLeftover: 11, createdBy: id(), updatedBy: id()
    });
    await expect(row.validate()).rejects.toMatchObject({ errors: { unservedLeftover: expect.anything() } });
  });

  it('exposes health, CSRF and uniform validation errors without a database connection', async () => {
    process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-at-least-32-characters-long';
    process.env.CSRF_SECRET ||= 'test-csrf-secret-at-least-32-characters-long';
    const { createApp } = await import('../src/app.js');
    const app = createApp();
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(503);
    expect(health.body).toEqual({ status: 'unavailable', database: 'disconnected' });

    const agent = request.agent(app);
    const csrf = await agent.get('/api/v1/auth/csrf');
    expect(csrf.status).toBe(200);
    expect(csrf.headers['set-cookie'][0]).toContain('SameSite=Strict');
    const missingToken = await request(app).post('/api/v1/auth/register').send({});
    expect(missingToken.status).toBe(403);
    const invalidBody = await agent.post('/api/v1/auth/register').set('X-CSRF-Token', csrf.body.csrfToken).send({});
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.error.code).toBe('VALIDATION_ERROR');
  });
});
