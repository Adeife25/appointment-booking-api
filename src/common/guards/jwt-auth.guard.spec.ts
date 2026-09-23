import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    guard = new JwtAuthGuard(reflector);
  });

  function makeContext() {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('allows public routes without authentication', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('defers to passport for protected routes', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const passportPrototype = Object.getPrototypeOf(
      Object.getPrototypeOf(guard),
    );
    const spy = jest
      .spyOn(passportPrototype, 'canActivate')
      .mockReturnValue(true);
    expect(guard.canActivate(makeContext())).toBe(true);
    spy.mockRestore();
  });

  it('rejects requests without a user', () => {
    expect(() => guard.handleRequest(null, null)).toThrow(
      new UnauthorizedException('Invalid or missing token'),
    );
  });

  it('propagates the passport error', () => {
    const err = new Error('jwt expired');
    expect(() => guard.handleRequest(err, null)).toThrow(err);
  });

  it('surfaces the reason when info is a string', () => {
    expect(() => guard.handleRequest(null, null, 'No auth token')).toThrow(
      new UnauthorizedException('No auth token'),
    );
  });

  it('surfaces the reason when info is an object with a message', () => {
    expect(() =>
      guard.handleRequest(null, null, { message: 'jwt expired' }),
    ).toThrow(new UnauthorizedException('jwt expired'));
  });

  it('falls back to the generic message when no reason is available', () => {
    expect(() => guard.handleRequest(null, null)).toThrow(
      new UnauthorizedException('Invalid or missing token'),
    );
  });

  it('returns the authenticated user', () => {
    const user = { id: 'user-1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});
