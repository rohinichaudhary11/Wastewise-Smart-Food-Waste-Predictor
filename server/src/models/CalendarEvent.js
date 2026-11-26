import mongoose from 'mongoose';
import { dateOnlyValidator } from './validators.js';

const calendarEventSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
  outlet: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', default: null },
  date: { type: String, required: true, validate: dateOnlyValidator },
  timezone: { type: String, required: true, default: 'Asia/Kolkata' },
  type: { type: String, enum: ['holiday', 'exam', 'college_event', 'vacation', 'special_menu'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true, strict: 'throw' });

calendarEventSchema.index({ organisation: 1, date: 1, outlet: 1 });
export default mongoose.model('CalendarEvent', calendarEventSchema);
