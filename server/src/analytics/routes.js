import { Router } from 'express';
import mongoose from 'mongoose';
import { Alert, DailyLog, MenuItem, Outlet } from '../models/index.js';
import { isDateOnly } from '../models/validators.js';
import { requireAuth, requireRole } from '../security/middleware.js';

const router = Router();
const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];
const dateValid = value => typeof value === 'string' && isDateOnly(value);

router.use(requireAuth);
router.get('/', async (req, res, next) => {
  try {
    const { outletId } = req.query;
    const meal = req.query.meal;
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const unit = typeof req.query.unit === 'string' ? req.query.unit.trim() : '';
    if (meal && !meals.includes(meal)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid meal.' } });
    if (!mongoose.isValidObjectId(outletId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid outlet.' } });
    const outlet = await Outlet.findOne({ _id: outletId, organisation: req.auth.organisationId, isActive: true }).lean();
    if (!outlet) return res.status(404).json({ error: { code: 'OUTLET_NOT_FOUND', message: 'Outlet not found.' } });
    const now = new Date();
    const toDefault = new Intl.DateTimeFormat('en-CA', { timeZone: outlet.timezone }).format(now);
    const endDate = req.query.to || toDefault;
    const startDate = req.query.from || new Date(`${endDate}T00:00:00Z`).toISOString().slice(0, 10);
    if (!dateValid(startDate) || !dateValid(endDate) || startDate > endDate) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid date range in YYYY-MM-DD format.' } });
    const [logs, menu] = await Promise.all([
      DailyLog.find({ organisation: req.auth.organisationId, outlet: outlet._id, date: { $gte: startDate, $lte: endDate } }).populate('item', 'name category unit costPerUnit').sort({ date: 1 }).lean(),
      MenuItem.find({ organisation: req.auth.organisationId, outlet: outlet._id, isActive: true }).select('_id name unit costPerUnit').lean()
    ]);
    const filteredLogs = logs.filter(log => (!meal || log.meal === meal) && (!category || log.item?.category === category) && (!unit || log.item?.unit === unit));
    const metrics = summarize(filteredLogs);
    const days = Math.max(1, Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1);
    const priorEnd = new Date(Date.parse(`${startDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const priorStart = new Date(Date.parse(`${priorEnd}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
    const priorLogs = await DailyLog.find({ organisation: req.auth.organisationId, outlet: outlet._id, date: { $gte: priorStart, $lte: priorEnd } }).populate('item', 'costPerUnit').lean();
    const prior = summarize(priorLogs.filter(log => (!meal || log.meal === meal) && (!category || log.item?.category === category) && (!unit || log.item?.unit === unit)));
    const wasteCostRate = metrics.prepared ? metrics.wasteCost / metrics.prepared : null;
    const priorWasteCostRate = prior.prepared ? prior.wasteCost / prior.prepared : null;
    const wasteRate = metrics.prepared ? metrics.waste / metrics.prepared : null;
    const priorWasteRate = prior.prepared ? prior.waste / prior.prepared : null;
    const estimatedSavings = wasteCostRate !== null && priorWasteCostRate !== null ? Math.max(0, (priorWasteCostRate - wasteCostRate) * metrics.prepared) : null;
    const estimatedFoodSaved = priorWasteRate !== null && wasteRate !== null ? Math.max(0, (priorWasteRate - wasteRate) * metrics.prepared) : null;
    const priorByUnit = new Map(prior.unitBreakdown.map(row => [row.unit, row]));
    const estimatedFoodSavedByUnit = Object.fromEntries(metrics.unitBreakdown.map(row => {
      const old = priorByUnit.get(row.unit);
      const amount = old?.prepared && row.prepared ? Math.max(0, (old.waste / old.prepared - row.waste / row.prepared) * row.prepared) : null;
      return [row.unit, amount];
    }));
    const insights = createInsights(filteredLogs, metrics);
    const alerts = await refreshAlerts(req.auth.organisationId, outlet._id, filteredLogs, menu, endDate, outlet.timezone);
    res.json({ data: { outlet: { id: outlet._id, name: outlet.name, timezone: outlet.timezone }, range: { from: startDate, to: endDate }, filters: { meal: meal || null, category: category || null, unit: unit || null }, metrics: { ...metrics, wasteRate, priorWasteRate, estimatedSavings, estimatedFoodSaved, estimatedFoodSavedByUnit, priorRange: { from: priorStart, to: priorEnd } }, trend: metrics.trend, wasteByCategory: metrics.wasteByCategory, topItems: metrics.topItems, itemBreakdown: metrics.itemBreakdown, weekdayPatterns: metrics.weekdayPatterns, mealPatterns: metrics.mealPatterns, insights, alerts } });
  } catch (error) { next(error); }
});

router.get('/alerts', async (req, res, next) => {
  try {
    const outletId = req.query.outletId;
    if (!mongoose.isValidObjectId(outletId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid outlet.' } });
    const outlet = await Outlet.findOne({ _id: outletId, organisation: req.auth.organisationId, isActive: true }).lean();
    if (!outlet) return res.status(404).json({ error: { code: 'OUTLET_NOT_FOUND', message: 'Outlet not found.' } });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: outlet.timezone }).format(new Date());
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - 13 * 86400000).toISOString().slice(0, 10);
    const [logs, menu] = await Promise.all([
      DailyLog.find({ organisation: req.auth.organisationId, outlet: outlet._id, date: { $gte: from, $lte: today } }).populate('item', 'name unit costPerUnit').lean(),
      MenuItem.find({ organisation: req.auth.organisationId, outlet: outlet._id, isActive: true }).select('_id name unit costPerUnit').lean()
    ]);
    const alerts = await refreshAlerts(req.auth.organisationId, outlet._id, logs, menu, today, outlet.timezone);
    const data = await Alert.find({ organisation: req.auth.organisationId, outlet: outlet._id, resolvedAt: null }).sort({ severity: -1, updatedAt: -1 }).lean();
    res.json({ data: data.length ? data : alerts });
  } catch (error) { next(error); }
});

router.patch('/alerts/:alertId/resolve', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.alertId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid alert.' } });
    const alert = await Alert.findOneAndUpdate({ _id: req.params.alertId, organisation: req.auth.organisationId, resolvedAt: null }, { resolvedAt: new Date(), resolvedBy: req.auth.userId }, { returnDocument: 'after' });
    if (!alert) return res.status(404).json({ error: { code: 'ALERT_NOT_FOUND', message: 'Active alert not found.' } });
    res.json({ data: alert });
  } catch (error) { next(error); }
});

function summarize(logs) {
  let prepared = 0; let consumed = 0; let waste = 0; let wasteCost = 0; let soldOutCount = 0;
  const days = new Map(); const items = new Map(); const categories = new Map(); const weekdays = new Map(); const mealMap = new Map(); const units = new Map();
  for (const log of logs) {
    const item = log.item;
    const amount = log.unservedLeftover + log.plateWaste;
    const demand = Math.max(0, log.prepared - log.unservedLeftover);
    prepared += log.prepared; consumed += demand; waste += amount;
    wasteCost += amount * (item?.costPerUnit || 0);
    soldOutCount += Number(log.soldOut);
    const weekday = new Date(`${log.date}T00:00:00Z`).getUTCDay();
    addGroup(days, log.date, log.prepared, amount, 1, demand);
    addGroup(weekdays, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday], log.prepared, amount, 1, demand);
    addGroup(mealMap, log.meal, log.prepared, amount, 1, demand);
    if (item) {
      const unit = units.get(item.unit) || { unit: item.unit, prepared: 0, consumed: 0, waste: 0, count: 0 };
      unit.prepared += log.prepared; unit.consumed += demand; unit.waste += amount; unit.count += 1; units.set(item.unit, unit);
      const entry = items.get(String(item._id)) || { itemId: item._id, name: item.name, category: item.category || 'Uncategorized', unit: item.unit, prepared: 0, consumed: 0, waste: 0, wasteCost: 0, count: 0, sellOuts: 0, byMeal: {} };
      entry.prepared += log.prepared; entry.consumed += demand; entry.waste += amount; entry.wasteCost += amount * (item.costPerUnit || 0); entry.count += 1; entry.sellOuts += Number(log.soldOut);
      const meal = entry.byMeal[log.meal] || { prepared: 0, consumed: 0, waste: 0, wasteCost: 0, count: 0 };
      meal.prepared += log.prepared; meal.consumed += demand; meal.waste += amount; meal.wasteCost += amount * (item.costPerUnit || 0); meal.count += 1; entry.byMeal[log.meal] = meal;
      items.set(String(item._id), entry);
      const category = item.category || 'Uncategorized';
      const categoryRow = categories.get(category) || { name: category, waste: 0, prepared: 0 };
      categoryRow.waste += amount; categoryRow.prepared += log.prepared; categories.set(category, categoryRow);
    }
  }
  const pattern = map => [...map.entries()].map(([label, value]) => ({ label, ...value, wasteRate: value.prepared ? value.waste / value.prepared : 0 })).sort((a, b) => a.label.localeCompare(b.label));
  const itemBreakdown = [...items.values()].sort((a, b) => b.waste - a.waste);
  return { prepared, consumed, waste, wasteCost, soldOutCount, recordCount: logs.length, trend: pattern(days), wasteByCategory: [...categories.values()].sort((a, b) => b.waste - a.waste), unitBreakdown: [...units.values()], weekdayPatterns: pattern(weekdays), mealPatterns: pattern(mealMap), itemBreakdown, topItems: [...items.values()].sort((a, b) => b.wasteCost - a.wasteCost).slice(0, 8) };
}
function addGroup(map, key, prepared, waste, count, consumed = 0) { const value = map.get(key) || { prepared: 0, consumed: 0, waste: 0, count: 0 }; value.prepared += prepared; value.consumed += consumed; value.waste += waste; value.count += count; map.set(key, value); }
function createInsights(logs, metrics) {
  if (logs.length < 5 || !metrics.prepared) return [];
  const baseline = metrics.waste / metrics.prepared;
  const findings = [];
  for (const group of [metrics.weekdayPatterns, metrics.mealPatterns]) {
    for (const value of group) if (value.count >= 5 && value.wasteRate >= baseline + 0.1 && value.wasteRate > baseline * 1.5) findings.push({ type: 'high_waste_pattern', title: `Higher waste on ${value.label}`, message: `${value.label} has ${(value.wasteRate * 100).toFixed(0)}% logged waste across ${value.count} records, compared with ${(baseline * 100).toFixed(0)}% overall.` });
  }
  return findings.slice(0, 5);
}
async function refreshAlerts(organisation, outlet, logs, menu, today, timezone) {
  const result = [];
  const grouped = new Map();
  for (const log of logs) { const key = String(log.item?._id || log.item); const value = grouped.get(key) || { item: log.item, logs: [] }; value.logs.push(log); grouped.set(key, value); }
  for (const [key, group] of grouped) {
    const totalPrepared = group.logs.reduce((sum, log) => sum + log.prepared, 0);
    const totalWaste = group.logs.reduce((sum, log) => sum + log.unservedLeftover + log.plateWaste, 0);
    if (totalPrepared && totalWaste / totalPrepared >= 0.3) result.push({ type: 'high_waste', severity: totalWaste / totalPrepared >= 0.5 ? 'critical' : 'warning', title: `High waste: ${group.logs[0].item.name}`, message: `${(totalWaste / totalPrepared * 100).toFixed(0)}% of recorded prepared quantity was logged as waste across ${group.logs.length} service records.`, item: key });
    const soldOuts = group.logs.filter(log => log.soldOut);
    if (soldOuts.length >= 3) result.push({ type: 'repeated_sell_out', severity: 'warning', title: `Repeated sell-outs: ${group.logs[0].item.name}`, message: `Sold out on ${soldOuts.length} of ${group.logs.length} recorded services in the last 14 days.`, item: key });
  }
  const past = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(Date.parse(`${today}T00:00:00Z`) - 86400000));
  const entriesByDayMeal = new Set(logs.filter(log => log.date < today).map(log => `${log.date}|${log.meal}`));
  const last = new Date(`${past}T00:00:00Z`);
  for (let day = 0; day < 7; day += 1) {
    const date = new Date(last.getTime() - day * 86400000).toISOString().slice(0, 10);
    const hasAnyEntry = [...entriesByDayMeal].some(entry => entry.startsWith(`${date}|`));
    for (const meal of meals) if (hasAnyEntry && !entriesByDayMeal.has(`${date}|${meal}`) && menu.length) result.push({ type: 'missing_entry', severity: 'info', title: `Missing ${meal} entry`, message: `No daily log is recorded for ${meal} on ${date}, although other meal entries exist.`, relatedDate: new Date(`${date}T00:00:00Z`) });
  }
  const active = [];
  for (const draft of result) {
    const identity = { organisation, outlet, type: draft.type, item: draft.item || null, title: draft.title, resolvedAt: null };
    const alert = await Alert.findOneAndUpdate(identity, { $set: { severity: draft.severity, message: draft.message, relatedDate: draft.relatedDate || null } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    active.push(alert.toObject());
  }
  return active;
}

export default router;
