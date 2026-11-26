import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuditLog, CalendarEvent, DailyLog, Forecast, MenuItem, ModelRun, Outlet } from '../models/index.js';
import { isDateOnly } from '../models/validators.js';
import { requireAuth, requireRole } from '../security/middleware.js';
import { requestMl } from './training.js';

const router = Router();
const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];
const serviceLevels = { low_waste: 'p50', balanced: 'p80', avoid_sell_out: 'p90' };
const generateSchema = z.object({ outletId: z.string().regex(/^[a-f\d]{24}$/i), date: z.string().optional(), meal: z.enum(meals).optional(), serviceLevel: z.enum(Object.keys(serviceLevels)).default('balanced') }).strict();
const decisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept'), note: z.string().trim().max(500).default('') }).strict(),
  z.object({ action: z.literal('override'), quantity: z.coerce.number().finite().nonnegative().max(1_000_000), note: z.string().trim().min(1).max(500) }).strict()
]);

router.use(requireAuth);

router.get('/accuracy', async (req, res, next) => {
  try {
    const { outlet } = await resolveOutlet(req.query.outletId, req.auth.organisationId, res);
    if (!outlet) return;
    const today = dateInTimezone(new Date(), outlet.timezone);
    const to = req.query.to || today;
    const from = req.query.from || shiftDate(to, -89);
    if (!validRange(from, to)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid accuracy date range.' } });
    const forecasts = await Forecast.find({ organisation: req.auth.organisationId, outlet: outlet._id, predictionDate: { $gte: from, $lte: to } }).populate('item', 'name unit').sort({ predictionDate: 1 }).lean();
    const itemIds = [...new Set(forecasts.map(row => String(row.item?._id || row.item)))];
    const logs = itemIds.length ? await DailyLog.find({ organisation: req.auth.organisationId, outlet: outlet._id, item: { $in: itemIds }, date: { $gte: from, $lte: to } }).lean() : [];
    const actualByKey = new Map(logs.map(log => [forecastKey(log.date, log.meal, log.item), log]));
    const records = forecasts.map(forecast => {
      const log = actualByKey.get(forecastKey(forecast.predictionDate, forecast.meal, forecast.item?._id || forecast.item));
      return {
        date: forecast.predictionDate,
        itemId: String(forecast.item?._id || forecast.item),
        item: forecast.item?.name || 'Archived item',
        unit: forecast.item?.unit || '',
        meal: forecast.meal,
        predicted: forecast.quantiles.p50,
        baseline: forecast.baselineP50,
        actual: log ? Math.max(0, log.prepared - log.unservedLeftover) : null,
        censored: Boolean(log?.soldOut),
        modelVersion: forecast.modelVersion,
        status: forecast.status
      };
    });
    const scored = records.filter(record => record.actual !== null && !record.censored);
    const metrics = calculateMetrics(scored);
    const baselineRecords = scored.filter(record => record.baseline !== null);
    const baseline = calculateMetrics(baselineRecords.map(record => ({ ...record, predicted: record.baseline })));
    const itemGroups = new Map();
    for (const record of records) {
      const entry = itemGroups.get(record.itemId) || { itemId: record.itemId, item: record.item, unit: record.unit, records: [] };
      entry.records.push(record);
      itemGroups.set(record.itemId, entry);
    }
    const items = [...itemGroups.values()].map(group => {
      const rows = group.records.filter(record => record.actual !== null && !record.censored);
      const baseRows = rows.filter(record => record.baseline !== null);
      return { itemId: group.itemId, item: group.item, unit: group.unit, ...calculateMetrics(rows), baselineMae: calculateMetrics(baseRows.map(record => ({ ...record, predicted: record.baseline }))).mae, censoredCount: group.records.filter(record => record.censored).length, modelVersions: [...new Set(group.records.map(record => record.modelVersion))] };
    }).sort((a, b) => (b.mae ?? -1) - (a.mae ?? -1));
    res.json({ data: { outlet: { id: outlet._id, name: outlet.name }, range: { from, to }, summary: { ...metrics, baselineMae: baseline.mae, forecastCount: records.length, pendingActualCount: records.filter(record => record.actual === null).length, censoredCount: records.filter(record => record.censored).length }, items, records } });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const { outlet } = await resolveOutlet(req.query.outletId, req.auth.organisationId, res);
    if (!outlet) return;
    const date = req.query.date || shiftDate(dateInTimezone(new Date(), outlet.timezone), 1);
    if (!isDateOnly(date)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use a real plan date in YYYY-MM-DD format.' } });
    if (req.query.meal && !meals.includes(req.query.meal)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid meal.' } });
    const filter = { organisation: req.auth.organisationId, outlet: outlet._id, predictionDate: date };
    if (req.query.meal) filter.meal = req.query.meal;
    const forecasts = await Forecast.find(filter).populate('item', 'name category unit batchSize isSafelyReusable manualEstimates').sort({ meal: 1, 'item.name': 1 }).lean();
    const data = forecasts.map(forecast => ({
      forecastId: forecast._id,
      item: { id: forecast.item?._id, name: forecast.item?.name || 'Archived item', category: forecast.item?.category || '', unit: forecast.item?.unit || '', batchSize: forecast.item?.batchSize || 1, isSafelyReusable: forecast.item?.isSafelyReusable || false },
      manualEstimate: forecast.inputs?.managerEstimate ?? null,
      meal: forecast.meal, serviceLevel: forecast.serviceLevel, quantiles: forecast.quantiles,
      likelyRange: forecast.likelyRange, baselineP50: forecast.baselineP50,
      recommendedQuantity: forecast.recommendedQuantity, finalQuantity: forecast.finalQuantity,
      status: forecast.status, decisionNote: forecast.decisionNote, confidence: forecast.confidence,
      method: forecast.method, modelVersion: forecast.modelVersion, reasons: forecast.reasons,
      historyCount: forecast.inputs?.history?.length || 0,
      uncensoredHistoryCount: forecast.inputs?.history?.filter(row => !row.sold_out).length || 0,
      expectedCustomerCount: forecast.inputs?.expectedCustomerCount ?? null,
      lastSimilarDays: forecast.inputs?.history?.filter(row => !row.sold_out && new Date(`${row.date}T00:00:00.000Z`).getUTCDay() === new Date(`${date}T00:00:00.000Z`).getUTCDay()).slice(-3).reverse().map(row => ({ date: row.date, demand: Math.max(0, row.prepared - row.unserved_leftover) })) || [],
      source: forecast.inputs?.source || 'ml-service', needsEstimate: false,
      generatedAt: forecast.createdAt
    }));
    res.json({ data, date, timezone: outlet.timezone });
  } catch (error) { next(error); }
});

router.post('/generate', async (req, res, next) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid plan request.' } });
  try {
    const { outletId, meal, serviceLevel } = parsed.data;
    const { outlet } = await resolveOutlet(outletId, req.auth.organisationId, res);
    if (!outlet) return;
    const today = dateInTimezone(new Date(), outlet.timezone);
    const predictionDate = parsed.data.date || shiftDate(today, 1);
    if (!isDateOnly(predictionDate) || predictionDate <= today) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A plan date must be a valid future service date.' } });

    const menu = await MenuItem.find({ organisation: req.auth.organisationId, outlet: outlet._id, isActive: true }).sort({ name: 1 }).lean();
    if (!menu.length) return res.status(422).json({ error: { code: 'MENU_REQUIRED', message: 'Add active menu items before generating a plan.' } });
    const from = shiftDate(predictionDate, -364);
    const [logs, calendarEvents] = await Promise.all([
      DailyLog.find({ organisation: req.auth.organisationId, outlet: outlet._id, item: { $in: menu.map(item => item._id) }, date: { $gte: from, $lt: predictionDate } }).sort({ date: 1 }).lean(),
      CalendarEvent.find({ organisation: req.auth.organisationId, date: { $gte: from, $lte: predictionDate }, $or: [{ outlet: outlet._id }, { outlet: null }] }).select('date type').lean()
    ]);
    const flagsByDate = calendarFlags(calendarEvents);
    const customerEstimates = expectedCustomerCounts(logs);
    const mealsToPlan = meal ? [meal] : meals;
    const plans = [];
    for (const item of menu) {
      for (const serviceMeal of mealsToPlan) {
        const history = logs.filter(log => String(log.item) === String(item._id) && log.meal === serviceMeal);
        const expected = getExpectedCustomerCount(customerEstimates, predictionDate, serviceMeal);
        const flags = flagsByDate.get(predictionDate) || { holiday: false, exam: false, event: false };
        const mlHistory = history.map(log => ({
          date: log.date, item_id: String(log.item), meal: log.meal, prepared: log.prepared,
          unserved_leftover: log.unservedLeftover, sold_out: log.soldOut,
          ...(flagsByDate.get(log.date) || { holiday: false, exam: false, event: false }),
          expected_customer_count: getExpectedCustomerCount(customerEstimates, log.date, serviceMeal)
        }));
        const baseline = baselineForecast(history, predictionDate);
        const uncensoredCount = history.filter(log => !log.soldOut).length;
        let prediction;
        let source = 'ml-service';
        try {
          prediction = (await requestMl('/predict', { method: 'POST', body: JSON.stringify({
            outlet_id: String(outlet._id), item_id: String(item._id), meal: serviceMeal,
            prediction_date: predictionDate, history: mlHistory, ...flags,
            expected_customer_count: expected, manual_estimate: item.manualEstimates?.[serviceMeal] ?? null
          }) })).data;
        } catch {
          source = 'baseline-fallback';
          prediction = fallbackPrediction(history, baseline, item.manualEstimates?.[serviceMeal] ?? null, uncensoredCount);
        }
        if (prediction.p50 === null || prediction.p50 === undefined) {
          plans.push({ forecastId: null, item: { id: item._id, name: item.name, category: item.category, unit: item.unit, batchSize: item.batchSize, isSafelyReusable: item.isSafelyReusable }, manualEstimate: item.manualEstimates?.[serviceMeal] ?? null, meal: serviceMeal, serviceLevel, recommendedQuantity: null, quantiles: prediction, confidence: prediction.confidence, method: prediction.method, modelVersion: prediction.model_version, reasons: prediction.reasons, historyCount: history.length, uncensoredHistoryCount: uncensoredCount, expectedCustomerCount: expected, lastSimilarDays: lastSimilarDays(history, predictionDate), source, needsEstimate: true });
          continue;
        }
        const quantiles = { p50: Math.max(0, Number(prediction.p50)), p80: Math.max(Number(prediction.p50), Number(prediction.p80 ?? prediction.p50)), p90: Math.max(Number(prediction.p80 ?? prediction.p50), Number(prediction.p90 ?? prediction.p80 ?? prediction.p50)) };
        const baselineP50 = baseline.center;
        const recommendedQuantity = roundUpToBatch(quantiles[serviceLevels[serviceLevel]], item.batchSize);
        const range = { min: quantiles.p50, max: quantiles.p90 };
        const modelRun = await ModelRun.findOne({ organisation: req.auth.organisationId, outlet: outlet._id, modelVersion: prediction.model_version }).select('_id').lean();
        const identity = { organisation: req.auth.organisationId, outlet: outlet._id, item: item._id, predictionDate, meal: serviceMeal };
        const forecast = await Forecast.findOne(identity) || new Forecast({ ...identity, status: 'pending' });
        Object.assign(forecast, { timezone: outlet.timezone, serviceLevel, quantiles, likelyRange: range, baselineP50, recommendedQuantity, inputs: { history: mlHistory, expectedCustomerCount: expected, calendar: flags, batchSize: item.batchSize, reusable: item.isSafelyReusable, managerEstimate: item.manualEstimates?.[serviceMeal] ?? null, source }, reasons: prediction.reasons || [], confidence: prediction.confidence, method: prediction.method, modelRun: modelRun?._id || null, modelVersion: prediction.model_version });
        await forecast.save();
        plans.push({ forecastId: forecast._id, item: { id: item._id, name: item.name, category: item.category, unit: item.unit, batchSize: item.batchSize, isSafelyReusable: item.isSafelyReusable }, meal: serviceMeal, serviceLevel, quantiles, likelyRange: range, baselineP50, recommendedQuantity, finalQuantity: forecast.finalQuantity, status: forecast.status, decisionNote: forecast.decisionNote, confidence: forecast.confidence, method: prediction.method, modelVersion: prediction.model_version, reasons: prediction.reasons || [], historyCount: history.length, uncensoredHistoryCount: uncensoredCount, expectedCustomerCount: expected, lastSimilarDays: lastSimilarDays(history, predictionDate), source, needsEstimate: false });
      }
    }
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: 'forecast.generated', entityType: 'Forecast', metadata: { outlet: String(outlet._id), predictionDate, meal: meal || 'all', serviceLevel, itemCount: plans.length } });
    res.json({ data: plans, date: predictionDate, timezone: outlet.timezone, generatedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

router.patch('/:forecastId/decision', requireRole('admin', 'manager'), async (req, res, next) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid forecast decision.' } });
  try {
    if (!mongoose.isValidObjectId(req.params.forecastId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid forecast.' } });
    const forecast = await Forecast.findOne({ _id: req.params.forecastId, organisation: req.auth.organisationId });
    if (!forecast) return res.status(404).json({ error: { code: 'FORECAST_NOT_FOUND', message: 'Forecast not found.' } });
    const { action } = parsed.data;
    forecast.status = action === 'accept' ? 'accepted' : 'overridden';
    forecast.finalQuantity = action === 'accept' ? forecast.recommendedQuantity : parsed.data.quantity;
    forecast.decisionNote = parsed.data.note;
    forecast.decidedBy = req.auth.userId;
    forecast.decidedAt = new Date();
    await forecast.save();
    await AuditLog.create({ organisation: req.auth.organisationId, actor: req.auth.userId, action: `forecast.${action === 'accept' ? 'accepted' : 'overridden'}`, entityType: 'Forecast', entityId: forecast._id, metadata: { quantity: forecast.finalQuantity, note: forecast.decisionNote } });
    res.json({ data: forecast });
  } catch (error) { next(error); }
});

async function resolveOutlet(outletId, organisationId, res) {
  if (!mongoose.isValidObjectId(outletId)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid outlet.' } });
    return { outlet: null };
  }
  const outlet = await Outlet.findOne({ _id: outletId, organisation: organisationId, isActive: true }).lean();
  if (!outlet) res.status(404).json({ error: { code: 'OUTLET_NOT_FOUND', message: 'Outlet not found.' } });
  return { outlet };
}

function dateInTimezone(value, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(value);
}

function shiftDate(value, days) {
  return new Date(Date.parse(`${value}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function validRange(from, to) {
  return isDateOnly(from) && isDateOnly(to) && from <= to;
}

function calendarFlags(events) {
  const result = new Map();
  for (const event of events) {
    const flags = result.get(event.date) || { holiday: false, exam: false, event: false };
    if (event.type === 'holiday' || event.type === 'vacation') flags.holiday = true;
    if (event.type === 'exam') flags.exam = true;
    if (event.type === 'college_event' || event.type === 'special_menu') flags.event = true;
    result.set(event.date, flags);
  }
  return result;
}

function expectedCustomerCounts(logs) {
  const unique = new Map();
  for (const log of logs) {
    if (log.customerCount === null || log.customerCount === undefined) continue;
    const key = `${log.date}|${log.meal}`;
    if (!unique.has(key)) unique.set(key, { date: log.date, meal: log.meal, count: log.customerCount });
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function getExpectedCustomerCount(records, targetDate, meal) {
  const prior = records.filter(row => row.meal === meal && row.date < targetDate);
  const weekday = new Date(`${targetDate}T00:00:00.000Z`).getUTCDay();
  const sameWeekday = prior.filter(row => new Date(`${row.date}T00:00:00.000Z`).getUTCDay() === weekday).slice(-8);
  const values = (sameWeekday.length ? sameWeekday : prior.slice(-7)).map(row => row.count).sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function baselineForecast(history, targetDate) {
  const clean = history.filter(log => !log.soldOut && log.date < targetDate).map(log => ({ date: log.date, demand: Math.max(0, log.prepared - log.unservedLeftover) }));
  const sameWeekday = clean.filter(row => new Date(`${row.date}T00:00:00.000Z`).getUTCDay() === new Date(`${targetDate}T00:00:00.000Z`).getUTCDay());
  const priorWeek = clean.filter(row => shiftDate(targetDate, -7) === row.date);
  const selected = priorWeek.length ? priorWeek : sameWeekday.length ? sameWeekday.slice(-4) : clean.slice(-7);
  if (!selected.length) return { center: null, p80: null, p90: null, method: 'no_history' };
  const values = clean.map(row => row.demand).sort((a, b) => a - b);
  const centerValues = selected.map(row => row.demand).sort((a, b) => a - b);
  const center = median(centerValues);
  return { center, p80: Math.max(center, quantile(values, 0.8)), p90: Math.max(center, quantile(values, 0.9)), method: priorWeek.length ? 'last_same_weekday' : sameWeekday.length ? 'same_weekday_median' : 'rolling_median' };
}

function fallbackPrediction(history, baseline, manualEstimate, uncensoredCount) {
  if (uncensoredCount < 7) {
    const value = manualEstimate === null || manualEstimate === undefined ? null : Number(manualEstimate);
    return { p50: value, p80: value, p90: value, method: 'manual_estimate', confidence: 'none', model_version: value === null ? 'insufficient-history' : 'manual-estimate', reasons: [value === null ? 'Fewer than seven uncensored prior services; a manager estimate is needed.' : 'Manager estimate used because fewer than seven uncensored prior services are available.'] };
  }
  if (baseline.center === null) return { p50: null, p80: null, p90: null, method: baseline.method, confidence: 'low', model_version: 'baseline-fallback-v1', reasons: ['No uncensored demand history is available.'] };
  return { p50: baseline.center, p80: baseline.p80, p90: baseline.p90, method: baseline.method, confidence: 'low', model_version: 'baseline-fallback-v1', reasons: [`Baseline retained while the ML service is unavailable; ${uncensoredCount} uncensored past services informed the estimate.`] };
}

function lastSimilarDays(history, targetDate) {
  const weekday = new Date(`${targetDate}T00:00:00.000Z`).getUTCDay();
  return history.filter(log => !log.soldOut && new Date(`${log.date}T00:00:00.000Z`).getUTCDay() === weekday).slice(-3).reverse().map(log => ({ date: log.date, demand: Math.max(0, log.prepared - log.unservedLeftover) }));
}

function roundUpToBatch(quantity, batchSize) {
  if (!quantity || !batchSize) return Number(quantity || 0);
  return Number((Math.ceil((quantity - 1e-10) / batchSize) * batchSize).toFixed(3));
}

function forecastKey(date, meal, item) { return `${date}|${meal}|${String(item)}`; }
function median(values) { const middle = Math.floor(values.length / 2); return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2; }
function quantile(values, fraction) {
  if (!values.length) return 0;
  const position = (values.length - 1) * fraction;
  const lower = Math.floor(position); const upper = Math.ceil(position);
  return values[lower] + (values[upper] - values[lower]) * (position - lower);
}
function calculateMetrics(records) {
  if (!records.length) return { count: 0, mae: null, wape: null, bias: null };
  const errors = records.map(row => row.predicted - row.actual);
  const denominator = records.reduce((sum, row) => sum + Math.abs(row.actual), 0);
  return { count: records.length, mae: errors.reduce((sum, value) => sum + Math.abs(value), 0) / records.length, wape: denominator ? errors.reduce((sum, value) => sum + Math.abs(value), 0) / denominator : null, bias: errors.reduce((sum, value) => sum + value, 0) / records.length };
}

export { baselineForecast, calculateMetrics, fallbackPrediction, getExpectedCustomerCount, median, quantile, roundUpToBatch };
export default router;
