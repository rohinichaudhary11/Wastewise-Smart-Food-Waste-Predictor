import { Router, text } from 'express';
import mongoose from 'mongoose';
import { AuditLog, CalendarEvent, DailyLog, MenuItem, Outlet } from '../models/index.js';
import { isDateOnly } from '../models/validators.js';
import { requireAuth, requireRole } from '../security/middleware.js';
import { calendarEventSchema, dailyLogSchema, importRowSchema, manualEstimateSchema, menuItemSchema, menuItemUpdateSchema } from './validation.js';

const menuRouter = Router();
const logsRouter = Router();
const calendarRouter = Router();
const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];
const csvHeaders = ['outletId', 'date', 'meal', 'itemId', 'prepared', 'unservedLeftover', 'plateWaste', 'soldOut', 'soldOutAt', 'customerCount', 'remarks'];
const positiveInt = (value, fallback, maximum) => {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
};
const schemaResult = (schema, body, res) => {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid request data.' } });
  return null;
};
const idIsValid = value => mongoose.isValidObjectId(value);
const queryDateIsValid = value => typeof value === 'string' && isDateOnly(value);

async function outletInOrganisation(outletId, organisationId) {
  if (!idIsValid(outletId)) return null;
  return Outlet.findOne({ _id: outletId, organisation: organisationId, isActive: true });
}

async function menuItemInOrganisation(itemId, outletId, organisationId) {
  if (!idIsValid(itemId)) return null;
  return MenuItem.findOne({ _id: itemId, outlet: outletId, organisation: organisationId, isActive: true });
}

function pagination(req, res, next) {
  req.page = positiveInt(req.query.page, 1, 1_000_000);
  req.limit = positiveInt(req.query.limit, 50, 200);
  req.skip = (req.page - 1) * req.limit;
  next();
}

menuRouter.use(requireAuth);
menuRouter.get('/', pagination, async (req, res, next) => {
  try {
    const filter = { organisation: req.auth.organisationId };
    if (req.query.outletId) {
      if (!idIsValid(req.query.outletId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid outlet.' } });
      filter.outlet = req.query.outletId;
    }
    if (!(req.auth.role === 'admin' && req.query.includeInactive === 'true')) filter.isActive = true;
    const [data, total] = await Promise.all([
      MenuItem.find(filter).sort({ category: 1, name: 1 }).skip(req.skip).limit(req.limit).lean(),
      MenuItem.countDocuments(filter)
    ]);
    res.json({ data, pagination: { page: req.page, limit: req.limit, total, pages: Math.ceil(total / req.limit) } });
  } catch (error) { next(error); }
});
menuRouter.post('/', requireRole('admin'), async (req, res, next) => {
  const input = schemaResult(menuItemSchema, req.body, res);
  if (!input) return;
  try {
    if (!await outletInOrganisation(input.outletId, req.auth.organisationId)) return res.status(404).json({ error: { code: 'OUTLET_NOT_FOUND', message: 'Outlet not found.' } });
    const { outletId, ...fields } = input;
    const [item] = await MenuItem.create([{ ...fields, outlet: outletId, organisation: req.auth.organisationId }]);
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'menu_item.created', entityType: 'MenuItem', entityId: item._id });
    res.status(201).json({ data: item });
  } catch (error) { next(error); }
});
menuRouter.patch('/:itemId/manual-estimate', requireRole('admin', 'manager'), async (req, res, next) => {
  const input = schemaResult(manualEstimateSchema, req.body, res);
  if (!input) return;
  try {
    if (!idIsValid(req.params.itemId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid menu item.' } });
    const item = await MenuItem.findOne({ _id: req.params.itemId, organisation: req.auth.organisationId, isActive: true });
    if (!item) return res.status(404).json({ error: { code: 'MENU_ITEM_NOT_FOUND', message: 'Active menu item not found.' } });
    item.manualEstimates = { ...(item.manualEstimates?.toObject?.() || item.manualEstimates || {}), [input.meal]: input.quantity };
    await item.save();
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'menu_item.manual_estimate_updated', entityType: 'MenuItem', entityId: item._id, metadata: { meal: input.meal, quantity: input.quantity } });
    res.json({ data: { itemId: item._id, meal: input.meal, quantity: item.manualEstimates[input.meal] } });
  } catch (error) { next(error); }
});

