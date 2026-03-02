import morgan from 'morgan';
import { logger } from '../../../infrastructure/logger/logger';

morgan.token('request-id', (req) => (req.headers['x-request-id'] as string) || 'n/a');

export const requestLogger = morgan((tokens, req, res) => {
  const line = {
    requestId: tokens['request-id'](req, res),
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    responseTimeMs: Number(tokens['response-time'](req, res)),
  };
  logger.info('http_request', line);
  return '';
});
