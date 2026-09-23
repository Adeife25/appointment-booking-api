import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflectorMock: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    reflectorMock = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflectorMock as unknown as Reflector);
  });

  function makeContext(user?: unknown) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows when no roles are required', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('rejects a missing user', () => {
    reflectorMock.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('always allows admins', () => {
    reflectorMock.getAllAndOverride.mockReturnValue([Role.PROVIDER]);
    expect(guard.canActivate(makeContext({ role: Role.ADMIN }))).toBe(true);
  });

  it('allows a user with a matching role', () => {
    reflectorMock.getAllAndOverride.mockReturnValue([Role.PROVIDER]);
    expect(guard.canActivate(makeContext({ role: Role.PROVIDER }))).toBe(true);
  });

  it('rejects a user with a non-matching role', () => {
    reflectorMock.getAllAndOverride.mockReturnValue([Role.PROVIDER]);
    expect(() =>
      guard.canActivate(makeContext({ role: Role.CUSTOMER })),
    ).toThrow(ForbiddenException);
  });
});
