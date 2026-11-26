import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
  outlet: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', required: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  unit: { type: String, enum: ['kg', 'litre', 'plate', 'piece'], required: true },
  costPerUnit: { type: Number, min: 0, required: true },
  batchSize: { type: Number, min: 0.001, required: true },
  shelfLifeHours: { type: Number, min: 0, max: 8760, required: true },
  isSafelyReusable: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: 'throw' });

menuItemSchema.index({ organisation: 1, outlet: 1, name: 1 }, { unique: true });
export default mongoose.model('MenuItem', menuItemSchema);
