import mongoose from 'mongoose';
import { dateOnlyValidator } from './validators.js';

const dailyLogSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
  outlet: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', required: true },
  date: { type: String, required: true, validate: dateOnlyValidator },
  timezone: { type: String, required: true, default: 'Asia/Kolkata' },
  meal: { type: String, enum: ['breakfast', 'lunch', 'snacks', 'dinner'], required: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  unit: { type: String, enum: ['kg', 'litre', 'plate', 'piece'], required: true },
  prepared: { type: Number, min: 0, required: true },
  unservedLeftover: { type: Number, min: 0, required: true },
  plateWaste: { type: Number, min: 0, default: 0 },
  soldOut: { type: Boolean, default: false },
  soldOutAt: { type: Date, default: null },
  customerCount: { type: Number, min: 0, default: null },
  remarks: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true, strict: 'throw' });

dailyLogSchema.path('unservedLeftover').validate(function (value) { return value <= this.prepared; }, 'Unserved leftover cannot exceed quantity prepared');
dailyLogSchema.path('soldOutAt').validate(function (value) { return this.soldOut ? value instanceof Date : !value; }, 'Sold out records require a sold-out time');
dailyLogSchema.path('plateWaste').validate(function (value) { return value <= this.prepared - this.unservedLeftover; }, 'Plate waste cannot exceed the served quantity');
dailyLogSchema.index({ organisation: 1, outlet: 1, date: 1, meal: 1, item: 1 }, { unique: true });
dailyLogSchema.index({ organisation: 1, date: -1, outlet: 1, meal: 1 });
export default mongoose.model('DailyLog', dailyLogSchema);
