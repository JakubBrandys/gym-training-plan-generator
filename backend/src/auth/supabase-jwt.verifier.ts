import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthUser } from './auth-user.js';
import { getSupabaseUrl, SUPABASE_JWKS } from './jwks.provider.js';

const TOKEN_ERRORS = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
];

@Injectable()
export class SupabaseJwtVerifier {
  private readonly logger = new Logger(SupabaseJwtVerifier.name);
  private readonly issuer: string;

  constructor(@Inject(SUPABASE_JWKS) private readonly jwks: JWTVerifyGetKey) {
    this.issuer = `${getSupabaseUrl()}/auth/v1`;
  }

  async verify(token: string): Promise<AuthUser> {
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
      }));
    } catch (e) {
      if (TOKEN_ERRORS.some((ErrorType) => e instanceof ErrorType)) {
        throw new UnauthorizedException('Invalid token');
      }
      // Server-side only: the client gets a generic 503, operators get the cause.
      this.logger.warn(
        `Token verification unavailable: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
      );
      throw new ServiceUnavailableException(
        'Authentication provider unavailable',
      );
    }

    const { sub, email, role, is_anonymous: isAnonymous } = payload;
    if (
      role !== 'authenticated' ||
      typeof sub !== 'string' ||
      sub.length === 0 ||
      typeof email !== 'string' ||
      email.length === 0 ||
      isAnonymous === true
    ) {
      throw new UnauthorizedException('Invalid token');
    }

    return { id: sub, email };
  }
}
