import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // toma la URL de .env
    },
  },    
});

prisma.$connect().then(() => {
  console.log("✅ Connected to database");
}).catch((err) => {
  console.error("❌ Database connection error:", err);
});
