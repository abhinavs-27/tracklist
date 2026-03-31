import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      username?: string;
      avatar_url?: string | null;
      bio?: string | null;
      /** Mirrors `users.onboarding_completed`; set in JWT to avoid DB in middleware. */
      onboarding_completed?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    username?: string;
    avatar_url?: string | null;
    bio?: string | null;
    onboarding_completed?: boolean;
  }
}
