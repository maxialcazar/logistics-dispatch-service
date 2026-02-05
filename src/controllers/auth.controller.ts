import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { driver: true },
  });

  if (!user) {
    return res.status(401).json({ error: "user not found" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "incorrect password" });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ error: "JWT configuration error" });
  }

  const payload = {
    userId: user.id,
    role: user.role,
    driverId: user.driverId ?? null,
  };
  
  // console.log("Signing JWT with payload:", payload);

  const token = jwt.sign(
    payload,
    jwtSecret,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      driverId: user.driverId,
    },
  });
}