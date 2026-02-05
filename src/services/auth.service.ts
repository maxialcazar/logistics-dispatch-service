import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";

export class AuthService {
  static async login(username: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { driver: true },
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
      },
    };
  }
}
