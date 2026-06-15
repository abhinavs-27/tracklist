import NextAuth, { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { generateUsernameFromEmail } from '@/lib/auth/utils';

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
        if (existing) {
          console.log("[users] user-signed-in", { userId: existing.id, isNewUser: false });
          return true;
        }

        if (existingError && existingError.code !== 'PGRST116') {
          console.error('[users] user-lookup-failed', { error: existingError });
          return false;
        }
        const username = generateUsernameFromEmail(user.email);
        const { data: newUser, error } = await supabase
          .from('users')
          .insert({
            email: user.email,
            username,
            avatar_url: user.image ?? null,
            bio: null,
          })
          .select('id')
          .single();

        if (!error) {
          console.log("[users] user-created", { email: user.email, username });
          console.log("[users] user-signed-in", { userId: newUser?.id, isNewUser: true });
        }
        if (error) {
          if (error.code === '23505') {
            return true;
          }
          console.error('[users] user-creation-failed', { error });
          return false;
        }
        return true;
      } catch (err) {
        console.error('[users] sign-in-error', { error: err });
        return false;
      }
    },
    async jwt({ token, user, trigger, session }) {
      if (trigger === 'update' && session && typeof session === 'object') {
        const s = session as {
          onboarding_completed?: boolean;
        };
        if (typeof s.onboarding_completed === 'boolean') {
          token.onboarding_completed = s.onboarding_completed;
        }
        return token;
      }

      const email = (user?.email ?? token?.email) as string | undefined;
      // Only hit the DB on initial sign-in or when our internal user ID is absent from
      // the token (legacy sessions pre-dating this field). On every other read the data
      // is already in the JWT — running a DB query here on every getServerSession() call
      // adds a round-trip to the critical rendering path and delays FCP.
      if (email && (trigger === 'signIn' || !token.id)) {
        try {
          const supabase = await createSupabaseServerClient();
          const { data: dbUser, error } = await supabase
            .from('users')
            .select('id, username, avatar_url, bio, onboarding_completed')
            .eq('email', email)
            .maybeSingle();

          if (error) {
            console.error('[users] jwt-db-lookup-failed', { error });
          } else if (dbUser) {
            token.id = dbUser.id;
            token.username = dbUser.username;
            token.avatar_url = dbUser.avatar_url;
            token.bio = dbUser.bio;
            token.onboarding_completed = dbUser.onboarding_completed === true;
          }
        } catch (err) {
          console.error('[users] jwt-error', { error: err });
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
        if (typeof (token as { onboarding_completed?: boolean }).onboarding_completed === 'boolean') {
          session.user.onboarding_completed = (token as { onboarding_completed: boolean }).onboarding_completed;
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
