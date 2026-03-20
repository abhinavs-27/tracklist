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
import { spotifyDataRouter } from "./spotify";
import { authCompatRouter } from "./authCompat";

/**
 * All HTTP handlers for `/api/*`.
 * Add new routers here (order matters: specific routes before catch-all proxy).
 */
export function createApiRouter(): Router {
  const api = Router();

  api.use(healthRouter);
  api.use("/leaderboard", leaderboardRouter);
  api.use("/discover", discoverRouter);
  api.use("/reviews", reviewsRouter);
  api.use("/comments", commentsRouter);
  api.use("/likes", likesRouter);
  api.use("/search", searchRouter);
  api.use("/albums", albumsRouter);
  api.use("/spotify", spotifyDataRouter);
  api.use("/auth", authCompatRouter);

  const fallback = process.env.NEXT_API_FALLBACK?.trim();
  if (fallback) {
    api.use(
      createProxyMiddleware({
        target: fallback,
        changeOrigin: true,
        /** Preserve full `/api/...` path on the Next.js server. */
        pathRewrite: (_path, req) => req.originalUrl,
      }),
    );
  } else {
    api.use((_req, res) => {
      res.status(404).json({
        error: "Not found",
        hint: "Set NEXT_API_FALLBACK to a Next.js origin (e.g. http://127.0.0.1:3001) to proxy unimplemented /api routes during migration.",
      });
    });
  }

  return api;
}
