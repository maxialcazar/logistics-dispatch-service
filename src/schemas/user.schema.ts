import { z } from "zod";
import { Role } from "@prisma/client";

const validUserRoles = new Set<string>(Object.values(Role));

export const getUsersSchema = z.object({
  query: z.object({
    search: z.string().trim().max(100).optional(),
    role: z
      .string()
      .trim()
      .refine((val) => val === "" || validUserRoles.has(val), {
        message: "Invalid role value. Allowed: dispatcher, driver, admin",
      })
      .optional(),
    page: z.unknown().optional(),
    limit: z.unknown().optional(),
  }),
});

export const deleteUserSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid user ID format"),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3),
    password: z.string().min(6),
    role: z.enum(["dispatcher", "driver"]).optional().default("dispatcher"),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
        "New password must contain at least one uppercase letter, one lowercase letter, and one number"
      ),
  }),
});
