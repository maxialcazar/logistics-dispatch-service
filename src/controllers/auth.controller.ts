import { Request, Response } from "express";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { users } from "../storage/users.store";
import { User } from "../models/user.model";

const JWT_SECRET = "super-secret-key"; // luego env

export async function register(req: Request, res: Response) {
  const { username, password, role, driverId } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: "missing fields" });
  }

  if (users.some(u => u.username === username)) {
    return res.status(400).json({ error: "username already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user: User = {
    id: randomUUID(),
    username,
    passwordHash,
    role,
    driverId,
  };

  users.push(user);

  res.status(201).json({
    id: user.id,
    username: user.username,
    role: user.role,
  });
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      driverId: user.driverId,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
}
