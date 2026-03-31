import type { Response } from "express";

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json(data);
}

export function apiError(res: Response, message: string, status: number): void {
  res.status(status).json({ error: message });
}

export function badRequest(res: Response, message: string): void {
  apiError(res, message, 400);
}

export function unauthorized(res: Response, message = "Unauthorized"): void {
  apiError(res, message, 401);
}

export function forbidden(res: Response, message = "Forbidden"): void {
  apiError(res, message, 403);
}

export function notFound(res: Response, message = "Resource not found"): void {
  apiError(res, message, 404);
}

export function conflict(res: Response, message: string): void {
  apiError(res, message, 409);
}

export function tooManyRequests(res: Response, message = "Too many requests"): void {
  apiError(res, message, 429);
}

export function noContent(res: Response): void {
  res.status(204).end();
}

export function internalError(res: Response, err: unknown): void {
  console.error("[api] internal error:", err);
  apiError(res, "Something went wrong. Please try again.", 500);
}
