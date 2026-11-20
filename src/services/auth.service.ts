import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";

export class AuthService {
  private static getJwtSecret(): string {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("jwt_config_error");
    }
    return jwtSecret;
  }

  private static signToken(user: {
    id: string;
    username: string;
    role: string;
    driverId?: string | null;
    companyId: string;
  }): string {
    const jwtSecret = this.getJwtSecret();
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      driverId: user.driverId ?? null,
      companyId: user.companyId,
    };

    return jwt.sign(payload, jwtSecret, {
      expiresIn: (process.env.JWT_EXPIRES_IN || "24h") as any,
    });
  }

  private static isCompanySlugUniqueViolation(error: any): boolean {
    if (error?.meta?.modelName === "Company") {
      return true;
    }

    const targetFields = Array.isArray(error?.meta?.target)
      ? error.meta.target
      : typeof error?.meta?.target === "string"
        ? [error.meta.target]
        : [];
    const adapterFields = Array.isArray(error?.meta?.driverAdapterError?.cause?.constraint?.fields)
      ? error.meta.driverAdapterError.cause.constraint.fields
      : [];
    const originalMessage = String(
      error?.meta?.driverAdapterError?.cause?.originalMessage ?? error?.message ?? ""
    );

    return (
      [...targetFields, ...adapterFields].some((field) =>
        String(field).toLowerCase().includes("slug")
      ) || /Company_slug_key|"slug"/i.test(originalMessage)
    );
  }

  static async registerCompany(data: { companyName: string; companySlug: string; username: string; password: string }) {
    const existingUser = await prisma.user.findUnique({ where: { username: data.username } });
    if (existingUser) throw new Error("username_taken");

    const existingSlug = await prisma.company.findUnique({ where: { slug: data.companySlug } });
    if (existingSlug) throw new Error("company_slug_taken");

    // Validate JWT config before creating DB records
    this.getJwtSecret();

    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Transaction to ensure atomic creation and rollback if token signing fails
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
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
            driverId: true,
            companyId: true,
          },
        });

        const token = this.signToken(user);
        return { company, user, token };
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        if (this.isCompanySlugUniqueViolation(error)) {
          throw new Error("company_slug_taken");
        }
        throw new Error("username_taken");
      }
      throw error;
    }

    return {
      token: result.token,
      company: result.company,
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        driverId: result.user.driverId ?? null,
        companyId: result.user.companyId,
        companyName: result.company.name,
      },
    };
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

    const token = this.signToken(user);

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

  static async getMe(userId: string, companyId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, companyId },
      select: {
        id: true,
        username: true,
        role: true,
        companyId: true,
        driverId: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error("user_not_found");
    }

    return user;
  }
}
