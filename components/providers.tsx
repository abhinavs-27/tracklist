'use client';

import { Suspense } from 'react';
import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { ToastProvider } from '@/components/toast';
import { QueryProvider } from '@/components/providers/query-provider';
import { CommunityOnboarding } from '@/components/onboarding/CommunityOnboarding';

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      <QueryProvider>
        <ToastProvider>
          {children}
          <Suspense fallback={null}>
            <CommunityOnboarding />
          </Suspense>
        </ToastProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
