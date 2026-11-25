import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const runtimeJwtFallback = crypto.randomBytes(32).toString('hex');

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: (process.env.MONGODB_URI || '').trim(),
  jwtSecret: (process.env.JWT_SECRET || '').trim() || runtimeJwtFallback,
  jwtExpiresIn: '12h' as const,
  corsOrigin: (process.env.CORS_ORIGIN || '').trim(),
  appUrl: (process.env.APP_URL || '').trim(),
  isProduction: process.env.NODE_ENV === 'production',
  serveFrontend: process.env.SERVE_FRONTEND !== 'false',
};
