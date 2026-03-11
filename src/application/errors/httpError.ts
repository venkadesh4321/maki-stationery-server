import { StatusCodes } from 'http-status-codes';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }

  static unauthorized(message = 'Unauthorized'): HttpError {
    return new HttpError(StatusCodes.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden'): HttpError {
    return new HttpError(StatusCodes.FORBIDDEN, message);
  }

  static badRequest(message = 'Bad request'): HttpError {
    return new HttpError(StatusCodes.BAD_REQUEST, message);
  }

  static notFound(message = 'Not found'): HttpError {
    return new HttpError(StatusCodes.NOT_FOUND, message);
  }

  static internal(message = 'Internal server error'): HttpError {
    return new HttpError(StatusCodes.INTERNAL_SERVER_ERROR, message);
  }
}
