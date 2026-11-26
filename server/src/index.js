import { config } from './config.js';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import * as models from './models/index.js';
import { scheduleWeeklyTraining } from './analytics/training.js';

const app = createApp();

try {
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map(model => model.createIndexes()));
  app.listen(config.PORT, '0.0.0.0', () => {
    console.info(`WasteWise API listening on port ${config.PORT}`);
  });
  if (!process.env.VERCEL) {
    const week = 7 * 24 * 60 * 60 * 1000;
    const weeklyTraining = setInterval(() => scheduleWeeklyTraining().catch(error => {
      console.error(`Weekly model training run failed (${error.code || error.name || 'ERROR'}).`);
    }), week);
    weeklyTraining.unref();
  }
} catch (error) {
  console.error(`Could not connect to MongoDB (${error.name}). Check that MongoDB is running and MONGODB_URI is correct.`);
  process.exitCode = 1;
}
