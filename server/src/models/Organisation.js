import mongoose from 'mongoose';

const organisationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  slug: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  timezone: { type: String, required: true, default: 'Asia/Kolkata' },
  currency: { type: String, required: true, default: 'INR', enum: ['INR'] },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: 'throw' });

organisationSchema.index({ slug: 1 }, { unique: true });
export default mongoose.model('Organisation', organisationSchema);
