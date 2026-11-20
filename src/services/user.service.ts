import { prisma } from "../prisma";
import bcrypt from "bcrypt";
import { Prisma, Role } from "@prisma/client";
import { disconnectUserSockets } from "../websocket";

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  role: true,
  companyId: true,
  driverId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class UserService {
  static async getUsers(
    companyId: string,
    filters: { search?: string; role?: Role | string; page?: number; limit?: number } = {}
  ) {
    if (!companyId) throw new Error("company_id_required");

    const { search, role, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = { companyId };
    if (search) {
      where.username = { contains: search, mode: "insensitive" };
    }
    if (role) {
      where.role = role as Role;
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

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

  static async deleteUser(companyId: string, targetUserId: string, actorUserId: string) {
    if (!companyId) throw new Error("company_id_required");
    if (targetUserId === actorUserId) {
      throw new Error("cannot_delete_self");
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const lockedUsers = await tx.$queryRaw<
        Array<{
          id: string;
          username: string;
          role: Role;
          driverId: string | null;
        }>
      >`
        SELECT "id", "username", "role", "driverId"
        FROM "User"
        WHERE "id" = ${targetUserId} AND "companyId" = ${companyId}
        FOR UPDATE
      `;

      if (lockedUsers.length === 0) {
        throw new Error("user_not_found");
      }

      const targetUser = lockedUsers[0];
      if (targetUser.role === "driver" || targetUser.driverId !== null) {
        throw new Error("cannot_delete_driver_user");
      }

      await tx.user.delete({
        where: { id: targetUserId },
      });

      return {
        id: targetUser.id,
        username: targetUser.username,
        role: targetUser.role,
      };
    });

    disconnectUserSockets(companyId, targetUserId);

    return {
      ok: true,
      deletedUserId: deleted.id,
      user: deleted,
    };
  }
}
