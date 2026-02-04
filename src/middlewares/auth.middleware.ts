import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = "super-secret-key";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    driverId?: string;
  };
}

export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: "missing token" });
  }

  const token = header.replace("Bearer ", "");

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: payload.sub,
      role: payload.role,
      driverId: payload.driverId,
    };
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}
