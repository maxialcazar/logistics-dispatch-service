import "dotenv/config";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import { redis } from "../src/redis";

describe("GET /api/public/track/:trackingCode", () => {
  let testPackage: any;
  let createdZoneId: string | null = null;

  beforeAll(async () => {
    // Ensure we have a zone to link to
    let zone = await prisma.zone.findFirst();
    if (!zone) {
      zone = await prisma.zone.create({
        data: {
          name: "Test Zone",
        }
      });
      createdZoneId = zone.id;
    }

    // Create a temporary package for testing
    testPackage = await prisma.package.create({
      data: {
        trackingCode: `TEST-${Date.now()}`,
        address: "Av. Corrientes 1234, CABA",
        status: "pending",
        zoneId: zone.id,
      },
    });
  });

  afterAll(async () => {
    // Clean up test package
    if (testPackage) {
      await prisma.package.delete({ where: { id: testPackage.id } });
    }
    // Clean up zone if we created it
    if (createdZoneId) {
      // Ensure no other packages are linked before deleting (cascading deletes might be safer in valid schema but manual here)
      // For now, if we created it, we assume we can delete it or leave it, but let's try to verify cleanup isn't the blocker.
      // Actually, deleting the zone might fail if other tests ran and attached stuff. 
      // Safest is to leave the zone or use a strictly isolated test DB. 
      // For this "Add Feature" flow, let's just clean the package.
      await prisma.zone.delete({ where: { id: createdZoneId } }).catch(() => {});
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
    expect(res.body.address).toContain("***");
    expect(res.body.address).not.toBe(testPackage.address);
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
