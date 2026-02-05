import { Request, Response } from "express";
import { UserService } from "../services/user.service";

export async function createUser(req: Request, res: Response) {
  try {
    const user = await UserService.createUser(req.body);
    res.json(user);
  } catch (error: any) {
    if (error.message === "username_exists") {
      return res.status(400).json({ error: "username already exists" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}
