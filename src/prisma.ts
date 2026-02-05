import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

export const prisma = new PrismaClient();

prisma.$connect().then(() => {
  console.log("✅ Connected to database");
}).catch((err) => {
  console.error("❌ Database connection error:", err);
});
