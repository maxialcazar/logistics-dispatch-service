import "dotenv/config";
import { randomUUID } from "crypto";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import { redis } from "../src/redis";

describe("GET /api/public/track/:trackingCode", () => {
  let testPackage: any;
  let createdZoneId: string | null = null;
  let createdCompanyId: string | null = null;

  beforeAll(async () => {
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

    // Always create an isolated company so this suite never collides with other suites
    const company = await prisma.company.create({
      data: {
        name: "Public Tracking Test Company",
        slug: `public-tracking-${suffix}`,
      },
    });
    createdCompanyId = company.id;

    // Create an isolated zone owned by the test company
    const zone = await prisma.zone.create({
      data: {
        name: "Public Tracking Test Zone",
        companyId: company.id,
      },
    });
    createdZoneId = zone.id;

    // Create a temporary package for testing
    testPackage = await prisma.package.create({
      data: {
        trackingCode: `TEST-${suffix}`,
        recipientName: "Test Recipient",
        recipientAddress: "Av. Corrientes 1234, CABA",
        recipientPhone: "123456789",
        status: "pending",
        zoneId: zone.id,
        companyId: company.id,
      },
    });
  });

  afterAll(async () => {
    // Clean up test package
    if (testPackage) {
      await prisma.package.delete({ where: { id: testPackage.id } }).catch(() => {});
    }
    // Clean up zone created for this suite
    if (createdZoneId) {
      await prisma.zone.delete({ where: { id: createdZoneId } }).catch(() => {});
    }
    // Clean up company created for this suite
    if (createdCompanyId) {
      await prisma.company.delete({ where: { id: createdCompanyId } }).catch(() => {});
    }

    await prisma.$disconnect();
    await redis.disconnect();
  });

  it("should return package info for a valid tracking code without auth", async () => {
    const res = await request(app).get(`/api/public/track/${testPackage.trackingCode}`);

    expect(res.status).toBe(200);
    expect(res.body.trackingCode).toBe(testPackage.trackingCode);
    expect(res.body.status).toBe("pending");
    // Check for address masking
    expect(res.body.recipientAddress).toContain("***");
    expect(res.body.recipientAddress).not.toBe(testPackage.recipientAddress);
    // Security check: ensure sensitive IDs are not returned
    expect(res.body.userId).toBeUndefined();
    expect(res.body.zoneId).toBeUndefined();
  });

  it("should return 404 for an invalid tracking code", async () => {
    const res = await request(app).get("/api/public/track/INVALID_CODE_123");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Package not found");
  });

  it("should enforce rate limiting after many requests", async () => {
    // Current limit is 20 per hour. We make 21 to trigger it.
    // Note: This might be slow in CI, but good for local verification.
    for (let i = 0; i < 20; i++) {
        await request(app).get(`/api/public/track/${testPackage.trackingCode}`);
    }
    const res = await request(app).get(`/api/public/track/${testPackage.trackingCode}`);
    
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("Too many tracking attempts. Please try again later.");
  });
});

