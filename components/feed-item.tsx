import { LogCard } from './log-card';
import type { LogWithUser } from '@/types';

interface FeedItemProps {
  log: LogWithUser;
  spotifyName?: string;
}

export function FeedItem({ log, spotifyName }: FeedItemProps) {
  return (
    <LogCard
      log={log}
      spotifyName={spotifyName}
      spotifyType={log.type}
      showComments={true}
    />
  );
}
