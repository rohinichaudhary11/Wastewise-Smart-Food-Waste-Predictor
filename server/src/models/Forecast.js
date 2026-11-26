import mongoose from 'mongoose';
import { dateOnlyValidator } from './validators.js';

const forecastSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
  outlet: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', required: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  predictionDate: { type: String, required: true, validate: dateOnlyValidator },
  timezone: { type: String, required: true, default: 'Asia/Kolkata' },
  meal: { type: String, enum: ['breakfast', 'lunch', 'snacks', 'dinner'], required: true },
  serviceLevel: { type: String, enum: ['low_waste', 'balanced', 'avoid_sell_out'], default: 'balanced' },
  quantiles: {
    p50: { type: Number, min: 0, required: true },
    p80: { type: Number, min: 0, required: true },
    p90: { type: Number, min: 0, required: true }
  },
  likelyRange: { min: { type: Number, min: 0, required: true }, max: { type: Number, min: 0, required: true } },
  baselineP50: { type: Number, min: 0, default: null },
  recommendedQuantity: { type: Number, min: 0, required: true },
  inputs: { type: mongoose.Schema.Types.Mixed, required: true },
  reasons: { type: [String], default: [] },
  confidence: { type: String, enum: ['none', 'low', 'medium', 'high'], required: true },
  method: { type: String, required: true },
  modelRun: { type: mongoose.Schema.Types.ObjectId, ref: 'ModelRun', default: null },
  modelVersion: { type: String, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'overridden'], default: 'pending' },
  finalQuantity: { type: Number, min: 0, default: null },
  decisionNote: { type: String, trim: true, maxlength: 500, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null }
}, { timestamps: true, strict: 'throw' });

forecastSchema.index({ organisation: 1, outlet: 1, predictionDate: 1, meal: 1, item: 1 }, { unique: true });
forecastSchema.path('quantiles.p80').validate(function (value) { return value >= this.quantiles.p50; }, 'P80 demand cannot be lower than P50');
forecastSchema.path('quantiles.p90').validate(function (value) { return value >= this.quantiles.p80; }, 'P90 demand cannot be lower than P80');
forecastSchema.path('likelyRange.max').validate(function (value) { return value >= this.likelyRange.min; }, 'Forecast range maximum must be at least its minimum');
export default mongoose.model('Forecast', forecastSchema);
