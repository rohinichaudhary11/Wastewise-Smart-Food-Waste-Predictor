import mongoose from 'mongoose';

const outletSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  slug: { type: String, required: true, lowercase: true, trim: true },
  timezone: { type: String, required: true, default: 'Asia/Kolkata' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: 'throw' });

outletSchema.index({ organisation: 1, slug: 1 }, { unique: true });
export default mongoose.model('Outlet', outletSchema);
