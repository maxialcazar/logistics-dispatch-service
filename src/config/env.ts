import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("3001").transform(Number),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(10, "JWT Secret must be at least 10 chars"),
  JWT_EXPIRES_IN: z.string().default("24h"),
  REDIS_ENABLED: z.string().transform((val) => val === "true"),
  REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(_env.error.format(), null, 4));
  process.exit(1);
}

export const env = _env.data;
