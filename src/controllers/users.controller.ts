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
    res.status(400).json({ error: "username already exists" });
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  const { currentPassword, newPassword } = req.body;
  try {
     await UserService.changePassword(req.user!.id, currentPassword, newPassword);
     res.json({ message: "Password updated successfully" });
  } catch (error: any) {
     if (error.message === "user_not_found") {
       return res.status(404).json({ error: "User not found" });
     }
     if (error.message === "invalid_current_password") {
       return res.status(401).json({ error: "Current password is incorrect" });
     }
     res.status(500).json({ error: "Failed to update password" });
  }
}
