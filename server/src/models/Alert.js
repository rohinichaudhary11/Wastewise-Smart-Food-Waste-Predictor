import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
  outlet: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', required: true },
  type: { type: String, enum: ['high_waste', 'repeated_sell_out', 'missing_entry'], required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
  title: { type: String, required: true, maxlength: 160 },
  message: { type: String, required: true, maxlength: 500 },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', default: null },
  relatedDate: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, strict: 'throw' });

alertSchema.index({ organisation: 1, outlet: 1, resolvedAt: 1, createdAt: -1 });
export default mongoose.model('Alert', alertSchema);
