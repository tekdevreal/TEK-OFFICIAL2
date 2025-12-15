import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import dashboardRouter from './routes/dashboard';
import historicalRouter from './routes/historical';
import auditRouter from './routes/audit';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

/**
 * Creates and configures the Express application
 */
export function createApp(): Express {
  const app = express();

  // CORS middleware - enable for all routes
  const allowedOrigins = [
    'http://localhost:5173', // Vite dev server
    'http://localhost:3000', // Backend (for testing)
    process.env.FRONTEND_URL,
  ].filter(Boolean); // Remove undefined values

  app.use(cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, Postman, curl)
      if (!origin) return callback(null, true);
      
      // Allow requests from allowed origins
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  }));

  // Request logging middleware (for debugging)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
        origin: req.headers.origin,
        query: req.query,
      });
    }
    next();
  });

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Root endpoint - API information
  app.get('/', (_req: Request, res: Response): void => {
    res.json({
      name: 'Reward Backend API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        dashboard: {
          holders: '/dashboard/holders',
          rewards: '/dashboard/rewards',
          payouts: '/dashboard/payouts',
          historical: {
            rewards: '/dashboard/historical/rewards',
            payouts: '/dashboard/historical/payouts',
          },
          export: {
            rewards: '/dashboard/export/rewards',
            payouts: '/dashboard/export/payouts',
          },
        },
        audit: {
          latest: '/audit/latest',
          summary: '/audit/summary',
          generate: '/audit/generate',
        },
      },
    });
  });

  // Routes
  app.use('/', healthRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/dashboard', historicalRouter);
  app.use('/audit', auditRouter);

  // 404 handler
  app.use((_req: Request, res: Response): void => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

/**
 * Starts the Express server
 */
export function startServer(app: Express): void {
  const server = app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, starting graceful shutdown...`);
    
    server.close(() => {
      console.log('Server closed successfully');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
