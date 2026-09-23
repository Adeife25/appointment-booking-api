import { Role } from '../../generated/prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  providerProfileId?: string | null;
}
