'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { ToastProvider } from '@/components/toast';
import { QueryProvider } from '@/components/providers/query-provider';
import { LoggingProvider } from '@/components/logging/logging-context';
import { RecentViewsProvider } from '@/components/logging/recent-views-provider';
import { LoggingShell } from '@/components/logging/logging-shell';
import { CommunityOnboarding } from '@/components/onboarding/CommunityOnboarding';

export function Providers({
  children,
  session,
  hideQuickLogFab,
}: {
  children: React.ReactNode;
  session?: Session | null;
  /** Set when Last.fm is linked — scrobbling covers logging; hide FAB for more space. */
  hideQuickLogFab?: boolean;
}) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      <QueryProvider>
        <ToastProvider>
          <RecentViewsProvider>
            <LoggingProvider>
              {children}
              <CommunityOnboarding />
              <LoggingShell hideQuickLogFab={hideQuickLogFab} />
            </LoggingProvider>
          </RecentViewsProvider>
        </ToastProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
