import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getCommunityConsensusRankings,
  type ConsensusEntityType,
  type ConsensusRange,
} from "@/lib/community/getCommunityConsensus";
import { getTrendingEntitiesForPrecompute } from "@/lib/discover-cache";
import { getLeaderboardWithTotal } from "@/lib/queries";

const LOG = "[cron][precomputed-caches]";

const LB_KEYS: Array<{
  type: "popular" | "topRated" | "mostFavorited";
  entity: "song" | "album";
}> = [
  { type: "popular", entity: "song" },
  { type: "popular", entity: "album" },
  { type: "topRated", entity: "song" },
  { type: "topRated", entity: "album" },
  { type: "mostFavorited", entity: "song" },
  { type: "mostFavorited", entity: "album" },
];

const CONSENSUS_TYPES: ConsensusEntityType[] = ["track", "album", "artist"];
const CONSENSUS_RANGES: ConsensusRange[] = ["month", "year"];

/** Cap how many communities get consensus snapshots per daily run. */
const MAX_COMMUNITIES = 150;

const LB_SNAPSHOT_LIMIT = 500;

/**
 * Fills `leaderboard_cache`, `trending_cache`, and `community_rankings_cache`.
 * Run after `refresh_entity_stats` + `refresh_discover_mvs` so MVs and stats match the snapshot.
 */
export async function populatePrecomputedCaches(): Promise<{
  leaderboardRows: number;
  trending: boolean;
  communityRows: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let leaderboardRows = 0;
  let trending = false;
  let communityRows = 0;

  const admin = createSupabaseAdminClient();

  for (const { type, entity } of LB_KEYS) {
    try {
      const { entries, totalCount } = await getLeaderboardWithTotal(
        type,
        {},
        entity,
        LB_SNAPSHOT_LIMIT,
        0,
      );
      const id = `${type}:${entity}`;
      const { error } = await admin.from("leaderboard_cache").upsert(
        {
          id,
          entries,
          total_count: totalCount ?? entries.length,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) {
        errors.push(`${id}: ${error.message}`);
      } else {
        leaderboardRows += 1;
      }
    } catch (e) {
      errors.push(
        `${type}:${entity}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  try {
    const entities = await getTrendingEntitiesForPrecompute(50);
    const { error } = await admin.from("trending_cache").upsert(
      {
        id: 1,
        entities,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      errors.push(`trending: ${error.message}`);
    } else {
      trending = true;
    }
  } catch (e) {
    errors.push(`trending: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { data: comms, error: commErr } = await admin
      .from("communities")
      .select("id")
      .limit(MAX_COMMUNITIES);

    if (commErr) {
      errors.push(`communities list: ${commErr.message}`);
    } else {
      for (const row of comms ?? []) {
        const communityId = row.id as string;
        for (const entityType of CONSENSUS_TYPES) {
          for (const range of CONSENSUS_RANGES) {
            try {
              const page = await getCommunityConsensusRankings(
                communityId,
                entityType,
                range,
                100,
                0,
                { skipCache: true },
              );
              const { error: upErr } = await admin
                .from("community_rankings_cache")
                .upsert(
                  {
                    community_id: communityId,
                    entity_type: entityType,
                    range,
                    payload: {
                      items: page.items,
                      has_more: page.hasMore,
                    },
                    computed_at: new Date().toISOString(),
                  },
                  {
                    onConflict: "community_id,entity_type,range",
                  },
                );
              if (!upErr) {
                communityRows += 1;
              } else {
                errors.push(
                  `${communityId}/${entityType}/${range}: ${upErr.message}`,
                );
              }
            } catch (e) {
              errors.push(
                `${communityId}/${entityType}/${range}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }
        }
      }
    }
  } catch (e) {
    errors.push(`community: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(LOG, "done", {
    leaderboardRows,
    trending,
    communityRows,
    errorCount: errors.length,
  });
  return { leaderboardRows, trending, communityRows, errors };
}
