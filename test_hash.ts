import bcrypt from "bcrypt";

const hashFromDb = "$2b$10$S30W.56S/WtUe7VOSJu4z.VRrnyoNy2/9/gGYkAmlwEawCYLoNL86";
const passwordToTest = "password123";

async function main() {
  const result = await bcrypt.compare(passwordToTest, hashFromDb);
  console.log(`Password "${passwordToTest}" matches hash: ${result}`);
}

main().catch(console.error);
