import { Response } from "express";
import { UserService } from "../services/user.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export async function createUser(req: AuthRequest, res: Response) {
  try {
    const user = await UserService.createUser(req.user!.companyId, req.body);
    res.json(user);
  } catch (error: any) {
    if (error.message === "username_exists") {
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  const { newPassword } = req.body;
  try {
     await UserService.changePassword(req.user!.id, newPassword);
     res.json({ message: "Password updated successfully" });
  } catch (error) {
     res.status(500).json({ error: "Failed to update password" });
  }
}
