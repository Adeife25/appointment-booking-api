import { generateOpaqueToken, hashToken } from './token.util';

describe('token.util', () => {
  it('generates 64-char hex opaque tokens', () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates unique tokens', () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });

  it('hashes to a different deterministic value', () => {
    const token = generateOpaqueToken();
    const hash = hashToken(token);
    expect(hash).not.toBe(token);
    expect(hashToken(token)).toBe(hash);
  });
});
