import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import dashboardRouter from './routes/dashboard';
import historicalRouter from './routes/historical';
import auditRouter from './routes/audit';
import { startRewardScheduler } from './scheduler/rewardScheduler';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

/**
 * Creates and configures the Express application
 */
export function createApp(): Express {
  const app = express();

  // CORS middleware - enable for all routes
  // Normalize frontend URL (remove quotes, trailing slash, and whitespace)
  const frontendUrl = process.env.FRONTEND_URL
    ?.trim()
    .replace(/^["']|["']$/g, '') // Remove surrounding quotes
    .replace(/\/+$/, ''); // Remove trailing slashes
  
  const allowedOrigins = [
    'http://localhost:5173', // Vite dev server
    'http://localhost:3000', // Backend (for testing)
    frontendUrl,
    'https://rewards.tekportal.app', // Explicitly allow TEK portal
  ].filter(Boolean); // Remove undefined values

  // Log allowed origins on startup for debugging
  console.log('[CORS] Allowed origins:', allowedOrigins);
  console.log('[CORS] FRONTEND_URL from env:', process.env.FRONTEND_URL);
  console.log('[CORS] Normalized frontend URL:', frontendUrl);

  app.use(cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, Postman, curl)
      if (!origin) {
        console.log('[CORS] Allowing request with no origin');
        return callback(null, true);
      }
      
      // Normalize origin (remove trailing slash for comparison)
      const normalizedOrigin = origin.replace(/\/+$/, '');
      
      // Allow requests from allowed origins
      if (allowedOrigins.includes(normalizedOrigin)) {
        console.log(`[CORS] Allowing request from origin: ${origin}`);
        callback(null, true);
      } else if (process.env.NODE_ENV === 'development') {
        console.log(`[CORS] Development mode - allowing origin: ${origin}`);
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked request from origin: ${origin} (normalized: ${normalizedOrigin})`);
        console.warn(`[CORS] Allowed origins:`, allowedOrigins);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  }));

  // Request logging middleware (for debugging - always log CORS-related requests)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Always log CORS-related requests (OPTIONS preflight and requests with origin)
    if (req.method === 'OPTIONS' || req.headers.origin) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
        origin: req.headers.origin,
        query: req.query,
      });
    } else if (process.env.NODE_ENV === 'development') {
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

    // Start the reward scheduler once the HTTP server is up.
    // This runs the periodic harvesting + distribution loop used by the dashboard and Telegram bot.
    try {
      console.log('Starting reward scheduler...');
      startRewardScheduler();
      console.log('Reward scheduler started successfully');
    } catch (err) {
      console.error('Failed to start reward scheduler:', err);
      if (err instanceof Error) {
        console.error('Error details:', err.message);
        console.error('Stack:', err.stack);
      }
    }
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
