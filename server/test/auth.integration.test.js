import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { Organisation, Outlet, User, MenuItem, DailyLog, CalendarEvent, Forecast, ModelRun, Alert, AuditLog } from '../src/models/index.js';

const mongoUri = process.env.TEST_MONGODB_URI;
const runIntegration = describe.skipIf(!mongoUri);

runIntegration('authentication and tenant boundaries with MongoDB', () => {
  const app = createApp();
  const agents = [];
  const organisationIds = [];
  const models = [Outlet, User, MenuItem, DailyLog, CalendarEvent, Forecast, ModelRun, Alert, AuditLog];

  async function makeAgent() {
    const agent = request.agent(app);
    agents.push(agent);
    const csrf = await agent.get('/api/v1/auth/csrf');
    return { agent, token: csrf.body.csrfToken };
  }

  async function registerOrg(name, email) {
    const context = await makeAgent();
    const response = await context.agent.post('/api/v1/auth/register').set('X-CSRF-Token', context.token).send({
      organisationName: name, outletName: 'Main dining hall', name: 'Test Admin', email, password: 'test1234', timezone: 'Asia/Kolkata'
    });
    expect(response.status).toBe(201);
    organisationIds.push(response.body.user.organisationId);
    return { ...context, user: response.body.user, response };
  }

  beforeAll(async () => {
    await mongoose.connect(mongoUri);
    await Promise.all([Organisation, ...models].map(model => model.createIndexes()));
  });
  afterAll(async () => {
    if (organisationIds.length) {
      const ids = { $in: organisationIds };
      await Promise.all(models.map(model => model.deleteMany({ organisation: ids })));
      await Organisation.deleteMany({ _id: ids });
    }
    await mongoose.disconnect();
  });

  it('rotates refresh tokens, enforces roles, and scopes outlet queries to the signed-in organisation', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const admin = await registerOrg(`WasteWise Test ${suffix}`, `admin-${suffix}@example.test`);
    const outletResponse = await admin.agent.post('/api/v1/outlets').set('X-CSRF-Token', admin.token).send({ name: 'Library café', timezone: 'Asia/Kolkata' });
    expect(outletResponse.status).toBe(201);

    const managerResponse = await admin.agent.post('/api/v1/users').set('X-CSRF-Token', admin.token).send({
      name: 'Test Manager', email: `manager-${suffix}@example.test`, password: 'manager-password-12', role: 'manager'
    });
    expect(managerResponse.status).toBe(201);
    const menuResponse = await admin.agent.post('/api/v1/menu-items').set('X-CSRF-Token', admin.token).send({
      outletId: outletResponse.body.data._id, name: 'Steamed rice', category: 'Grains', unit: 'plate', costPerUnit: 18, batchSize: 10, shelfLifeHours: 4, isSafelyReusable: false
    });
    expect(menuResponse.status).toBe(201);
    const logInput = {
      outletId: outletResponse.body.data._id, date: '2025-07-10', meal: 'lunch', itemId: menuResponse.body.data._id,
      prepared: 80, unservedLeftover: 10, plateWaste: 5, soldOut: false, soldOutAt: null, customerCount: 120, remarks: 'First shift'
    };
    const firstLog = await admin.agent.put('/api/v1/logs').set('X-CSRF-Token', admin.token).send(logInput);
    expect(firstLog.status).toBe(200);
    const updatedLog = await admin.agent.put('/api/v1/logs').set('X-CSRF-Token', admin.token).send({ ...logInput, prepared: 90, remarks: 'Updated shift' });
    expect(updatedLog.status).toBe(200);
    expect(updatedLog.body.data._id).toBe(firstLog.body.data._id);
    expect((await admin.agent.get('/api/v1/logs?date=2025-07-10')).body.data).toHaveLength(1);
    const invalidLog = await admin.agent.put('/api/v1/logs').set('X-CSRF-Token', admin.token).send({ ...logInput, unservedLeftover: 91 });
    expect(invalidLog.status).toBe(400);

    const calendarEvent = await admin.agent.post('/api/v1/calendar').set('X-CSRF-Token', admin.token).send({
      outletId: outletResponse.body.data._id, date: '2025-07-10', type: 'exam', title: 'Final exams'
    });
    expect(calendarEvent.status).toBe(201);
    expect((await admin.agent.get('/api/v1/calendar?from=2025-07-10&to=2025-07-10&outletId=' + outletResponse.body.data._id)).body.data).toHaveLength(1);

    const headers = 'outletId,date,meal,itemId,prepared,unservedLeftover,plateWaste,soldOut,soldOutAt,customerCount,remarks';
    const csvRow = `${outletResponse.body.data._id},2025-07-11,lunch,${menuResponse.body.data._id},70,8,4,false,,100,=1+1`;
    const csv = `${headers}\r\n${csvRow}\r\n`;
    const preview = await admin.agent.post('/api/v1/logs/import/preview').set('X-CSRF-Token', admin.token).set('Content-Type', 'text/csv').send(csv);
    expect(preview.status).toBe(200);
    expect(preview.body.readyRows).toBe(1);
    const imported = await admin.agent.post('/api/v1/logs/import').set('X-CSRF-Token', admin.token).set('Content-Type', 'text/csv').send(csv);
    expect(imported.status).toBe(201);
    expect(imported.body.imported).toBe(1);
    const duplicate = await admin.agent.post('/api/v1/logs/import/preview').set('X-CSRF-Token', admin.token).set('Content-Type', 'text/csv').send(csv);
    expect(duplicate.body.readyRows).toBe(0);
    expect(duplicate.body.errors[0].message).toMatch(/already exists/);
    const exported = await admin.agent.get('/api/v1/logs/export?date=2025-07-11');
    expect(exported.text).toContain("'=1+1");
    const analytics = await admin.agent.get(`/api/v1/analytics?outletId=${outletResponse.body.data._id}&from=2025-07-10&to=2025-07-11`);
    expect(analytics.status).toBe(200);
    expect(analytics.body.data.metrics).toMatchObject({ prepared: 160, waste: 27, wasteCost: 486, recordCount: 2, soldOutCount: 0 });
    expect(analytics.body.data.metrics.wasteRate).toBeCloseTo(27 / 160);
    const weeklyReport = await admin.agent.get(`/api/v1/reports/weekly?outletId=${outletResponse.body.data._id}&weekOf=2025-07-10`);
    expect(weeklyReport.status).toBe(200);
    expect(weeklyReport.headers['content-type']).toMatch(/application\/pdf/);
    expect(weeklyReport.headers['content-disposition']).toContain('2025-07-07-to-2025-07-13.pdf');
    expect(weeklyReport.body.subarray(0, 5).toString()).toBe('%PDF-');
    const trained = await admin.agent.post(`/api/v1/model-runs/${outletResponse.body.data._id}/train`).set('X-CSRF-Token', admin.token).send({});
    expect(trained.status).toBe(201);
    expect(trained.body.data.run.rowCount).toBe(2);
    expect(trained.body.data.result.entries[0].confidence).toBe('none');
    const registry = await admin.agent.get(`/api/v1/model-runs/${outletResponse.body.data._id}`);
    expect(registry.status).toBe(200);
    expect(registry.body.data.runs[0].modelVersion).toBe(trained.body.data.run.modelVersion);

    const manager = await makeAgent();
    const loginResponse = await manager.agent.post('/api/v1/auth/login').set('X-CSRF-Token', manager.token).send({
      organisationSlug: `wastewise-test-${suffix}`, email: `manager-${suffix}@example.test`, password: 'manager-password-12'
    });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.role).toBe('manager');
    const oldRefresh = loginResponse.headers['set-cookie'].find(cookie => cookie.startsWith('ww_refresh='))?.split(';')[0];
    expect(oldRefresh).toBeTruthy();

    const managerOutlets = await manager.agent.get('/api/v1/outlets');
    expect(managerOutlets.status).toBe(200);
    expect(managerOutlets.body.data).toHaveLength(2);
    const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const planDate = new Date(Date.parse(`${localToday}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
    const estimate = await manager.agent.patch(`/api/v1/menu-items/${menuResponse.body.data._id}/manual-estimate`).set('X-CSRF-Token', manager.token).send({ meal: 'lunch', quantity: 100 });
    expect(estimate.status).toBe(200);
    const plan = await manager.agent.post('/api/v1/forecasts/generate').set('X-CSRF-Token', manager.token).send({ outletId: outletResponse.body.data._id, date: planDate, meal: 'lunch', serviceLevel: 'balanced' });
    expect(plan.status).toBe(200);
    expect(plan.body.data).toHaveLength(1);
    expect(plan.body.data[0]).toMatchObject({ recommendedQuantity: 100, method: 'manual_estimate', confidence: 'none', needsEstimate: false });
    const accepted = await manager.agent.patch(`/api/v1/forecasts/${plan.body.data[0].forecastId}/decision`).set('X-CSRF-Token', manager.token).send({ action: 'accept', note: 'Confirmed with the kitchen lead.' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({ status: 'accepted', finalQuantity: 100 });
    const futureLog = await manager.agent.put('/api/v1/logs').set('X-CSRF-Token', manager.token).send({
      ...logInput, date: planDate, prepared: 120, unservedLeftover: 10, plateWaste: 20, remarks: 'Forecast accuracy check'
    });
    expect(futureLog.status).toBe(200);
    const accuracy = await manager.agent.get(`/api/v1/forecasts/accuracy?outletId=${outletResponse.body.data._id}&from=${planDate}&to=${planDate}`);
    expect(accuracy.status).toBe(200);
    expect(accuracy.body.data.summary).toMatchObject({ count: 1, mae: 10, pendingActualCount: 0, censoredCount: 0 });
    const overridden = await manager.agent.patch(`/api/v1/forecasts/${plan.body.data[0].forecastId}/decision`).set('X-CSRF-Token', manager.token).send({ action: 'override', quantity: 110, note: 'Matched to expected campus attendance.' });
    expect(overridden.status).toBe(200);
    expect(overridden.body.data).toMatchObject({ status: 'overridden', finalQuantity: 110 });
    const forbidden = await manager.agent.post('/api/v1/outlets').set('X-CSRF-Token', manager.token).send({ name: 'Manager-created outlet' });
    expect(forbidden.status).toBe(403);

    const other = await registerOrg(`WasteWise Other ${suffix}`, `other-${suffix}@example.test`);
    expect((await other.agent.get('/api/v1/menu-items')).body.data).toHaveLength(0);
    expect((await other.agent.get('/api/v1/logs?date=2025-07-10')).body.data).toHaveLength(0);
    expect((await other.agent.get('/api/v1/calendar?from=2025-07-10&to=2025-07-10')).body.data).toHaveLength(0);
    const isolatedAnalytics = await other.agent.get(`/api/v1/analytics?outletId=${outletResponse.body.data._id}&from=2025-07-10&to=2025-07-11`);
    expect(isolatedAnalytics.status).toBe(404);
    const isolatedReport = await other.agent.get(`/api/v1/reports/weekly?outletId=${outletResponse.body.data._id}&weekOf=2025-07-10`);
    expect(isolatedReport.status).toBe(404);
    const isolatedModelRuns = await other.agent.get(`/api/v1/model-runs/${outletResponse.body.data._id}`);
    expect(isolatedModelRuns.status).toBe(404);
    const crossTenant = await other.agent.patch(`/api/v1/outlets/${outletResponse.body.data._id}`).set('X-CSRF-Token', other.token).send({ name: 'Changed by another organisation' });
    expect(crossTenant.status).toBe(404);
    const isolatedUsers = await other.agent.get('/api/v1/users');
    expect(isolatedUsers.body.data).toHaveLength(1);
    expect(isolatedUsers.body.data[0].email).toBe(`other-${suffix}@example.test`);

    const rotated = await manager.agent.post('/api/v1/auth/refresh').set('X-CSRF-Token', manager.token).send({});
    expect(rotated.status).toBe(200);
    const replay = await request(app).post('/api/v1/auth/refresh')
      .set('Cookie', `ww_csrf=${manager.token}; ${oldRefresh}`)
      .set('X-CSRF-Token', manager.token).send({});
    expect(replay.status).toBe(401);
    expect((await manager.agent.get('/api/v1/auth/me')).status).toBe(401);
  });
});
