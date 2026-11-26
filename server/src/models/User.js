import mongoose from 'mongoose';

const refreshSessionSchema = new mongoose.Schema({
  sid: { type: String, required: true },
  digest: { type: String, required: true, select: false },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
}, { _id: false, strict: 'throw' });

const userSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ['admin', 'manager', 'staff'], default: 'staff' },
  isActive: { type: Boolean, default: true },
  refreshSessions: { type: [refreshSessionSchema], default: [] }
}, { timestamps: true, strict: 'throw' });

userSchema.index({ organisation: 1, email: 1 }, { unique: true });
export default mongoose.model('User', userSchema);
