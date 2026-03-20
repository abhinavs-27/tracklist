import { Router } from "express";
import { ok } from "../lib/http";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  ok(res, { ok: true, service: "tracklist-backend" });
});
