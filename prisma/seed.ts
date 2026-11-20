import "dotenv/config";
import bcrypt from "bcrypt";
import { closeDatabase, prisma } from "../src/prisma";

async function main() {
  const password = await bcrypt.hash("1234", 10);

  const company = await prisma.company.upsert({
    where: { slug: "logistica-central" },
    update: {},
    create: {
      name: "Logistica Central",
      slug: "logistica-central",
    },
  });

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password,
      role: "admin",
      companyId: company.id,
    },
  });

  console.log("✅ Default company and admin user seeded");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
