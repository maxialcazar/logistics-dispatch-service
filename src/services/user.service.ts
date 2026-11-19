import { prisma } from "../prisma";
import bcrypt from "bcrypt";
import { Role } from "@prisma/client";

export class UserService {
  static async createUser(companyId: string, data: { username: string; password: string; role?: string }) {
    const { username, password, role = "dispatcher" } = data;

    if (role !== "dispatcher") {
      throw new Error("invalid_role");
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      throw new Error("username_exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      return await prisma.user.create({
        data: {
          username,
          password: hashedPassword,
          role: Role.dispatcher,
          companyId,
        },
        select: {
          id: true,
          username: true,
          role: true,
          companyId: true,
          createdAt: true,
        },
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new Error("username_exists");
      }
      throw error;
    }
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new Error("user_not_found");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new Error("invalid_current_password");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }
}
