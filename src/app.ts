import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import routes from './interfaces/http/routes';
import { requestLogger } from './interfaces/http/middlewares/logging';
import { notFoundHandler } from './interfaces/http/middlewares/notFound';
import { errorHandler } from './interfaces/http/middlewares/errorHandler';
import { env } from './infrastructure/config/env';

export const app = express();

app.use(helmet());
const allowedOrigins = env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(
  cors({
    origin: env.NODE_ENV === 'development' ? true : allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);
