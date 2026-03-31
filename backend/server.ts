/// <reference path="./types/spotify-api.d.ts" />
import path from "path";
import express, { type Request } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { createApiRouter } from "./routes";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);

const lanOriginRegex =
  /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(
  cors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin) || lanOriginRegex.test(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

/** Browsers often open the API port by mistake — explain instead of a bare 404. */
app.get("/", (_req, res) => {
  res.status(200).type("json").send({
    message:
      "Tracklist API server (Express). There is no web UI here. Open your Next.js app instead (usually http://127.0.0.1:3000 if it owns port 3000). API routes live under /api/*.",
    health: "/api/health",
  });
});

app.use("/api", createApiRouter());

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] unhandled error:", err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

/** Default 3001 so Next.js can use 3000 for the web app on the same machine. */
const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[tracklist-backend] listening on http://0.0.0.0:${PORT} (set PORT= to override; use 3001+ when Next.js uses 3000)`,
  );
});
