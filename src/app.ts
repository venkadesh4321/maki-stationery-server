import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import routes from './presentation/http/routes';
import { requestLogger } from './presentation/http/middlewares/logging';
import { notFoundHandler } from './presentation/http/middlewares/notFound';
import { errorHandler } from './presentation/http/middlewares/errorHandler';
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
