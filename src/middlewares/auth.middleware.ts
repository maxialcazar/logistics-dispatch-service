import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username?: string;
    role: string;
    driverId: string | null;
    companyId: string;
    scope?: string;
  };
}

export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: "missing token" });
  }

  const [, token] = header.split(" ");
  if (!token) {
    return res.status(401).json({ error: "invalid token format" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    if (
      typeof payload.userId !== "string" ||
      !payload.userId.trim() ||
      typeof payload.companyId !== "string" ||
      !payload.companyId.trim() ||
      typeof payload.role !== "string" ||
      !payload.role.trim()
    ) {
      return res.status(401).json({ error: "invalid token" });
    }

    req.user = {
      id: payload.userId.trim(),
      username:
        typeof payload.username === "string" && payload.username.trim()
          ? payload.username.trim()
          : undefined,
      role: payload.role.trim(),
      driverId: payload.driverId ?? null,
      companyId: payload.companyId.trim(),
      scope:
        typeof payload.scope === "string" && payload.scope.trim()
          ? payload.scope.trim()
          : undefined,
    };

    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}