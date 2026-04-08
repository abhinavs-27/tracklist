import Bottleneck from "bottleneck";
import { getSharedRedis } from "./redis-client";

/**
 * One {@link Bottleneck.IORedisConnection} for all Spotify Redis-backed limiters.
 *
 * Without this, each `new Bottleneck({ datastore: "ioredis", clientOptions: url })` opens **two**
 * TCP connections (client + pub/sub duplicate). Three limiters ⇒ **six** connections per process —
 * enough to exhaust Redis Cloud Essentials (~30) under Vercel concurrency.
 */
let spotifyBottleneckConnection:
  | InstanceType<typeof Bottleneck.IORedisConnection>
  | null
  | undefined;

export function getSpotifyBottleneckRedisConnection(): InstanceType<
  typeof Bottleneck.IORedisConnection
> | null {
  if (spotifyBottleneckConnection !== undefined) {
    return spotifyBottleneckConnection;
  }
  const client = getSharedRedis();
  if (!client) {
    spotifyBottleneckConnection = null;
    return null;
  }
  spotifyBottleneckConnection = new Bottleneck.IORedisConnection({
    client,
  });
  return spotifyBottleneckConnection;
}
