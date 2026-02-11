import bcrypt from "bcrypt";
import { prisma } from "../src/prisma";

async function main() {
  const password = await bcrypt.hash("1234", 10);

  await prisma.user.create({
    data: {
      username: "admin",
      password,
      role: "dispatcher",
    },
  });

  console.log("✅ Admin user created");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
