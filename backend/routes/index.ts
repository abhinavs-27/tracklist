import { Router } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { healthRouter } from "./health";
import { leaderboardRouter } from "./leaderboard";
import { discoverRouter } from "./discover";
import { reviewsRouter } from "./reviews";
import { commentsRouter } from "./comments";
import { likesRouter } from "./likes";
import { searchRouter } from "./search";
import { albumsRouter } from "./albums";
import { artistsRouter } from "./artists";
import { spotifyDataRouter } from "./spotify";
import { authCompatRouter } from "./authCompat";
import { usersRouter } from "./users";
import { recentAlbumsRouter } from "./recentAlbums";
import { followRouter } from "./follow";
import { listsRouter } from "./lists";
import { feedRouter } from "./feed";
import { notificationsRouter } from "./notifications";

/**
 * All HTTP handlers for `/api/*`.
 * Add new routers here (order matters: specific routes before catch-all proxy).
 */
export function createApiRouter(): Router {
  const api = Router();

  api.use(healthRouter);
  /** Native handlers (no Next.js proxy) — required for mobile when only Express runs on 3001. */
  api.use(feedRouter);
  api.use(notificationsRouter);
  api.use("/lists", listsRouter);
  api.use("/users", usersRouter);
  api.use("/recent-albums", recentAlbumsRouter);
  api.use("/leaderboard", leaderboardRouter);
  api.use("/discover", discoverRouter);
  api.use("/reviews", reviewsRouter);
  api.use("/comments", commentsRouter);
  api.use("/likes", likesRouter);
  api.use("/search", searchRouter);
  api.use("/albums", albumsRouter);
  api.use("/artists", artistsRouter);
  api.use("/spotify", spotifyDataRouter);
  api.use("/auth", authCompatRouter);
  api.use("/follow", followRouter);

  /** Next.js serves some `/api/*` routes (e.g. `GET /api/feed`) that are not implemented in Express yet. */
  const fallback =
    process.env.NEXT_API_FALLBACK?.trim() ||
    (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:3000" : "");
  if (fallback) {
    if (
      !process.env.NEXT_API_FALLBACK?.trim() &&
      process.env.NODE_ENV !== "production"
    ) {
      console.info(
        `[api] NEXT_API_FALLBACK not set; proxying unhandled /api/* to Next.js at ${fallback} (set NEXT_API_FALLBACK to override)`,
      );
    }
    api.use(
      createProxyMiddleware({
        target: fallback,
        changeOrigin: true,
        /** Preserve full `/api/...` path on the Next.js server. */
        pathRewrite: (_path, req) => req.originalUrl,
        /**
         * Next routes like `GET /api/lists/:id` fetch Spotify metadata per item; the
         * default proxy socket can time out on slow or cold dev servers. `ECONNREFUSED`
         * to Next is still surfaced as 504 — ensure Next.js is running (default target port 3000).
         */
        proxyTimeout: 180_000,
        timeout: 180_000,
      }),
    );
  } else {
    api.use((_req, res) => {
      res.status(404).json({
        error: "Not found",
        hint: "Set NEXT_API_FALLBACK to your Next.js origin (e.g. http://127.0.0.1:3000) so unimplemented /api routes proxy during migration.",
      });
    });
  }

  return api;
}
