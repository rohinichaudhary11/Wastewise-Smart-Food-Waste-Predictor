import mongoose from 'mongoose';

const modelRunSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
  outlet: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', required: true },
  modelVersion: { type: String, required: true },
  modelName: { type: String, required: true },
  trainedAt: { type: Date, required: true },
  dataStart: { type: Date, required: true },
  dataEnd: { type: Date, required: true },
  rowCount: { type: Number, min: 0, required: true },
  metrics: { type: mongoose.Schema.Types.Mixed, required: true },
  baselineMetrics: { type: mongoose.Schema.Types.Mixed, required: true },
  promoted: { type: Boolean, required: true, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, strict: 'throw' });

modelRunSchema.index({ organisation: 1, outlet: 1, trainedAt: -1 });
modelRunSchema.index({ organisation: 1, outlet: 1, modelVersion: 1 }, { unique: true });
export default mongoose.model('ModelRun', modelRunSchema);
