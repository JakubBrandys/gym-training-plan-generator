import {
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from 'jose';
import type { Profile } from '../generated/prisma/client.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { SUPABASE_JWKS } from './jwks.provider.js';
import { Public } from './public.decorator.js';
import { SupabaseJwtVerifier } from './supabase-jwt.verifier.js';

const SUPABASE_URL = 'https://test-project.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER_ID = '6f1c1f0e-7a8b-4c1d-9e2f-0a1b2c3d4e5f';
const EMAIL = 'member@example.com';

@Public()
class PublicController {
  handler(): void {}
}

class GatedController {
  handler(): void {}
}

const makeProfile = (overrides: Partial<Profile> = {}): Profile => {
  return {
    id: USER_ID,
    email: EMAIL,
    role: 'MEMBER',
    blockedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
};

const makeContext = (
  request: Partial<AuthenticatedRequest>,
  controller: new () => { handler(): void } = GatedController,
): ExecutionContext => {
  return {
    getHandler: () => controller.prototype.handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

const requestWith = (authorization?: string): Partial<AuthenticatedRequest> => {
  return {
    headers: authorization === undefined ? {} : { authorization },
  } as Partial<AuthenticatedRequest>;
};

describe('AuthGuard', () => {
  let signingKey: CryptoKey;
  let localJwks: JWTVerifyGetKey;
  let otherKey: CryptoKey;
  const resolve = vi.fn();
  let previousSupabaseUrl: string | undefined;

  beforeAll(async () => {
    previousSupabaseUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = `${SUPABASE_URL}/`;

    const pair = await generateKeyPair('ES256');
    signingKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    const jwks: JSONWebKeySet = {
      keys: [{ ...jwk, kid: 'test-key', alg: 'ES256' }],
    };
    localJwks = createLocalJWKSet(jwks);

    otherKey = (await generateKeyPair('ES256')).privateKey;
  });

  afterAll(() => {
    if (previousSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = previousSupabaseUrl;
    }
  });

  let warn: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    warn.mockRestore();
  });

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    resolve.mockReset();
    resolve.mockResolvedValue(makeProfile());
  });

  const createGuard = async (
    jwks: JWTVerifyGetKey = localJwks,
  ): Promise<AuthGuard> => {
    const module = await Test.createTestingModule({
      providers: [
        AuthGuard,
        Reflector,
        SupabaseJwtVerifier,
        { provide: SUPABASE_JWKS, useValue: jwks },
        { provide: ProfilesService, useValue: { resolve } },
      ],
    }).compile();
    return module.get(AuthGuard);
  };

  interface TokenOptions {
    claims?: Record<string, unknown>;
    issuer?: string;
    audience?: string;
    expiresAt?: number | string;
    key?: CryptoKey;
  }

  const signToken = (options: TokenOptions = {}): Promise<string> => {
    return new SignJWT({
      email: EMAIL,
      role: 'authenticated',
      is_anonymous: false,
      ...options.claims,
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject(USER_ID)
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? 'authenticated')
      .setIssuedAt()
      .setExpirationTime(options.expiresAt ?? '1h')
      .sign(options.key ?? signingKey);
  };

  const bearer = async (options?: TokenOptions): Promise<string> => {
    return `Bearer ${await signToken(options)}`;
  };

  it('allows a public route without an Authorization header', async () => {
    const guard = await createGuard();

    await expect(
      guard.canActivate(makeContext(requestWith(), PublicController)),
    ).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header with 401', async () => {
    const guard = await createGuard();

    await expect(
      guard.canActivate(makeContext(requestWith())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-Bearer scheme with 401', async () => {
    const guard = await createGuard();
    const token = await signToken();

    await expect(
      guard.canActivate(makeContext(requestWith(`Basic ${token}`))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows a valid token and attaches request.user', async () => {
    const guard = await createGuard();
    const request = requestWith(await bearer());

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith({ id: USER_ID, email: EMAIL });
    expect(request.user).toEqual({ id: USER_ID, email: EMAIL, role: 'MEMBER' });
  });

  it('rejects an expired token with 401', async () => {
    const guard = await createGuard();
    const expiredAt = Math.floor(Date.now() / 1000) - 60;

    await expect(
      guard.canActivate(
        makeContext(requestWith(await bearer({ expiresAt: expiredAt }))),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token with the wrong issuer with 401', async () => {
    const guard = await createGuard();

    await expect(
      guard.canActivate(
        makeContext(
          requestWith(
            await bearer({ issuer: 'https://evil.supabase.co/auth/v1' }),
          ),
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token with the wrong audience with 401', async () => {
    const guard = await createGuard();

    await expect(
      guard.canActivate(
        makeContext(requestWith(await bearer({ audience: 'anon' }))),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed by a different key with 401', async () => {
    const guard = await createGuard();

    await expect(
      guard.canActivate(
        makeContext(requestWith(await bearer({ key: otherKey }))),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose role is not authenticated with 401', async () => {
    const guard = await createGuard();

    await expect(
      guard.canActivate(
        makeContext(requestWith(await bearer({ claims: { role: 'anon' } }))),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects an anonymous-user token with 401', async () => {
    const guard = await createGuard();

    await expect(
      guard.canActivate(
        makeContext(
          requestWith(await bearer({ claims: { is_anonymous: true } })),
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 503 when the JWKS rejects with a fetch error', async () => {
    const failingJwks: JWTVerifyGetKey = () =>
      Promise.reject(new TypeError('fetch failed'));
    const guard = await createGuard(failingJwks);

    await expect(
      guard.canActivate(makeContext(requestWith(await bearer()))),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(resolve).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('TypeError: fetch failed'),
    );
  });

  it('returns 503 when the JWKS fetch times out', async () => {
    const timingOutJwks: JWTVerifyGetKey = () =>
      Promise.reject(new errors.JWKSTimeout());
    const guard = await createGuard(timingOutJwks);

    await expect(
      guard.canActivate(makeContext(requestWith(await bearer()))),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWKSTimeout'));
  });

  it('does not log ordinary invalid tokens', async () => {
    const guard = await createGuard();

    await expect(
      guard.canActivate(makeContext(requestWith('Bearer not-a-jwt'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects a blocked profile with 403', async () => {
    resolve.mockResolvedValue(makeProfile({ blockedAt: new Date() }));
    const guard = await createGuard();
    const request = requestWith(await bearer());

    await expect(
      guard.canActivate(makeContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(request.user).toBeUndefined();
  });
});
