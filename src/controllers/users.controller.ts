import bcrypt from "bcrypt";
import { prisma } from "../prisma";
import { Request, Response } from "express";

export async function createUser(req: Request, res: Response) {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: "username, password and role are required" });
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return res.status(400).json({ error: "username already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      role,
    },
  });

  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
}
