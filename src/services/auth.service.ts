import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";

export class AuthService {
  static async registerCompany(data: { companyName: string; companySlug: string; username: string; password: string }) {
    const existingUser = await prisma.user.findUnique({ where: { username: data.username } });
    if (existingUser) throw new Error("username_taken");

    const existingSlug = await prisma.company.findUnique({ where: { slug: data.companySlug } });
    if (existingSlug) throw new Error("company_slug_taken");

    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Transaction to ensure atomic creation
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: data.companyName,
          slug: data.companySlug,
        },
      });

      const user = await tx.user.create({
        data: {
          username: data.username,
          password: hashedPassword,
          role: "admin",
          companyId: company.id,
        },
        select: {
          id: true,
          username: true,
          role: true,
          companyId: true,
        },
      });

      return { company, user };
    });

    return result;
  }

  static async login(username: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { driver: true, company: true },
    });

    if (!user) {
      throw new Error("user_not_found");
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error("incorrect_password");
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("jwt_config_error");
    }

    const payload = {
      userId: user.id,
      role: user.role,
      driverId: user.driverId ?? null,
      companyId: user.companyId,
    };

    const token = jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        driverId: user.driverId,
        companyId: user.companyId,
        companyName: user.company.name,
      },
    };
  }
}
