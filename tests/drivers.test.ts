import "dotenv/config";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import { redis } from "../src/redis";
import { DriverService } from "../src/services/driver.service";
import * as websocket from "../src/websocket";

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
  await prisma.packageHistory.deleteMany({ where: { package: { companyId } } });
  await prisma.package.deleteMany({ where: { companyId } });
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
    const firstRes = await request(app).post("/api/drivers").set("Authorization", `Bearer ${token}`).send({
      name: "Driver Uno",
      username: existingUsername,
      password: "driverpass123",
    });
    expect(firstRes.status).toBe(201);

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
    const res = await request(app)
      .put(`/api/drivers/${driverId}/zones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ zoneIds: [zoneId1] });

    expect(res.status).toBe(200);

    const zones = await prisma.zone.findMany({ where: { driverId } });
    expect(zones).toHaveLength(1);
    expect(zones[0].id).toBe(zoneId1);
  });
});

// ─── syncLocationBuffer — Race Condition Test ─────────────────────────────────
describe("DriverService.syncLocationBuffer — GPS Buffer", () => {
  beforeAll(async () => {
    if (!driverId) {
      const drv = await prisma.driver.create({
        data: { name: "Buffer Sync Driver", companyId },
      });
      driverId = drv.id;
    }
  });

  beforeEach(async () => {
    await redis.del("drivers:locations:buffer");
    await redis.del("drivers:locations:buffer:sync");
    await redis.del("drivers:locations:sync:lock");
  });

  afterEach(async () => {
    await redis.del("drivers:locations:buffer");
    await redis.del("drivers:locations:buffer:sync");
    await redis.del("drivers:locations:sync:lock");
  });

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

  it("should process valid updates when buffer contains deleted driver (P2025), out-of-range coords, and malformed JSON", async () => {
    const deletedDriverId = "00000000-0000-4000-8000-000000000000";
    const malformedDriverId = "malformed-driver-entry";
    const outOfRangeDriverId = "out-of-range-driver-entry";

    await redis.hSet("drivers:locations:buffer", deletedDriverId, JSON.stringify({
      lat: -31.1,
      lng: -64.1,
      ts: Date.now(),
      companyId,
    }));
    await redis.hSet("drivers:locations:buffer", malformedDriverId, "{not-valid-json");
    await redis.hSet("drivers:locations:buffer", outOfRangeDriverId, JSON.stringify({
      lat: 95,
      lng: -200,
      ts: Date.now(),
      companyId,
    }));
    await redis.hSet("drivers:locations:buffer", driverId, JSON.stringify({
      lat: -31.55,
      lng: -64.25,
      ts: Date.now(),
      companyId,
    }));

    await expect(DriverService.syncLocationBuffer()).resolves.toBeUndefined();

    const updated = await prisma.driver.findUnique({ where: { id: driverId } });
    expect(updated?.lat).toBeCloseTo(-31.55, 3);
    expect(updated?.lng).toBeCloseTo(-64.25, 3);

    const remainingSyncKeys = await redis.scanKeys("drivers:locations:buffer:sync*");
    expect(remainingSyncKeys).toHaveLength(0);

    const deletedRequeued = await redis.hGet("drivers:locations:buffer", deletedDriverId);
    expect(deletedRequeued).toBeNull();
    const outOfRangeRequeued = await redis.hGet("drivers:locations:buffer", outOfRangeDriverId);
    expect(outOfRangeRequeued).toBeNull();
  });

  it("should buffer companyId without premature delPrefix in updateLocation and invalidate cache after syncLocationBuffer flush", async () => {
    const delPrefixSpy = jest.spyOn(redis, "delPrefix");

    try {
      await DriverService.updateLocation(driverId, companyId, -31.6, -64.3);
      expect(delPrefixSpy).not.toHaveBeenCalled();

      const bufferedRaw = await redis.hGet("drivers:locations:buffer", driverId);
      expect(bufferedRaw).not.toBeNull();
      expect(JSON.parse(bufferedRaw!).companyId).toBe(companyId);

      await DriverService.syncLocationBuffer();
      expect(delPrefixSpy).toHaveBeenCalledWith(`drivers:${companyId}:`);
    } finally {
      delPrefixSpy.mockRestore();
    }
  });

  it("should re-queue transient DB failures when no newer update exists in buffer", async () => {
    const tsOld = Date.now() - 1000;
    await redis.hSet("drivers:locations:buffer", driverId, JSON.stringify({
      lat: -31.7,
      lng: -64.4,
      ts: tsOld,
      companyId,
    }));

    const updateSpy = jest
      .spyOn(prisma.driver, "update")
      .mockRejectedValueOnce(new Error("Transient DB error"));

    try {
      await DriverService.syncLocationBuffer();
      const requeuedRaw = await redis.hGet("drivers:locations:buffer", driverId);
      expect(requeuedRaw).not.toBeNull();
      const requeued = JSON.parse(requeuedRaw!);
      expect(requeued.lat).toBeCloseTo(-31.7, 3);
      expect(requeued.lng).toBeCloseTo(-64.4, 3);
      expect(requeued.ts).toBe(tsOld);
    } finally {
      updateSpy.mockRestore();
    }
  });

  it("should preserve newer concurrent buffer write when transient DB failure occurs", async () => {
    const tsOld = Date.now() - 2000;
    const tsNew = Date.now();
    await redis.hSet("drivers:locations:buffer", driverId, JSON.stringify({
      lat: -31.7,
      lng: -64.4,
      ts: tsOld,
      companyId,
    }));

    const updateSpy = jest.spyOn(prisma.driver, "update").mockImplementation((() => {
      return (async () => {
        await redis.hSet("drivers:locations:buffer", driverId, JSON.stringify({
          lat: -31.9,
          lng: -64.9,
          ts: tsNew,
          companyId,
        }));
        throw new Error("Transient DB error during concurrent update");
      })() as any;
    }) as any);

    try {
      await DriverService.syncLocationBuffer();
      const bufferedRaw = await redis.hGet("drivers:locations:buffer", driverId);
      expect(bufferedRaw).not.toBeNull();
      const buffered = JSON.parse(bufferedRaw!);
      expect(buffered.lat).toBeCloseTo(-31.9, 3);
      expect(buffered.lng).toBeCloseTo(-64.9, 3);
      expect(buffered.ts).toBe(tsNew);
    } finally {
      updateSpy.mockRestore();
    }
  });

  it("should deduplicate orphan syncKey against newer buffer entry by highest ts and release lock", async () => {
    const tsOld = Date.now() - 5000;
    const tsNew = Date.now();

    await redis.hSet("drivers:locations:buffer:sync", driverId, JSON.stringify({
      lat: -30.1,
      lng: -60.1,
      ts: tsOld,
      companyId,
    }));
    await redis.hSet("drivers:locations:buffer", driverId, JSON.stringify({
      lat: -31.88,
      lng: -64.88,
      ts: tsNew,
      companyId,
    }));

    await DriverService.syncLocationBuffer();

    const updated = await prisma.driver.findUnique({ where: { id: driverId } });
    expect(updated?.lat).toBeCloseTo(-31.88, 3);
    expect(updated?.lng).toBeCloseTo(-64.88, 3);

    const remainingSync = await redis.hGetAll("drivers:locations:buffer:sync");
    expect(Object.keys(remainingSync)).toHaveLength(0);
    const lockRemaining = await redis.get("drivers:locations:sync:lock");
    expect(lockRemaining).toBeNull();
  });

  it("should overlay live locations in getAllDrivers using bounded hmGet instead of global hGetAll", async () => {
    const hmGetSpy = jest.spyOn(redis, "hmGet");
    const hGetAllSpy = jest.spyOn(redis, "hGetAll");

    try {
      await DriverService.updateLocation(driverId, companyId, -31.42, -64.19);
      const res = await DriverService.getAllDrivers(companyId, { page: 1, limit: 10 });
      const found = res.items.find((d: any) => d.id === driverId);
      expect(found?.lat).toBeCloseTo(-31.42, 3);
      expect(found?.lng).toBeCloseTo(-64.19, 3);
      expect(hmGetSpy).toHaveBeenCalled();
      expect(hGetAllSpy).not.toHaveBeenCalled();
    } finally {
      hmGetSpy.mockRestore();
      hGetAllSpy.mockRestore();
      await redis.delPrefix(`drivers:${companyId}:`);
    }
  });
});

// ─── Task 1.2.4 — Transactional Zone & Package Synchronization ────────────────
describe("Task 1.2.4 — Transactional Zone & Package Synchronization", () => {
  let syncDriverId: string;
  let syncZoneAId: string;
  let syncZoneBId: string;

  beforeAll(async () => {
    const drv = await prisma.driver.create({
      data: { name: "Zone Sync Driver", companyId },
    });
    syncDriverId = drv.id;

    const [zA, zB] = await Promise.all([
      prisma.zone.create({
        data: { name: "Sync Zone A", companyId, driverId: syncDriverId, isActive: false },
      }),
      prisma.zone.create({
        data: { name: "Sync Zone B", companyId, driverId: syncDriverId, isActive: true },
      }),
    ]);
    syncZoneAId = zA.id;
    syncZoneBId = zB.id;
  });

  it("PATCH /api/zones/:id activates zone, promotes pending packages, writes history, and emits Socket.IO", async () => {
    const pkg = await prisma.package.create({
      data: {
        trackingCode: `SYNC-ACT-${Date.now()}`,
        recipientName: "Zone Activate Pkg",
        recipientAddress: "Av. Colon 500",
        recipientPhone: "3511112222",
        status: "pending",
        zoneId: syncZoneAId,
        companyId,
      },
    });

    const emitSpy = jest.spyOn(websocket, "emitToRoom");
    try {
      const res = await request(app)
        .patch(`/api/zones/${syncZoneAId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ isActive: true });

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);

      const updatedPkg = await prisma.package.findUnique({ where: { id: pkg.id } });
      expect(updatedPkg?.status).toBe("assigned");

      const history = await prisma.packageHistory.findMany({ where: { packageId: pkg.id } });
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe("assigned");

      expect(emitSpy).toHaveBeenCalledWith(
        `company-${companyId}`,
        "package-status-updated",
        expect.objectContaining({ packageId: pkg.id, status: "assigned", zoneId: syncZoneAId })
      );
      expect(emitSpy).toHaveBeenCalledWith(
        `company-${companyId}`,
        "business-event",
        expect.objectContaining({ type: "SYSTEM", title: "Zona Activada" })
      );
    } finally {
      emitSpy.mockRestore();
    }
  });

  it("PATCH /api/zones/:id reverts assigned packages to pending on deactivation and on driverId=null", async () => {
    const pkgDeactivate = await prisma.package.create({
      data: {
        trackingCode: `SYNC-DEACT-${Date.now()}`,
        recipientName: "Zone Deactivate Pkg",
        recipientAddress: "Av. Colon 501",
        recipientPhone: "3511112223",
        status: "assigned",
        zoneId: syncZoneAId,
        companyId,
      },
    });

    const resDeact = await request(app)
      .patch(`/api/zones/${syncZoneAId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });

    expect(resDeact.status).toBe(200);
    expect(resDeact.body.isActive).toBe(false);

    const dbDeact = await prisma.package.findUnique({ where: { id: pkgDeactivate.id } });
    expect(dbDeact?.status).toBe("pending");
    const histDeact = await prisma.packageHistory.findMany({ where: { packageId: pkgDeactivate.id } });
    expect(histDeact.some((h) => h.status === "pending")).toBe(true);

    // Now test removing driverId (driverId: null) from active syncZoneBId
    const pkgUnassign = await prisma.package.create({
      data: {
        trackingCode: `SYNC-UNDRV-${Date.now()}`,
        recipientName: "Zone Unassign Driver Pkg",
        recipientAddress: "Av. Colon 502",
        recipientPhone: "3511112224",
        status: "assigned",
        zoneId: syncZoneBId,
        companyId,
      },
    });

    const resUnassign = await request(app)
      .patch(`/api/zones/${syncZoneBId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ driverId: null });

    expect(resUnassign.status).toBe(200);
    expect(resUnassign.body.driverId).toBeNull();
    expect(resUnassign.body.isActive).toBe(false);

    const dbUnassign = await prisma.package.findUnique({ where: { id: pkgUnassign.id } });
    expect(dbUnassign?.status).toBe("pending");
    const histUnassign = await prisma.packageHistory.findMany({ where: { packageId: pkgUnassign.id } });
    expect(histUnassign.some((h) => h.status === "pending")).toBe(true);
  });

  it("POST /api/zones/bulk-status transitions pending <-> assigned transactionally with history", async () => {
    await prisma.zone.update({
      where: { id: syncZoneBId },
      data: { driverId: syncDriverId, isActive: false },
    });

    const pkgBulk = await prisma.package.create({
      data: {
        trackingCode: `SYNC-BULK-${Date.now()}`,
        recipientName: "Bulk Sync Pkg",
        recipientAddress: "Av. General Paz 100",
        recipientPhone: "3511112225",
        status: "pending",
        zoneId: syncZoneBId,
        companyId,
      },
    });

    const resMissingBody = await request(app)
      .post("/api/zones/bulk-status")
      .set("Authorization", `Bearer ${token}`);
    expect(resMissingBody.status).toBe(400);

    const resOn = await request(app)
      .post("/api/zones/bulk-status")
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: true });

    expect(resOn.status).toBe(200);
    const dbAfterOn = await prisma.package.findUnique({ where: { id: pkgBulk.id } });
    expect(dbAfterOn?.status).toBe("assigned");

    const resOff = await request(app)
      .post("/api/zones/bulk-status")
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });

    expect(resOff.status).toBe(200);
    const dbAfterOff = await prisma.package.findUnique({ where: { id: pkgBulk.id } });
    expect(dbAfterOff?.status).toBe("pending");

    const history = await prisma.packageHistory.findMany({
      where: { packageId: pkgBulk.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => h.status)).toEqual(["assigned", "pending"]);
  });

  it("POST /api/drivers/:driverId/zones reverts assigned packages and records history when removing a zone", async () => {
    await prisma.zone.update({
      where: { id: syncZoneAId },
      data: { driverId: syncDriverId, isActive: true },
    });

    const pkgRemoved = await prisma.package.create({
      data: {
        trackingCode: `SYNC-DRVRM-${Date.now()}`,
        recipientName: "Driver Remove Zone Pkg",
        recipientAddress: "Av. Velez Sarsfield 300",
        recipientPhone: "3511112226",
        status: "assigned",
        zoneId: syncZoneAId,
        companyId,
      },
    });

    const res = await request(app)
      .post(`/api/drivers/${syncDriverId}/zones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ zoneIds: [syncZoneBId] });

    expect(res.status).toBe(200);

    const updatedZoneA = await prisma.zone.findUnique({ where: { id: syncZoneAId } });
    expect(updatedZoneA?.driverId).toBeNull();
    expect(updatedZoneA?.isActive).toBe(false);

    const dbPkg = await prisma.package.findUnique({ where: { id: pkgRemoved.id } });
    expect(dbPkg?.status).toBe("pending");

    const history = await prisma.packageHistory.findMany({ where: { packageId: pkgRemoved.id } });
    expect(history.some((h) => h.status === "pending")).toBe(true);
  });
});
