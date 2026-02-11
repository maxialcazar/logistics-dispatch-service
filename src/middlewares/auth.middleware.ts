import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    driverId: string | null;
    companyId: string;
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
    
    req.user = {
      id: payload.userId,
      role: payload.role,
      driverId: payload.driverId,
      companyId: payload.companyId,
    };

    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}