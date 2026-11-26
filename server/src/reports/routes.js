import { Router } from 'express';
import mongoose from 'mongoose';
import { PDFDocument } from 'pdfkit';
import { PassThrough } from 'node:stream';
import { DailyLog, Outlet } from '../models/index.js';
import { isDateOnly } from '../models/validators.js';
import { requireAuth } from '../security/middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/weekly', async (req, res, next) => {
  try {
    const { outletId } = req.query;
    if (!mongoose.isValidObjectId(outletId)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid outlet.' } });
    const outlet = await Outlet.findOne({ _id: outletId, organisation: req.auth.organisationId, isActive: true }).lean();
    if (!outlet) return res.status(404).json({ error: { code: 'OUTLET_NOT_FOUND', message: 'Outlet not found.' } });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: outlet.timezone }).format(new Date());
    const weekOf = req.query.weekOf || today;
    if (!isDateOnly(weekOf)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use a real week date in YYYY-MM-DD format.' } });
    const weekday = new Date(`${weekOf}T00:00:00.000Z`).getUTCDay();
    const from = shiftDate(weekOf, -((weekday + 6) % 7));
    const to = shiftDate(from, 6);
    const logs = await DailyLog.find({ organisation: req.auth.organisationId, outlet: outlet._id, date: { $gte: from, $lte: to } })
      .populate('item', 'name unit costPerUnit').sort({ date: 1, meal: 1 }).lean();
    const report = summarize(logs);
    const pdf = await createWeeklyPdf({ outlet, from, to, report });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="wastewise-weekly-${from}-to-${to}.pdf"`, 'Content-Length': pdf.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(pdf);
  } catch (error) { next(error); }
});

function summarize(logs) {
  const result = { prepared: 0, unserved: 0, plateWaste: 0, wasteCost: 0, soldOutCount: 0, rows: logs.length, items: new Map() };
  for (const log of logs) {
    const item = log.item;
    const cost = item?.costPerUnit || 0;
    result.prepared += log.prepared;
    result.unserved += log.unservedLeftover;
    result.plateWaste += log.plateWaste;
    result.wasteCost += (log.unservedLeftover + log.plateWaste) * cost;
    result.soldOutCount += Number(log.soldOut);
    if (item) {
      const key = String(item._id);
      const entry = result.items.get(key) || { name: item.name, unit: item.unit, prepared: 0, waste: 0, cost: 0, records: 0 };
      entry.prepared += log.prepared;
      entry.waste += log.unservedLeftover + log.plateWaste;
      entry.cost += (log.unservedLeftover + log.plateWaste) * cost;
      entry.records += 1;
      result.items.set(key, entry);
    }
  }
  result.items = [...result.items.values()].sort((a, b) => b.cost - a.cost).slice(0, 12);
  return result;
}

function createWeeklyPdf({ outlet, from, to, report }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `WasteWise weekly report: ${outlet.name}`, Author: 'WasteWise' } });
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    doc.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    doc.pipe(stream);
    doc.fillColor('#166534').fontSize(22).text('WasteWise', { continued: true });
    doc.fillColor('#17211c').fontSize(12).text('  |  Weekly kitchen report');
    doc.moveDown(0.4).fontSize(10).fillColor('#526158').text(`${outlet.name}  •  ${from} to ${to}  •  ${outlet.timezone}`);
    doc.moveDown(1).fillColor('#17211c').fontSize(15).text('Service summary');
    doc.moveDown(0.4).fontSize(10);
    const metrics = [
      ['Records logged', String(report.rows)], ['Quantity prepared', formatQuantity(report.prepared)],
      ['Unserved leftover', formatQuantity(report.unserved)], ['Plate waste', formatQuantity(report.plateWaste)],
      ['Total recorded waste', formatQuantity(report.unserved + report.plateWaste)],
      ['Waste rate', report.prepared ? `${((report.unserved + report.plateWaste) / report.prepared * 100).toFixed(1)}%` : 'No prepared quantity logged'],
      ['Estimated waste cost', `INR ${report.wasteCost.toFixed(2)}`], ['Sold-out records', String(report.soldOutCount)]
    ];
    for (const [label, value] of metrics) doc.fillColor('#526158').text(label, { continued: true }).fillColor('#17211c').text(`   ${value}`);
    doc.moveDown(1).fontSize(15).fillColor('#17211c').text('Items with highest recorded waste cost');
    doc.moveDown(0.4).fontSize(9).fillColor('#526158');
    const tableHeaderY = doc.y;
    doc.text('Item', 48, tableHeaderY, { width: 170 }).text('Prepared', 230, tableHeaderY, { width: 78, align: 'right' }).text('Waste', 315, tableHeaderY, { width: 70, align: 'right' }).text('Waste cost (INR)', 390, tableHeaderY, { width: 157, align: 'right' });
    doc.moveTo(48, doc.y + 3).lineTo(547, doc.y + 3).strokeColor('#dce5de').stroke();
    doc.moveDown(0.55).fillColor('#17211c').fontSize(9);
    if (!report.items.length) doc.text('No daily records were found for this week.');
    for (const item of report.items) {
      if (doc.y > 735) doc.addPage();
      const rowY = doc.y;
      doc.text(item.name.slice(0, 38), 48, rowY, { width: 170 }).text(formatQuantity(item.prepared), 230, rowY, { width: 78, align: 'right' }).text(formatQuantity(item.waste), 315, rowY, { width: 70, align: 'right' }).text(item.cost.toFixed(2), 390, rowY, { width: 157, align: 'right' });
      doc.y = rowY + 16;
    }
    doc.moveDown(1).fontSize(8).fillColor('#68766d').text('Waste = unserved leftovers + separately recorded plate waste. Sold-out records indicate demand may have exceeded served quantity. Cost is estimated from current menu item unit costs.');
    doc.end();
  });
}

function formatQuantity(value) { return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function shiftDate(date, amount) { return new Date(Date.parse(`${date}T00:00:00.000Z`) + amount * 86400000).toISOString().slice(0, 10); }

export default router;
