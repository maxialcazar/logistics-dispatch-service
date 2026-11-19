import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
});

export const registerCompanySchema = z.object({
  body: z.object({
    companyName: z.string().trim().min(2, "Company name must be at least 2 characters").max(100),
    companySlug: z
      .string()
      .trim()
      .min(2, "Company slug must be at least 2 characters")
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Company slug must be lowercase alphanumeric with hyphens"),
    username: z.string().trim().min(3, "Username must be at least 3 characters").max(50),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
});
