import { Router } from 'express';
import mongoose from 'mongoose';
import { ModelRun, Outlet } from '../models/index.js';
import { requireAuth, requireRole } from '../security/middleware.js';
import { requestMl, trainOutlet } from './training.js';

const router = Router();
router.use(requireAuth);

async function outletFor(req, outletId, res) {
  if (!mongoose.isValidObjectId(outletId)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a valid outlet.' } });
    return null;
  }
  const outlet = await Outlet.findOne({ _id: outletId, organisation: req.auth.organisationId, isActive: true }).lean();
  if (!outlet) res.status(404).json({ error: { code: 'OUTLET_NOT_FOUND', message: 'Outlet not found.' } });
  return outlet;
}

router.post('/:outletId/train', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const outlet = await outletFor(req, req.params.outletId, res);
    if (!outlet) return;
    const result = await trainOutlet({ organisationId: req.auth.organisationId, outletId: outlet._id, createdBy: req.auth.userId });
    if (result?.skipped) return res.status(422).json({ error: { code: 'TRAINING_DATA_REQUIRED', message: result.reason } });
    res.status(201).json({ data: result });
  } catch (error) { next(error); }
});

router.get('/:outletId', async (req, res, next) => {
  try {
    const outlet = await outletFor(req, req.params.outletId, res);
    if (!outlet) return;
    const [runs, registry] = await Promise.all([
      ModelRun.find({ organisation: req.auth.organisationId, outlet: outlet._id }).sort({ trainedAt: -1 }).limit(20).lean(),
      requestMl(`/models/${encodeURIComponent(String(outlet._id))}`)
    ]);
    res.json({ data: { runs, registry: registry.data } });
  } catch (error) { next(error); }
});

export default router;
