const axios = require('axios');

// Updated to port 3010 based on server logs
const API_URL = "http://127.0.0.1:3010/api";

const company = { name: "Empresa A", slug: "empresa-a", user: "adminA", pass: "123456" };

async function main() {
  console.log("🚀 Seeding Admin User...");

  try {
      console.log(`Creating company: ${company.name}...`);
      await axios.post(`${API_URL}/auth/register-company`, {
        companyName: company.name,
        companySlug: company.slug,
        username: company.user,
        password: company.pass
      });
      console.log(`✅ SUCCESS: User '${company.user}' created. Password: '${company.pass}'`);
  } catch (e) {
      if (e.response && e.response.status === 400 && JSON.stringify(e.response.data).includes("already exists")) {
          console.log(`⚠️ User '${company.user}' already exists. You can login.`);
      } else {
          console.error(`❌ Failed to register:`, e.response ? e.response.data : e.message);
      }
  }
}

main();
