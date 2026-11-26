import { CalendarEvent, DailyLog, ModelRun, Outlet } from '../models/index.js';
import { config } from '../config.js';

export async function requestMl(path, options = {}) {
  if (!config.ML_INTERNAL_API_KEY) throw Object.assign(new Error('ML service is not configured.'), { status: 503, code: 'ML_SERVICE_UNAVAILABLE' });
  let response;
  try {
    const { timeout = 120_000, ...fetchOptions } = options;
    response = await fetch(`${config.ML_SERVICE_URL}${path}`, {
      ...fetchOptions,
      headers: { 'Content-Type': 'application/json', 'X-Internal-API-Key': config.ML_INTERNAL_API_KEY, ...fetchOptions.headers },
      signal: AbortSignal.timeout(timeout)
    });
  } catch {
    throw Object.assign(new Error('The model service is unavailable.'), { status: 503, code: 'ML_SERVICE_UNAVAILABLE' });
  }
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'The model service authentication is misconfigured.' : 'The model service rejected the request.'), { status: response.status === 401 ? 503 : 502, code: 'ML_SERVICE_ERROR' });
  return response.json();
}

export async function trainOutlet({ organisationId, outletId, createdBy = null }) {
  const outlet = await Outlet.findOne({ _id: outletId, organisation: organisationId, isActive: true }).lean();
  if (!outlet) return null;
  const logs = await DailyLog.find({ organisation: organisationId, outlet: outlet._id }).sort({ date: 1 }).lean();
  if (!logs.length) return { skipped: true, reason: 'No outlet daily records are available.' };
  const firstDate = logs[0].date;
  const lastDate = logs.at(-1).date;
  const events = await CalendarEvent.find({ organisation: organisationId, date: { $gte: firstDate, $lte: lastDate }, $or: [{ outlet: outlet._id }, { outlet: null }] }).select('date type').lean();
  const eventByDate = new Map();
  for (const event of events) {
    const flags = eventByDate.get(event.date) || { holiday: false, exam: false, event: false };
    if (event.type === 'holiday' || event.type === 'vacation') flags.holiday = true;
    if (event.type === 'exam') flags.exam = true;
    if (event.type === 'college_event' || event.type === 'special_menu') flags.event = true;
    eventByDate.set(event.date, flags);
  }
  const expectedCustomers = buildExpectedCustomers(logs);
  const records = logs.map(log => ({ date: log.date, item_id: String(log.item), meal: log.meal, prepared: log.prepared, unserved_leftover: log.unservedLeftover, sold_out: log.soldOut, ...(eventByDate.get(log.date) || {}), expected_customer_count: expectedCustomers.get(`${log.date}|${log.meal}`) ?? null }));
  const trained = (await requestMl('/train', { method: 'POST', body: JSON.stringify({ outlet_id: String(outlet._id), records }) })).data;
  const run = await ModelRun.create({
    organisation: organisationId,
    outlet: outlet._id,
    modelVersion: trained.model_version,
    modelName: trained.entries.some(entry => entry.promoted) ? 'WasteWise selected candidate' : 'WasteWise baseline registry',
    trainedAt: new Date(trained.trained_at),
    dataStart: new Date(`${trained.data_start}T00:00:00.000Z`),
    dataEnd: new Date(`${trained.data_end}T00:00:00.000Z`),
    rowCount: trained.row_count,
    metrics: { itemModels: trained.entries.map(({ item_id, meal, method, promoted, confidence, metrics, candidates }) => ({ itemId: item_id, meal, method, promoted, confidence, metrics, candidates })) },
    baselineMetrics: { itemModels: trained.entries.map(({ item_id, meal, baseline_metrics }) => ({ itemId: item_id, meal, ...baseline_metrics })) },
    promoted: trained.entries.some(entry => entry.promoted),
    createdBy
  });
  return { run, result: trained };
}

function buildExpectedCustomers(logs) {
  const services = new Map();
  for (const log of logs) {
    if (log.customerCount === null || log.customerCount === undefined) continue;
    const key = `${log.date}|${log.meal}`;
    if (!services.has(key)) services.set(key, { date: log.date, meal: log.meal, count: log.customerCount });
  }
  const ordered = [...services.values()].sort((a, b) => a.date.localeCompare(b.date));
  const estimates = new Map();
  for (const service of ordered) {
    const prior = ordered.filter(row => row.meal === service.meal && row.date < service.date);
    const weekday = new Date(`${service.date}T00:00:00.000Z`).getUTCDay();
    const sameWeekday = prior.filter(row => new Date(`${row.date}T00:00:00.000Z`).getUTCDay() === weekday).slice(-8);
    const values = (sameWeekday.length ? sameWeekday : prior.slice(-7)).map(row => row.count).sort((a, b) => a - b);
    if (!values.length) continue;
    const mid = Math.floor(values.length / 2);
    estimates.set(`${service.date}|${service.meal}`, values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2);
  }
  return estimates;
}

export async function scheduleWeeklyTraining() {
  const outlets = await Outlet.find({ isActive: true }).select('_id organisation').lean();
  for (const outlet of outlets) {
    try {
      const result = await trainOutlet({ organisationId: outlet.organisation, outletId: outlet._id });
      if (result?.skipped) continue;
    } catch (error) {
      console.error(`Scheduled model training failed for an outlet (${error.code || 'TRAINING_ERROR'}).`);
    }
  }
}
