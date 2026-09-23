import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((body: unknown) => {
        if (
          typeof body === 'object' &&
          body !== null &&
          'data' in body &&
          !Array.isArray(body)
        ) {
          return body;
        }
        return { data: body };
      }),
    );
  }
}
