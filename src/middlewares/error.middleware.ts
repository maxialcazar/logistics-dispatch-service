import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import logger from "../utils/logger";

const SENSITIVE_KEYS = new Set([
  "password",
  "currentPassword",
  "newPassword",
  "signature",
  "photo",
]);

export function redactSensitiveFields(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (seen.has(value as object)) {
    return "[Circular]";
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item, seen));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactSensitiveFields(val, seen);
    }
  }
  return redacted;
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error(`${req.method} ${req.url} - Error: ${err.message}`, { 
    stack: err.stack,
    body: redactSensitiveFields(req.body),
    user: (req as any).user?.id 
  });

  // Prisma Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(400).json({
        error: "Unique constraint failed",
        field: err.meta?.target,
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Record not found",
      });
    }
  }

  // JWT Errors
  if (err.name === "UnauthorizedError" || err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token" });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired" });
  }

  // Default Error
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
