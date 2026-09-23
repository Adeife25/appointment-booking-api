import { Injectable } from '@nestjs/common';
import { ProvidersService } from '../providers/providers.service';
import { ServicesService } from '../services/services.service';

@Injectable()
export class PublicService {
  constructor(
    private readonly providers: ProvidersService,
    private readonly services: ServicesService,
  ) {}

  getProviderByIdentifier(slugOrId: string) {
    return this.providers.findByIdentifier(slugOrId);
  }

  getServiceByIdentifier(slugOrId: string) {
    return this.services.findByIdentifier(slugOrId);
  }
}
