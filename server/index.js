import mongoose from 'mongoose';
import { config } from './src/config.js';
import { createApp } from './src/app.js';
import * as models from './src/models/index.js';

// Vercel's Express runtime invokes this exported app for each request and
// reuses the module (and MongoDB connection) across warm invocations.
await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
await Promise.all(Object.values(models).map(model => model.createIndexes()));

const app = createApp();

export default app;
