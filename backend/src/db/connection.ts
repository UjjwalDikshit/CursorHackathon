import mongoose from 'mongoose';
import type pino from 'pino';
import '../models/index.js';

export async function connectDatabase(
  uri: string,
  log: pino.Logger,
): Promise<void> {
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });

  mongoose.connection.on('disconnected', () => {
    log.warn('MongoDB disconnected');
  });
  mongoose.connection.on('error', (err) => {
    log.error({ err }, 'MongoDB connection error');
  });

  log.info('MongoDB connected');
}

export async function disconnectDatabase(log: pino.Logger): Promise<void> {
  await mongoose.disconnect();
  log.info('MongoDB connection closed');
}
