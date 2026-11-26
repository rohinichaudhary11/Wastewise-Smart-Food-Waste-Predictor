import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  organisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  action: { type: String, required: true, maxlength: 100 },
  entityType: { type: String, required: true, maxlength: 80 },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, maxlength: 64, default: '' },
  userAgent: { type: String, maxlength: 300, default: '' }
}, { timestamps: true, strict: 'throw' });

auditLogSchema.index({ organisation: 1, createdAt: -1 });
export default mongoose.model('AuditLog', auditLogSchema);
