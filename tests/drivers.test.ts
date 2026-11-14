import "dotenv/config";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import { redis } from "../src/redis";
import { DriverService } from "../src/services/driver.service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const SLUG = `company-drivers-${Date.now()}`;
let token: string;
let companyId: string;
let driverId: string;
let zoneId1: string;
let zoneId2: string;

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Register company + dispatcher
  const reg = await request(app).post("/api/auth/register-company").send({
    companyName: "Driver Test Co",
    companySlug: SLUG,
    username: `dispatcher_drv_${Date.now()}`,
    password: "securepassword123",
  });
  companyId = reg.body.company.id;

  const login = await request(app).post("/api/auth/login").send({
    username: reg.body.user.username,
    password: "securepassword123",
  });
  token = login.body.token;

  // Create two zones for the company
  const [z1, z2] = await Promise.all([
    prisma.zone.create({ data: { name: "North Zone", companyId } }),
    prisma.zone.create({ data: { name: "South Zone", companyId } }),
  ]);
  zoneId1 = z1.id;
  zoneId2 = z2.id;
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
afterAll(async () => {
  await prisma.zone.updateMany({ where: { companyId }, data: { driverId: null } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.driver.deleteMany({ where: { companyId } });
  await prisma.zone.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
  await redis.disconnect();
});

// ─── POST /api/drivers ────────────────────────────────────────────────────────
describe("POST /api/drivers — Create Driver", () => {
  it("should create a driver with an associated user account", async () => {
    const res = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Carlos Rodríguez",
        username: `driver_carlos_${Date.now()}`,
        password: "driverpass123",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Carlos Rodríguez");
    expect(res.body.companyId).toBe(companyId);
    // Password must NEVER be returned
    expect(res.body.user?.password).toBeUndefined();

    driverId = res.body.id;
  });

  it("should return 409 if username already exists", async () => {
    const existingUsername = `dup_driver_${Date.now()}`;

    // First creation
    await request(app).post("/api/drivers").set("Authorization", `Bearer ${token}`).send({
      name: "Driver Uno",
      username: existingUsername,
      password: "driverpass123",
    });

    // Second creation with same username
    const res = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Driver Dos",
        username: existingUsername,
        password: "driverpass123",
      });

    expect(res.status).toBe(409);
  });
});

// ─── PUT /api/drivers/:id/zones ───────────────────────────────────────────────
describe("PUT /api/drivers/:id/zones — Zone Assignment", () => {
  it("should assign multiple zones to a driver", async () => {
    const res = await request(app)
      .put(`/api/drivers/${driverId}/zones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ zoneIds: [zoneId1, zoneId2] });

    expect(res.status).toBe(200);

    // Verify zones are now linked to the driver in DB
    const zones = await prisma.zone.findMany({ where: { driverId } });
    expect(zones).toHaveLength(2);
    expect(zones.map((z) => z.id)).toEqual(expect.arrayContaining([zoneId1, zoneId2]));
  });

  it("should replace existing zones when reassigning", async () => {
    // Reassign: only zone 1
    await request(app)
      .put(`/api/drivers/${driverId}/zones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ zoneIds: [zoneId1] });

    const zones = await prisma.zone.findMany({ where: { driverId } });
    expect(zones).toHaveLength(1);
    expect(zones[0].id).toBe(zoneId1);
  });
});

// ─── syncLocationBuffer — Race Condition Test ─────────────────────────────────
describe("DriverService.syncLocationBuffer — GPS Buffer", () => {
  it("should flush buffered GPS coordinates to PostgreSQL without data loss", async () => {
    const testDriverId = driverId;

    // Simulate GPS updates written directly to Redis buffer
    await redis.hSet("drivers:locations:buffer", testDriverId, JSON.stringify({
      lat: -31.4167,
      lng: -64.1833,
      ts: Date.now(),
    }));

    // Run the sync worker
    await DriverService.syncLocationBuffer();

    // Verify PostgreSQL was updated
    const updated = await prisma.driver.findUnique({ where: { id: testDriverId } });
    expect(updated?.lat).toBeCloseTo(-31.4167, 3);
    expect(updated?.lng).toBeCloseTo(-64.1833, 3);

    // Verify buffer was cleaned up
    const remaining = await redis.hGet("drivers:locations:buffer", testDriverId);
    expect(remaining).toBeNull();
  });

  it("should handle concurrent writes safely (no data loss via RENAME)", async () => {
    // Write an initial location to the buffer
    await redis.hSet("drivers:locations:buffer", driverId, JSON.stringify({
      lat: -32.0, lng: -65.0, ts: Date.now() - 100,
    }));

    // Start sync (reads + renames buffer)
    const syncPromise = DriverService.syncLocationBuffer();

    // Simulate concurrent write from driver DURING sync
    await redis.hSet("drivers:locations:buffer", driverId, JSON.stringify({
      lat: -33.0, lng: -66.0, ts: Date.now(), // Newer update
    }));

    await syncPromise;

    // The newer write should still be in the buffer (not lost), ready for the next sync cycle
    const stillBuffered = await redis.hGet("drivers:locations:buffer", driverId);
    expect(stillBuffered).not.toBeNull();

    // Clean up
    await redis.hDel("drivers:locations:buffer", driverId);
  });
});
