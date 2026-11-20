import { Response } from "express";
import { UserService } from "../services/user.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import logger from "../utils/logger";
import { sanitizePagination } from "../utils/pagination";

export async function getUsers(req: AuthRequest, res: Response) {
  try {
    const { search, role } = req.query;
    const { page, limit } = sanitizePagination(req.query);
    const result = await UserService.getUsers(req.user!.companyId, {
      search: typeof search === "string" && search.trim() ? search.trim() : undefined,
      role: typeof role === "string" && role.trim() ? role.trim() : undefined,
      page,
      limit,
    });
    return res.json(result);
  } catch (error) {
    logger.error("Error in getUsers:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
}

export async function createUser(req: AuthRequest, res: Response) {
  try {
    const user = await UserService.createUser(req.user!.companyId, req.body);
    return res.status(201).json(user);
  } catch (error: any) {
    if (error.message === "username_exists") {
      return res.status(409).json({ error: "Username already exists" });
    }
    if (error.message === "invalid_role") {
      return res.status(400).json({ error: "Cannot create driver user without Driver profile" });
    }
    return res.status(500).json({ error: "Failed to create user" });
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

export async function deleteUser(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  try {
    const result = await UserService.deleteUser(req.user!.companyId, id, req.user!.id);
    return res.json(result);
  } catch (error: any) {
    if (error?.message === "cannot_delete_self") {
      return res.status(400).json({ error: "Cannot delete your own user account" });
    }
    if (error?.message === "user_not_found") {
      return res.status(404).json({ error: "User not found" });
    }
    if (error?.message === "cannot_delete_driver_user") {
      return res.status(400).json({
        error: "Cannot delete driver user directly; use DELETE /api/drivers/:id",
      });
    }
    logger.error("Error in deleteUser:", error);
    return res.status(500).json({ error: "Failed to delete user" });
  }
}
