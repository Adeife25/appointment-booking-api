import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleConfiguredGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const clientId = this.config.get<string>('googleClientId');
    const clientSecret = this.config.get<string>('googleClientSecret');
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Google login is not configured');
    }
    return true;
  }
}
