import 'next-auth';
import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      organizationId?: string;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    id: string;
    organizationId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id?: string;
    organizationId?: string;
  }
}
