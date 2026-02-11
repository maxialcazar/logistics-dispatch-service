import { prisma } from "../src/prisma";
import bcrypt from "bcrypt";

async function restoreAdmin() {
    try {
        console.log("Starting Restore Admin (Direct DB)...");
        
        const companyName = 'Logistica Central';
        const companySlug = 'logistica-central';
        const username = 'adminA';
        const passwordPlain = '123456';

        // 1. Create Company if not exists
        let company = await prisma.company.findUnique({ where: { slug: companySlug } });
        if (!company) {
            company = await prisma.company.create({
                data: {
                    name: companyName,
                    slug: companySlug
                }
            });
            console.log("✅ Company Created:", companyName);
        } else {
            console.log("ℹ️ Company already exists.");
        }

        // 2. Create Admin User
        const existingUser = await prisma.user.findFirst({ 
            where: { username, companyId: company.id } 
        });

        if (existingUser) {
            console.log("⚠️ Admin user already exists.");
        } else {
            const hashedPassword = await bcrypt.hash(passwordPlain, 10);
            await prisma.user.create({
                data: {
                    username,
                    password: hashedPassword,
                    role: 'admin',
                    companyId: company.id
                }
            });
            console.log("✅ Admin Created: adminA / 123456");
        }

    } catch (e) {
        console.error("Restore Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

restoreAdmin();
