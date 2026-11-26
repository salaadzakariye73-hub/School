import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './server/config.js';
import { connectDB, isDbConfigured, isDbConnected } from './server/db.js';
import authRoutes from './server/routes/auth.js';
import userRoutes from './server/routes/users.js';
import settingsRoutes from './server/routes/settings.js';
import classRoutes from './server/routes/classes.js';
import teacherRoutes from './server/routes/teachers.js';
import studentImportRoutes from './server/routes/studentImport.js';
import studentRoutes from './server/routes/students.js';
import attendanceRoutes from './server/routes/attendance.js';
import examinationsRoutes from './server/routes/examinations.js';
import examImportRoutes from './server/routes/examImport.js';
import examRoutes from './server/routes/exams.js';
import feeRoutes from './server/routes/fees.js';
import dashboardRoutes from './server/routes/dashboard.js';
import announcementRoutes from './server/routes/announcements.js';
import studentPortalRoutes from './server/routes/studentPortal.js';
import parentPortalRoutes from './server/routes/parentPortal.js';
import timetableRoutes from './server/routes/timetable.js';
import homeworkRoutes from './server/routes/homework.js';
import expenseRoutes from './server/routes/expenses.js';
import academicYearRoutes from './server/routes/academicYears.js';
import backupRoutes from './server/routes/backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  if (config.corsOrigin) {
    const allowedOrigins = config.corsOrigin
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Origin not allowed by CORS'));
          }
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );
  }

  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      dbConfigured: isDbConfigured(),
      dbConnected: isDbConnected(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/classes', classRoutes);
  app.use('/api/teachers', teacherRoutes);
  app.use('/api/students/import', studentImportRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/examinations', examinationsRoutes);
  app.use('/api/exams/import', examImportRoutes);
  app.use('/api/exams', examRoutes);
  app.use('/api/fees', feeRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/announcements', announcementRoutes);
  app.use('/api/student-portal', studentPortalRoutes);
  app.use('/api/parent-portal', parentPortalRoutes);
  app.use('/api/timetable', timetableRoutes);
  app.use('/api/homework', homeworkRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/academic-years', academicYearRoutes);
  app.use('/api/backup', backupRoutes);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      const status =
        typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
          ? (err as { status: number }).status
          : 500;
      const message = err instanceof Error ? err.message : 'Internal server error.';
      if (req.path.startsWith('/api')) {
        res.status(status).json({ error: message });
        return;
      }
      next(err);
    }
  );

  if (!config.isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (config.serveFrontend) {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  if (isDbConfigured()) {
    await connectDB();
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${config.port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
