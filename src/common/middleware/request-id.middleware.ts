import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestWithId = req as Request & { id?: unknown };
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && incoming
        ? incoming
        : typeof requestWithId.id === 'string'
          ? requestWithId.id
          : randomUUID();
    requestWithId.id = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
