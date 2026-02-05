import { prisma } from "./src/prisma";

async function main() {
  const users = await prisma.user.findMany();
  console.log("Current users in database:", JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
