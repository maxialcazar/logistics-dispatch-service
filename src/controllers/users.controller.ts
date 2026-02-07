import { Response } from "express";
import { UserService } from "../services/user.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export async function createUser(req: AuthRequest, res: Response) {
  try {
    const user = await UserService.createUser(req.user!.companyId, req.body);
    res.json(user);
  } catch (error: any) {
    if (error.message === "username_exists") {
      return res.status(400).json({ error: "username already exists" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}