menuRouter.patch('/:itemId', requireRole('admin'), async (req, res, next) => {
  const input = schemaResult(menuItemUpdateSchema, req.body, res);
  if (!input) return;
  try {
    const item = await MenuItem.findOneAndUpdate({ _id: req.params.itemId, organisation: req.auth.organisationId }, input, { returnDocument: 'after', runValidators: true });
    if (!item) return res.status(404).json({ error: { code: 'MENU_ITEM_NOT_FOUND', message: 'Menu item not found.' } });
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'menu_item.updated', entityType: 'MenuItem', entityId: item._id, metadata: input });
    res.json({ data: item });
  } catch (error) { next(error); }
});
menuRouter.delete('/:itemId', requireRole('admin'), async (req, res, next) => {
  try {
    const item = await MenuItem.findOneAndUpdate({ _id: req.params.itemId, organisation: req.auth.organisationId, isActive: true }, { isActive: false }, { returnDocument: 'after' });
    if (!item) return res.status(404).json({ error: { code: 'MENU_ITEM_NOT_FOUND', message: 'Active menu item not found.' } });
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'menu_item.archived', entityType: 'MenuItem', entityId: item._id });
    res.json({ data: item });
  } catch (error) { next(error); }
});

logsRouter.use(requireAuth);
logsRouter.get('/template', (_req, res) => {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="wastewise-daily-logs-template.csv"', 'Cache-Control': 'no-store' });
  res.send(`${csvHeaders.join(',')}\r\n`);
});
logsRouter.get('/export', pagination, async (req, res, next) => {
  try {
    const filter = { organisation: req.auth.organisationId };
    for (const key of ['outletId', 'date', 'meal']) {
      const field = key === 'outletId' ? 'outlet' : key;
      if (!req.query[key]) continue;
      if (key === 'outletId' && !idIsValid(req.query[key])) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid outlet.' } });
      if (key === 'meal' && !meals.includes(req.query[key])) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid meal.' } });
      if (key === 'date' && !queryDateIsValid(req.query[key])) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use a real date in YYYY-MM-DD format.' } });
      filter[field] = req.query[key];
    }
    req.limit = positiveInt(req.query.limit, 5000, 5000);
    const logs = await DailyLog.find(filter).sort({ date: -1, meal: 1 }).skip(req.skip).limit(req.limit).populate('item', 'name').lean();
    const rows = logs.map(log => [log.outlet, log.date, log.meal, log.item?._id, log.prepared, log.unservedLeftover, log.plateWaste, log.soldOut, log.soldOutAt?.toISOString() || '', log.customerCount ?? '', log.remarks]);
    const csv = [csvHeaders, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="wastewise-daily-logs.csv"', 'Cache-Control': 'no-store' });
    res.send(`${csv}\r\n`);
  } catch (error) { next(error); }
});
logsRouter.get('/', pagination, async (req, res, next) => {
  try {
    const filter = { organisation: req.auth.organisationId };
    if (req.query.outletId) {
      if (!idIsValid(req.query.outletId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid outlet.' } });
      filter.outlet = req.query.outletId;
    }
    if (req.query.date && !queryDateIsValid(req.query.date)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use a real date in YYYY-MM-DD format.' } });
    if (req.query.from && !queryDateIsValid(req.query.from)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use a real start date in YYYY-MM-DD format.' } });
    if (req.query.to && !queryDateIsValid(req.query.to)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use a real end date in YYYY-MM-DD format.' } });
    if (req.query.date && (req.query.from || req.query.to)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use either a date or a date range.' } });
    if (req.query.date) filter.date = req.query.date;
    if (req.query.from || req.query.to) filter.date = { ...(req.query.from ? { $gte: req.query.from } : {}), ...(req.query.to ? { $lte: req.query.to } : {}) };
    if (req.query.meal) {
      if (!meals.includes(req.query.meal)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid meal.' } });
      filter.meal = req.query.meal;
    }
    const [data, total] = await Promise.all([
      DailyLog.find(filter).sort({ date: -1, meal: 1, createdAt: -1 }).skip(req.skip).limit(req.limit).populate('item', 'name category unit costPerUnit').populate('outlet', 'name timezone').lean(),
      DailyLog.countDocuments(filter)
    ]);
    res.json({ data, pagination: { page: req.page, limit: req.limit, total, pages: Math.ceil(total / req.limit) } });
  } catch (error) { next(error); }
});
logsRouter.put('/', async (req, res, next) => {
  const input = schemaResult(dailyLogSchema, req.body, res);
  if (!input) return;
  try {
    const [outlet, item] = await Promise.all([
      outletInOrganisation(input.outletId, req.auth.organisationId),
      menuItemInOrganisation(input.itemId, input.outletId, req.auth.organisationId)
    ]);
    if (!outlet) return res.status(404).json({ error: { code: 'OUTLET_NOT_FOUND', message: 'Outlet not found.' } });
    if (!item) return res.status(404).json({ error: { code: 'MENU_ITEM_NOT_FOUND', message: 'Active menu item for this outlet not found.' } });
    const { outletId, itemId, ...fields } = input;
    const identity = { organisation: req.auth.organisationId, outlet: outletId, date: input.date, meal: input.meal, item: itemId };
    const log = await DailyLog.findOne(identity) || new DailyLog({ ...identity, createdBy: req.auth.userId });
    Object.assign(log, fields, { timezone: outlet.timezone, unit: item.unit, updatedBy: req.auth.userId });
    await log.save();
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'daily_log.saved', entityType: 'DailyLog', entityId: log._id });
    res.json({ data: log });
  } catch (error) { next(error); }
});

logsRouter.post('/import/template', (_req, res) => res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET /logs/template to download the import template.' } }));
logsRouter.post('/import/preview', text({ type: ['text/csv', 'text/plain'], limit: '5mb' }), async (req, res, next) => {
  try {
    const report = await inspectCsv(req.body, req.auth.organisationId);
    res.json({ ...report, preview: true });
  } catch (error) { next(error); }
});
logsRouter.post('/import', text({ type: ['text/csv', 'text/plain'], limit: '5mb' }), async (req, res, next) => {
  try {
    const report = await inspectCsv(req.body, req.auth.organisationId);
    let imported = 0;
    const importErrors = [...report.errors];
    for (const row of report.rows.filter(row => row.status === 'ready')) {
      try {
        const record = { ...row.data };
        delete record._rowNumber;
        await DailyLog.create({ ...record, organisation: req.auth.organisationId, createdBy: req.auth.userId, updatedBy: req.auth.userId });
        imported += 1;
      } catch (error) {
        importErrors.push({ row: row.row, message: error?.code === 11000 ? 'A daily log already exists for this outlet, date, meal, and item.' : 'This row could not be saved.' });
      }
    }
    if (imported) await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'daily_log.csv_imported', entityType: 'DailyLog', metadata: { imported, errors: importErrors.length } });
    res.status(importErrors.length ? 207 : 201).json({ imported, errors: importErrors, totalRows: report.totalRows });
  } catch (error) { next(error); }
});

calendarRouter.use(requireAuth);
calendarRouter.get('/', pagination, async (req, res, next) => {
  try {
    const filter = { organisation: req.auth.organisationId };
    if (req.query.from && !queryDateIsValid(req.query.from)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use a real start date in YYYY-MM-DD format.' } });
    if (req.query.to && !queryDateIsValid(req.query.to)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use a real end date in YYYY-MM-DD format.' } });
    if (req.query.from || req.query.to) filter.date = { ...(req.query.from ? { $gte: req.query.from } : {}), ...(req.query.to ? { $lte: req.query.to } : {}) };
    if (req.query.outletId) {
      if (!idIsValid(req.query.outletId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid outlet.' } });
      filter.$or = [{ outlet: req.query.outletId }, { outlet: null }];
    }
    const [data, total] = await Promise.all([
      CalendarEvent.find(filter).sort({ date: 1, title: 1 }).skip(req.skip).limit(req.limit).populate('outlet', 'name').lean(),
      CalendarEvent.countDocuments(filter)
    ]);
    res.json({ data, pagination: { page: req.page, limit: req.limit, total, pages: Math.ceil(total / req.limit) } });
  } catch (error) { next(error); }
});
calendarRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  const input = schemaResult(calendarEventSchema, req.body, res);
  if (!input) return;
  try {
    if (input.outletId && !await outletInOrganisation(input.outletId, req.auth.organisationId)) return res.status(404).json({ error: { code: 'OUTLET_NOT_FOUND', message: 'Outlet not found.' } });
    const { outletId, ...fields } = input;
    const [event] = await CalendarEvent.create([{ ...fields, outlet: outletId || null, organisation: req.auth.organisationId, createdBy: req.auth.userId }]);
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'calendar_event.created', entityType: 'CalendarEvent', entityId: event._id });
    res.status(201).json({ data: event });
  } catch (error) { next(error); }
});
calendarRouter.delete('/:eventId', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const event = await CalendarEvent.findOneAndDelete({ _id: req.params.eventId, organisation: req.auth.organisationId });
    if (!event) return res.status(404).json({ error: { code: 'CALENDAR_EVENT_NOT_FOUND', message: 'Calendar event not found.' } });
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'calendar_event.deleted', entityType: 'CalendarEvent', entityId: event._id });
    res.status(204).end();
  } catch (error) { next(error); }
});

async function inspectCsv(csv, organisationId) {
  if (typeof csv !== 'string' || !csv.trim()) throw Object.assign(new Error('Choose a non-empty CSV file.'), { status: 400, code: 'INVALID_CSV' });
  const table = parseCsv(csv);
  if (table.length < 2) throw Object.assign(new Error('The CSV has a header but no data rows.'), { status: 400, code: 'INVALID_CSV' });
  const headers = table[0].map(value => value.replace(/^\uFEFF/, '').trim());
  if (headers.length !== csvHeaders.length || csvHeaders.some((header, index) => headers[index] !== header)) throw Object.assign(new Error(`CSV columns must match the template: ${csvHeaders.join(', ')}.`), { status: 400, code: 'INVALID_CSV_HEADER' });
  const entries = table.slice(1).filter(row => row.some(value => value.trim() !== ''));
  if (entries.length > 500) throw Object.assign(new Error('Import up to 500 rows at a time.'), { status: 413, code: 'CSV_ROW_LIMIT' });
  const rows = [];
  const errors = [];
  const seen = new Set();
  const outletIds = new Set();
  const itemIds = new Set();
  for (const [index, cells] of entries.entries()) {
    const rowNumber = index + 2;
    if (cells.length !== csvHeaders.length) {
      const message = `Expected ${csvHeaders.length} columns but found ${cells.length}.`;
      errors.push({ row: rowNumber, message });
      rows.push({ row: rowNumber, status: 'error', errors: [message] });
      continue;
    }
    const record = Object.fromEntries(csvHeaders.map((header, cellIndex) => [header, cells[cellIndex] ?? '']));
    const parsed = importRowSchema.safeParse(record);
    if (!parsed.success) {
      const rowErrors = parsed.error.issues.map(issue => issue.message);
      errors.push({ row: rowNumber, message: rowErrors.join(' ') });
      rows.push({ row: rowNumber, status: 'error', errors: rowErrors });
      continue;
    }
    const value = parsed.data;
    if (value.unservedLeftover > value.prepared) {
      errors.push({ row: rowNumber, message: 'Unserved leftover cannot exceed prepared quantity.' });
      rows.push({ row: rowNumber, status: 'error', errors: ['Unserved leftover cannot exceed prepared quantity.'] });
      continue;
    }
    if (value.plateWaste > value.prepared - value.unservedLeftover) {
      errors.push({ row: rowNumber, message: 'Plate waste cannot exceed the served quantity.' });
      rows.push({ row: rowNumber, status: 'error', errors: ['Plate waste cannot exceed the served quantity.'] });
      continue;
    }
    if (value.soldOut && !value.soldOutAt) {
      errors.push({ row: rowNumber, message: 'Add the time the item sold out.' });
      rows.push({ row: rowNumber, status: 'error', errors: ['Add the time the item sold out.'] });
      continue;
    }
    const key = [value.outletId, value.date, value.meal, value.itemId].join('|');
    if (seen.has(key)) {
      errors.push({ row: rowNumber, message: 'This row duplicates an earlier row in the file.' });
      rows.push({ row: rowNumber, status: 'error', errors: ['This row duplicates an earlier row in the file.'] });
      continue;
    }
    seen.add(key);
    outletIds.add(value.outletId);
    itemIds.add(value.itemId);
    rows.push({ row: rowNumber, status: 'checking', data: { ...value, _rowNumber: rowNumber } });
  }

  const [outlets, items] = await Promise.all([
    Outlet.find({ _id: { $in: [...outletIds] }, organisation: organisationId, isActive: true }).select('_id timezone'),
    MenuItem.find({ _id: { $in: [...itemIds] }, organisation: organisationId, isActive: true }).select('_id outlet unit')
  ]);
  const outletMap = new Map(outlets.map(outlet => [String(outlet._id), outlet]));
  const itemMap = new Map(items.map(item => [String(item._id), item]));
  const candidates = [];
  for (const row of rows.filter(item => item.status === 'checking')) {
    const data = row.data;
    const outlet = outletMap.get(data.outletId);
    const item = itemMap.get(data.itemId);
    const messages = [];
    if (!outlet) messages.push('Outlet was not found in this organisation.');
    if (!item || item.outlet.toString() !== data.outletId) messages.push('Menu item was not found for this outlet.');
    if (messages.length) {
      errors.push({ row: row.row, message: messages.join(' ') });
      row.status = 'error';
      row.errors = messages;
      delete row.data;
      continue;
    }
    const soldOutAt = data.soldOutAt ? new Date(data.soldOutAt) : null;
    const normalized = {
      outlet: data.outletId,
      date: data.date,
      meal: data.meal,
      item: data.itemId,
      unit: item.unit,
      timezone: outlet.timezone,
      prepared: data.prepared,
      unservedLeftover: data.unservedLeftover,
      plateWaste: data.plateWaste,
      soldOut: data.soldOut,
      soldOutAt,
      customerCount: data.customerCount,
      remarks: data.remarks,
      _rowNumber: row.row
    };
    const validation = dailyLogSchema.safeParse({
      outletId: data.outletId, itemId: data.itemId, date: data.date, meal: data.meal,
      prepared: data.prepared, unservedLeftover: data.unservedLeftover, plateWaste: data.plateWaste,
      soldOut: data.soldOut, soldOutAt: data.soldOutAt || null, customerCount: data.customerCount, remarks: data.remarks
    });
    if (!validation.success) {
      const messages = validation.error.issues.map(issue => issue.message);
      errors.push({ row: row.row, message: messages.join(' ') });
      row.status = 'error';
      row.errors = messages;
      delete row.data;
      continue;
    }
    row.data = normalized;
    row.status = 'ready';
    candidates.push(normalized);
  }
  if (candidates.length) {
    const existing = await DailyLog.find({ organisation: organisationId, $or: candidates.map(row => ({ outlet: row.outlet, date: row.date, meal: row.meal, item: row.item })) }).select('outlet date meal item').lean();
    const existingKeys = new Set(existing.map(row => [row.outlet, row.date, row.meal, row.item].join('|')));
    for (const row of rows.filter(item => item.status === 'ready')) {
      const key = [row.data.outlet, row.data.date, row.data.meal, row.data.item].join('|');
      if (!existingKeys.has(key)) continue;
      const message = 'A daily log already exists for this outlet, date, meal, and item.';
      errors.push({ row: row.row, message });
      row.status = 'duplicate';
      row.errors = [message];
    }
  }
  return { totalRows: entries.length, readyRows: rows.filter(row => row.status === 'ready').length, rows: rows.map(row => ({ row: row.row, status: row.status, ...(row.errors ? { errors: row.errors } : {}), ...(row.data ? { data: row.data } : {}) })), errors };
}

function parseCsv(input) {
  const textValue = input.replace(/^\uFEFF/, '');
  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < textValue.length; index += 1) {
    const character = textValue[index];
    if (quoted) {
      if (character === '"' && textValue[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell === '') quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && textValue[index + 1] === '\n') index += 1;
      row.push(cell); records.push(row); row = []; cell = '';
    } else cell += character;
  }
  if (quoted) throw Object.assign(new Error('CSV contains an unterminated quoted value.'), { status: 400, code: 'INVALID_CSV' });
  if (cell.length || row.length) { row.push(cell); records.push(row); }
  return records;
}

function csvCell(value) {
  let textValue = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+@\-\t\r]/.test(textValue)) textValue = `'${textValue}`;
  return `"${textValue.replaceAll('"', '""')}"`;
}

export { menuRouter, logsRouter, calendarRouter };
