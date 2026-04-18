import mongoose from 'mongoose';
import { config } from '../config/index.js';

export async function connectMongoDB(): Promise<void> {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('[db] MongoDB connected');
}

export async function disconnectMongoDB(): Promise<void> {
  await mongoose.disconnect();
}
