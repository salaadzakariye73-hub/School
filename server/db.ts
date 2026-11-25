import mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

let lastDbError: string | null = null;
let connectingPromise: Promise<boolean> | null = null;

export async function connectDB(): Promise<boolean> {
  if (!config.mongoUri) {
    lastDbError = 'MONGODB_URI environment variable is not set.';
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    lastDbError = null;
    return true;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = (async () => {
    try {
      await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 8000,
      });
      lastDbError = null;
      return true;
    } catch (err) {
      lastDbError = err instanceof Error ? err.message : 'Failed to connect to MongoDB Atlas.';
      return false;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

export function isDbConfigured(): boolean {
  return Boolean(config.mongoUri);
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function getLastDbError(): string | null {
  return lastDbError;
}

export async function requireDb(_req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isDbConfigured()) {
    res.status(503).json({
      code: 'DB_NOT_CONFIGURED',
      error: 'MongoDB Atlas URI (MONGODB_URI) is not configured on the server.',
    });
    return;
  }

  if (!isDbConnected()) {
    const ok = await connectDB();
    if (!ok) {
      res.status(503).json({
        code: 'DB_DISCONNECTED',
        error: lastDbError || 'Unable to connect to MongoDB Atlas.',
      });
      return;
    }
  }

  next();
}
