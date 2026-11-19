import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

let closePromise: Promise<void> | null = null;

/**
 * Disconnects Prisma and closes the underlying pg connection pool idempotently.
 */
export async function closeDatabase(): Promise<void> {
	if (!closePromise) {
		closePromise = (async () => {
			let prismaError: unknown;
			try {
				await prisma.$disconnect();
			} catch (err) {
				prismaError = err;
			}

			try {
				if (!pool.ended && !pool.ending) {
					await pool.end();
				}
			} catch (err) {
				if (!prismaError) {
					throw err;
				}
				console.error("Failed to close PostgreSQL pool after Prisma disconnect error:", err);
			}

			if (prismaError) {
				throw prismaError;
			}
		})();
	}

	return closePromise;
}
