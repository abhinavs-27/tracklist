import NextAuth, { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createSupabaseServerClient } from '@/lib/supabase';

type DbUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
};

function generateUsernameFromEmail(email: string): string {
  const base = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 20);
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      try {
        if (!user?.email) return false;
        const supabase = await createSupabaseServerClient();
        const { data: existing, error: existingError } = await supabase
          .from('users')
          .select('id')
          .eq('email', user.email)
          .single();
        if (existing) return true;

        if (existingError && existingError.code !== 'PGRST116') {
          console.error('[auth][signIn] User lookup failed:', existingError);
          return false;
        }
        const username = generateUsernameFromEmail(user.email);
        const { error } = await supabase.from('users').insert({
          email: user.email,
          username,
          avatar_url: user.image ?? null,
          bio: null,
        });
        if (error) {
          if (error.code === '23505') {
            return true;
          }
          console.error('[auth][signIn] Failed to create user:', error);
          return false;
        }
        return true;
      } catch (err) {
        console.error('[auth][signIn] Unhandled error:', err);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user?.email) {
        try {
          const supabase = await createSupabaseServerClient();
          const { data: dbUser, error } = await supabase
            .from('users')
            .select('id, username, avatar_url, bio')
            .eq('email', user.email)
            .single<DbUser>();

          if (error) {
            console.error('[auth][jwt] DB lookup failed:', error);
          } else if (dbUser) {
            token.id = dbUser.id;
            token.username = dbUser.username;
            token.avatar_url = dbUser.avatar_url;
            token.bio = dbUser.bio;
          }
        } catch (err) {
          console.error('[auth][jwt] Unhandled error:', err);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        if (typeof token.id === 'string') {
          session.user.id = token.id;
        }
        if (typeof token.username === 'string') {
          session.user.username = token.username;
        }
        if ('avatar_url' in token) {
          session.user.avatar_url = (token as { avatar_url?: string | null }).avatar_url ?? null;
        }
        if ('bio' in token) {
          session.user.bio = (token as { bio?: string | null }).bio ?? null;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
