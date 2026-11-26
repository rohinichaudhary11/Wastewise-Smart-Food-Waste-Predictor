import { config } from './config.js';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import * as models from './models/index.js';

const app = createApp();

try {
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(models).map(model => model.createIndexes()));
  app.listen(config.PORT, '0.0.0.0', () => {
    console.info(`WasteWise API listening on port ${config.PORT}`);
  });
} catch (error) {
  console.error(`Could not connect to MongoDB (${error.name}). Check that MongoDB is running and MONGODB_URI is correct.`);
  process.exitCode = 1;
}
