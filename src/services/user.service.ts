import { prisma } from "../prisma";
import bcrypt from "bcrypt";
import { Role } from "@prisma/client";

export class UserService {
  static async createUser(companyId: string, data: any) {
    const { username, password, role } = data;

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      throw new Error("username_exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: role as Role,
        companyId,
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
