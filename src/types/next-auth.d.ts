import 'next-auth';
import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      organizationId?: string | null;
      organizationSelection?: 'personal' | 'organization';
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    id: string;
    organizationId?: string | null;
    organizationSelection?: 'personal' | 'organization';
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id?: string;
    organizationId?: string | null;
    organizationSelection?: 'personal' | 'organization';
  }
}
