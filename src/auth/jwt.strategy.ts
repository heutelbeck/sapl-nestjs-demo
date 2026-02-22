import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const keycloakUrl = configService.get<string>('KEYCLOAK_URL');
    const realm = configService.get<string>('KEYCLOAK_REALM');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      secretOrKeyProvider: passportJwtSecret({
        jwksUri: `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
        cache: true,
        rateLimit: true,
      }),

      issuer: `${keycloakUrl}/realms/${realm}`,
      ignoreExpiration: false,
    });
  }

  validate(payload: any) {
    return payload;
  }
}
