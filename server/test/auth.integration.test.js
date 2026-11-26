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
      organisationName: name, outletName: 'Main dining hall', name: 'Test Admin', email, password: 'test-password-with-12-chars', timezone: 'Asia/Kolkata'
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
    const forbidden = await manager.agent.post('/api/v1/outlets').set('X-CSRF-Token', manager.token).send({ name: 'Manager-created outlet' });
    expect(forbidden.status).toBe(403);

    const other = await registerOrg(`WasteWise Other ${suffix}`, `other-${suffix}@example.test`);
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
