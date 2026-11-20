import "dotenv/config";
import http from "http";
import request from "supertest";
import jwt from "jsonwebtoken";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
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
  await closeDatabase();
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

// ─── Task 2.1.4 — GET / PATCH / DELETE /api/drivers/:id ───────────────────────
describe("Task 2.1.4 — GET / PATCH / DELETE /api/drivers/:id", () => {
  let otherCompanyId: string;
  let otherCompanyToken: string;
  let otherDriverId: string;
  let otherDriverUsername: string;

  let crudDriverId: string;
  let crudDriverUsername: string;
  let crudDriverToken: string;
  let crudZone1Id: string;
  let crudZone2Id: string;
  let noUserDriverId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const otherCompany = await prisma.company.create({
      data: {
        name: "Other Driver Tenant Co",
        slug: `other-drv-tenant-${ts}`,
      },
    });
    otherCompanyId = otherCompany.id;

    const otherDispatcher = await prisma.user.create({
      data: {
        username: `other_disp_${ts}`,
        password: "hashed-placeholder-password",
        role: "dispatcher",
        companyId: otherCompanyId,
      },
    });

    otherCompanyToken = jwt.sign(
      {
        userId: otherDispatcher.id,
        username: otherDispatcher.username,
        role: "dispatcher",
        driverId: null,
        companyId: otherCompanyId,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    );

    otherDriverUsername = `other_tenant_drv_${ts}`;
    const otherDriverRes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${otherCompanyToken}`)
      .send({
        name: "Other Tenant Driver",
        username: otherDriverUsername,
        password: "driverpass123",
      });
    expect(otherDriverRes.status).toBe(201);
    otherDriverId = otherDriverRes.body.id;

    // Main company fixtures for CRUD lifecycle
    crudDriverUsername = `crud_drv_${ts}`;
    const crudDriverRes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Roberto CRUD",
        username: crudDriverUsername,
        password: "driverpass123",
      });
    expect(crudDriverRes.status).toBe(201);
    crudDriverId = crudDriverRes.body.id;

    const crudLogin = await request(app).post("/api/auth/login").send({
      username: crudDriverUsername,
      password: "driverpass123",
    });
    expect(crudLogin.status).toBe(200);
    crudDriverToken = crudLogin.body.token;

    const [z1, z2] = await Promise.all([
      prisma.zone.create({
        data: { name: `CRUD Zone 1 ${ts}`, companyId, driverId: crudDriverId, isActive: true },
      }),
      prisma.zone.create({
        data: { name: `CRUD Zone 2 ${ts}`, companyId, driverId: crudDriverId, isActive: false },
      }),
    ]);
    crudZone1Id = z1.id;
    crudZone2Id = z2.id;

    const noUserDriver = await prisma.driver.create({
      data: { name: "Driver Without User", companyId },
    });
    noUserDriverId = noUserDriver.id;
  });

  afterAll(async () => {
    if (otherCompanyId) {
      await prisma.packageHistory.deleteMany({ where: { package: { companyId: otherCompanyId } } });
      await prisma.package.deleteMany({ where: { companyId: otherCompanyId } });
      await prisma.zone.updateMany({ where: { companyId: otherCompanyId }, data: { driverId: null } });
      await prisma.user.deleteMany({ where: { companyId: otherCompanyId } });
      await prisma.driver.deleteMany({ where: { companyId: otherCompanyId } });
      await prisma.zone.deleteMany({ where: { companyId: otherCompanyId } });
      await prisma.company.delete({ where: { id: otherCompanyId } }).catch(() => {});
    }
  });

  describe("Route ordering, RBAC & Swagger docs", () => {
    it("keeps PATCH /api/drivers/location working for drivers ahead of PATCH /:id", async () => {
      const res = await request(app)
        .patch("/api/drivers/location")
        .set("Authorization", `Bearer ${crudDriverToken}`)
        .send({ lat: -31.41, lng: -64.18 });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(crudDriverId);
      expect(res.body.lat).toBeCloseTo(-31.41, 4);
      expect(res.body.lng).toBeCloseTo(-64.18, 4);

      await redis.hDel("drivers:locations:buffer", crudDriverId);
    });

    it("rejects unauthenticated (401) and driver-role (403) requests on /:id endpoints", async () => {
      const unauthGet = await request(app).get(`/api/drivers/${crudDriverId}`);
      expect(unauthGet.status).toBe(401);

      const drvGet = await request(app)
        .get(`/api/drivers/${crudDriverId}`)
        .set("Authorization", `Bearer ${crudDriverToken}`);
      expect(drvGet.status).toBe(403);

      const drvPatch = await request(app)
        .patch(`/api/drivers/${crudDriverId}`)
        .set("Authorization", `Bearer ${crudDriverToken}`)
        .send({ name: "Hack Name" });
      expect(drvPatch.status).toBe(403);

      const drvDelete = await request(app)
        .delete(`/api/drivers/${crudDriverId}`)
        .set("Authorization", `Bearer ${crudDriverToken}`);
      expect(drvDelete.status).toBe(403);
    });

    it("documents GET, PATCH, and DELETE /api/drivers/{id} in /swagger.json", async () => {
      const res = await request(app).get("/swagger.json");
      expect(res.status).toBe(200);
      const pathSpec = res.body?.paths?.["/api/drivers/{id}"];
      expect(pathSpec).toBeDefined();
      expect(pathSpec.get).toBeDefined();
      expect(pathSpec.patch).toBeDefined();
      expect(pathSpec.delete).toBeDefined();
    });
  });

  describe("GET /api/drivers/:id", () => {
    it("returns full driver detail with zones, packages, counts, live coords, and no password", async () => {
      const ts = Date.now();
      const [assignedDirectPkg, assignedZonePkg, deliveredPkg, pendingZonePkg] = await Promise.all([
        prisma.package.create({
          data: {
            trackingCode: `DRV-GET-DIR-${ts}`,
            recipientName: "Direct Pkg",
            recipientAddress: "Av. Colon 10",
            recipientPhone: "3510000001",
            status: "assigned",
            zoneId: crudZone1Id,
            driverId: crudDriverId,
            companyId,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `DRV-GET-ZON-${ts}`,
            recipientName: "Zone Pkg",
            recipientAddress: "Av. Colon 20",
            recipientPhone: "3510000002",
            status: "assigned",
            zoneId: crudZone1Id,
            driverId: null,
            companyId,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `DRV-GET-DEL-${ts}`,
            recipientName: "Delivered Pkg",
            recipientAddress: "Av. Colon 30",
            recipientPhone: "3510000003",
            status: "delivered",
            zoneId: crudZone1Id,
            driverId: crudDriverId,
            companyId,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `DRV-GET-PND-${ts}`,
            recipientName: "Pending Zone Pkg",
            recipientAddress: "Av. Colon 40",
            recipientPhone: "3510000004",
            status: "pending",
            zoneId: crudZone2Id,
            driverId: null,
            companyId,
          },
        }),
      ]);

      await DriverService.updateLocation(crudDriverId, companyId, -31.4321, -64.1987);

      try {
        const res = await request(app)
          .get(`/api/drivers/${crudDriverId}`)
          .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(crudDriverId);
        expect(res.body.name).toBe("Roberto CRUD");
        expect(res.body.lat).toBeCloseTo(-31.4321, 4);
        expect(res.body.lng).toBeCloseTo(-64.1987, 4);
        expect(res.body.isOnline).toBe(false);

        expect(res.body.user).toBeDefined();
        expect(res.body.user.username).toBe(crudDriverUsername);
        expect(res.body.user.password).toBeUndefined();
        expect("password" in res.body.user).toBe(false);

        expect(res.body.zones).toHaveLength(2);
        expect(res.body.zones.map((z: any) => z.id)).toEqual(
          expect.arrayContaining([crudZone1Id, crudZone2Id])
        );

        expect(res.body.assignedPackagesCount).toBe(2);
        expect(res.body.packages.map((p: any) => p.id)).toEqual(
          expect.arrayContaining([assignedDirectPkg.id, assignedZonePkg.id])
        );
        expect(res.body.packages.map((p: any) => p.id)).not.toContain(deliveredPkg.id);
        expect(res.body.packages.map((p: any) => p.id)).not.toContain(pendingZonePkg.id);

        expect(res.body.packageCounts).toEqual({
          pending: 1,
          assigned: 2,
          in_transit: 0,
          delivered: 1,
          cancelled: 0,
          total: 4,
        });
      } finally {
        await redis.hDel("drivers:locations:buffer", crudDriverId);
        await prisma.package.deleteMany({
          where: {
            id: { in: [assignedDirectPkg.id, assignedZonePkg.id, deliveredPkg.id, pendingZonePkg.id] },
          },
        });
      }
    });

    it("returns 400 for invalid UUID and 404 for unknown or cross-tenant driver", async () => {
      const badUuid = await request(app)
        .get("/api/drivers/not-a-uuid")
        .set("Authorization", `Bearer ${token}`);
      expect(badUuid.status).toBe(400);
      expect(badUuid.body.error).toBe("Validation failed");

      const notFound = await request(app)
        .get("/api/drivers/00000000-0000-4000-8000-000000000000")
        .set("Authorization", `Bearer ${token}`);
      expect(notFound.status).toBe(404);

      const crossTenant = await request(app)
        .get(`/api/drivers/${otherDriverId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(crossTenant.status).toBe(404);
    });
  });

  describe("PATCH /api/drivers/:id", () => {
    it("validates payload with Zod and rejects empty body or invalid fields with 400", async () => {
      const emptyRes = await request(app)
        .patch(`/api/drivers/${crudDriverId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(emptyRes.status).toBe(400);

      const shortNameRes = await request(app)
        .patch(`/api/drivers/${crudDriverId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: " A " });
      expect(shortNameRes.status).toBe(400);

      const badCoordsRes = await request(app)
        .patch(`/api/drivers/${crudDriverId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ lat: 120 });
      expect(badCoordsRes.status).toBe(400);

      const badUuidRes = await request(app)
        .patch("/api/drivers/invalid-uuid")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Valid Name" });
      expect(badUuidRes.status).toBe(400);
    });

    it("updates driver name, coordinates, username, and password without exposing password and invalidates caches", async () => {
      const newUsername = `crud_drv_updated_${Date.now()}`;
      const newPassword = "newDriverPass456";
      const delPrefixSpy = jest.spyOn(redis, "delPrefix").mockResolvedValue(undefined);
      const emitSpy = jest.spyOn(websocket, "emitToRoom");

      try {
        const res = await request(app)
          .patch(`/api/drivers/${crudDriverId}`)
          .set("Authorization", `Bearer ${token}`)
          .send({
            name: "  Roberto Actualizado  ",
            username: `  ${newUsername}  `,
            password: newPassword,
            lat: -31.45,
            lng: -64.21,
          });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe("Roberto Actualizado");
        expect(res.body.lat).toBeCloseTo(-31.45, 4);
        expect(res.body.lng).toBeCloseTo(-64.21, 4);
        expect(res.body.user?.username).toBe(newUsername);
        expect(res.body.user?.password).toBeUndefined();
        expect("password" in (res.body.user ?? {})).toBe(false);

        expect(delPrefixSpy).toHaveBeenCalledWith(`drivers:${companyId}:`);
        expect(delPrefixSpy).toHaveBeenCalledWith(`zones:${companyId}:`);
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "driver-updated",
          expect.objectContaining({ id: crudDriverId, name: "Roberto Actualizado" })
        );

        // Allowing PATCH with the exact same username must not trigger 409
        const sameUsernameRes = await request(app)
          .patch(`/api/drivers/${crudDriverId}`)
          .set("Authorization", `Bearer ${token}`)
          .send({ username: newUsername });
        expect(sameUsernameRes.status).toBe(200);

        // Verify updated credentials work at login
        const loginNew = await request(app).post("/api/auth/login").send({
          username: newUsername,
          password: newPassword,
        });
        expect(loginNew.status).toBe(200);
        crudDriverUsername = newUsername;
        crudDriverToken = loginNew.body.token;
      } finally {
        delPrefixSpy.mockRestore();
        emitSpy.mockRestore();
      }
    });

    it("returns 409 when updating username to an already existing username, 422 when driver has no user, and 404 cross-tenant", async () => {
      const conflictRes = await request(app)
        .patch(`/api/drivers/${crudDriverId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ username: otherDriverUsername });
      expect(conflictRes.status).toBe(409);

      const noUserUsernameRes = await request(app)
        .patch(`/api/drivers/${noUserDriverId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ username: `nouser_${Date.now()}` });
      expect(noUserUsernameRes.status).toBe(422);

      const noUserNameOnlyRes = await request(app)
        .patch(`/api/drivers/${noUserDriverId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Driver No User Renamed" });
      expect(noUserNameOnlyRes.status).toBe(200);
      expect(noUserNameOnlyRes.body.name).toBe("Driver No User Renamed");

      const crossTenantRes = await request(app)
        .patch(`/api/drivers/${otherDriverId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Cross Tenant Hijack" });
      expect(crossTenantRes.status).toBe(404);

      const otherStillIntact = await prisma.driver.findUnique({ where: { id: otherDriverId } });
      expect(otherStillIntact?.name).toBe("Other Tenant Driver");
    });
  });

  describe("DELETE /api/drivers/:id", () => {
    it("returns 400 on invalid UUID and 404 on unknown or cross-tenant driver", async () => {
      const badUuid = await request(app)
        .delete("/api/drivers/not-a-uuid")
        .set("Authorization", `Bearer ${token}`);
      expect(badUuid.status).toBe(400);

      const notFound = await request(app)
        .delete("/api/drivers/00000000-0000-4000-8000-000000000000")
        .set("Authorization", `Bearer ${token}`);
      expect(notFound.status).toBe(404);

      const crossTenant = await request(app)
        .delete(`/api/drivers/${otherDriverId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(crossTenant.status).toBe(404);

      const otherStillExists = await prisma.driver.findUnique({ where: { id: otherDriverId } });
      expect(otherStillExists).not.toBeNull();
    });

    it("blocks deletion with 422 when driver has active in_transit packages", async () => {
      const inTransitPkg = await prisma.package.create({
        data: {
          trackingCode: `DRV-DEL-TRANSIT-${Date.now()}`,
          recipientName: "In Transit Recipient",
          recipientAddress: "Av. Hipólito Yrigoyen 200",
          recipientPhone: "3515550000",
          status: "in_transit",
          zoneId: crudZone1Id,
          driverId: crudDriverId,
          companyId,
        },
      });

      try {
        const res = await request(app)
          .delete(`/api/drivers/${crudDriverId}`)
          .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(422);

        const driverStillExists = await prisma.driver.findUnique({ where: { id: crudDriverId } });
        expect(driverStillExists).not.toBeNull();
        const zone1StillLinked = await prisma.zone.findUnique({ where: { id: crudZone1Id } });
        expect(zone1StillLinked?.driverId).toBe(crudDriverId);
      } finally {
        await prisma.package.delete({ where: { id: inTransitPkg.id } });
      }
    });

    it("safely deletes driver in transaction: unlinks zones, reverts assigned packages with history, preserves delivered/cancelled, invalidates caches & emits Socket.IO", async () => {
      const ts = Date.now();
      const [assignedZonePkg, assignedDirectPkg, deliveredPkg, cancelledPkg] = await Promise.all([
        prisma.package.create({
          data: {
            trackingCode: `DRV-DEL-ASGZ-${ts}`,
            recipientName: "Assigned via Zone",
            recipientAddress: "Calle San Martín 100",
            recipientPhone: "3516660001",
            status: "assigned",
            zoneId: crudZone1Id,
            driverId: null,
            companyId,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `DRV-DEL-ASGD-${ts}`,
            recipientName: "Assigned Direct",
            recipientAddress: "Calle San Martín 200",
            recipientPhone: "3516660002",
            status: "assigned",
            zoneId: null,
            driverId: crudDriverId,
            companyId,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `DRV-DEL-DLV-${ts}`,
            recipientName: "Delivered Keep",
            recipientAddress: "Calle San Martín 300",
            recipientPhone: "3516660003",
            status: "delivered",
            zoneId: crudZone1Id,
            driverId: crudDriverId,
            companyId,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `DRV-DEL-CNC-${ts}`,
            recipientName: "Cancelled Keep",
            recipientAddress: "Calle San Martín 400",
            recipientPhone: "3516660004",
            status: "cancelled",
            zoneId: crudZone2Id,
            driverId: crudDriverId,
            companyId,
          },
        }),
      ]);

      await DriverService.updateLocation(crudDriverId, companyId, -31.5, -64.5);

      const delPrefixSpy = jest.spyOn(redis, "delPrefix").mockResolvedValue(undefined);
      const emitSpy = jest.spyOn(websocket, "emitToRoom");

      try {
        const res = await request(app)
          .delete(`/api/drivers/${crudDriverId}`)
          .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.deletedDriverId).toBe(crudDriverId);
        expect(res.body.unlinkedZoneIds).toEqual(expect.arrayContaining([crudZone1Id, crudZone2Id]));
        expect(res.body.revertedPackageIds).toEqual(
          expect.arrayContaining([assignedZonePkg.id, assignedDirectPkg.id])
        );
        expect(res.body.revertedCount).toBe(2);

        // Driver and linked User are removed
        const deletedDriver = await prisma.driver.findUnique({ where: { id: crudDriverId } });
        expect(deletedDriver).toBeNull();
        const deletedUser = await prisma.user.findUnique({ where: { username: crudDriverUsername } });
        expect(deletedUser).toBeNull();

        // Deleted driver cannot log in anymore
        const loginAttempt = await request(app).post("/api/auth/login").send({
          username: crudDriverUsername,
          password: "newDriverPass456",
        });
        expect(loginAttempt.status).toBe(401);

        // GET /api/drivers/:id now returns 404
        const getAfterDelete = await request(app)
          .get(`/api/drivers/${crudDriverId}`)
          .set("Authorization", `Bearer ${token}`);
        expect(getAfterDelete.status).toBe(404);

        // Zones are unlinked and deactivated
        const [z1After, z2After] = await Promise.all([
          prisma.zone.findUnique({ where: { id: crudZone1Id } }),
          prisma.zone.findUnique({ where: { id: crudZone2Id } }),
        ]);
        expect(z1After?.driverId).toBeNull();
        expect(z1After?.isActive).toBe(false);
        expect(z2After?.driverId).toBeNull();
        expect(z2After?.isActive).toBe(false);

        // Assigned packages reverted to pending with driverId: null and PackageHistory created
        const [dbAsgZone, dbAsgDirect, dbDelivered, dbCancelled] = await Promise.all([
          prisma.package.findUnique({ where: { id: assignedZonePkg.id } }),
          prisma.package.findUnique({ where: { id: assignedDirectPkg.id } }),
          prisma.package.findUnique({ where: { id: deliveredPkg.id } }),
          prisma.package.findUnique({ where: { id: cancelledPkg.id } }),
        ]);

        expect(dbAsgZone?.status).toBe("pending");
        expect(dbAsgZone?.driverId).toBeNull();
        expect(dbAsgDirect?.status).toBe("pending");
        expect(dbAsgDirect?.driverId).toBeNull();

        // Delivered and cancelled statuses remain preserved
        expect(dbDelivered?.status).toBe("delivered");
        expect(dbDelivered?.driverId).toBeNull();
        expect(dbCancelled?.status).toBe("cancelled");
        expect(dbCancelled?.driverId).toBeNull();

        const [histZone, histDirect] = await Promise.all([
          prisma.packageHistory.findMany({ where: { packageId: assignedZonePkg.id } }),
          prisma.packageHistory.findMany({ where: { packageId: assignedDirectPkg.id } }),
        ]);
        expect(histZone).toHaveLength(1);
        expect(histZone[0].status).toBe("pending");
        expect(histZone[0].notes).toContain("driver");
        expect(histDirect).toHaveLength(1);
        expect(histDirect[0].status).toBe("pending");

        // Redis buffer cleaned and all 3 cache prefixes invalidated
        const bufferedAfter = await redis.hGet("drivers:locations:buffer", crudDriverId);
        expect(bufferedAfter).toBeNull();
        expect(delPrefixSpy).toHaveBeenCalledWith(`drivers:${companyId}:`);
        expect(delPrefixSpy).toHaveBeenCalledWith(`zones:${companyId}:`);
        expect(delPrefixSpy).toHaveBeenCalledWith(`packages:${companyId}:`);

        // Socket.IO events emitted
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "zones-reassigned",
          expect.objectContaining({ driverId: crudDriverId, zoneIds: [] })
        );
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "package-status-updated",
          expect.objectContaining({ packageId: assignedZonePkg.id, status: "pending" })
        );
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "package-status-updated",
          expect.objectContaining({ packageId: assignedDirectPkg.id, status: "pending" })
        );
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "driver-deleted",
          expect.objectContaining({ driverId: crudDriverId })
        );
      } finally {
        delPrefixSpy.mockRestore();
        emitSpy.mockRestore();
        await prisma.packageHistory.deleteMany({
          where: { packageId: { in: [assignedZonePkg.id, assignedDirectPkg.id] } },
        });
        await prisma.package.deleteMany({
          where: {
            id: { in: [assignedZonePkg.id, assignedDirectPkg.id, deliveredPkg.id, cancelledPkg.id] },
          },
        });
      }
    });

    it("reflects live online status in GET /api/drivers/:id and disconnects socket on DELETE", async () => {
      const ts = Date.now();
      const onlineRes = await request(app)
        .post("/api/drivers")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Online Socket Driver",
          username: `online_drv_${ts}`,
          password: "driverpass123",
        });
      expect(onlineRes.status).toBe(201);
      const onlineDriverId = onlineRes.body.id;

      const loginOnline = await request(app).post("/api/auth/login").send({
        username: `online_drv_${ts}`,
        password: "driverpass123",
      });
      const onlineDriverToken = loginOnline.body.token;

      const httpServer = http.createServer(app);
      const ioServer = websocket.initSocket(httpServer);
      await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
      const addr = httpServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const url = `http://127.0.0.1:${port}`;

      const clients: ClientSocket[] = [];
      try {
        const driverClient = await new Promise<ClientSocket>((resolve, reject) => {
          const c = ioClient(url, {
            auth: { token: onlineDriverToken },
            transports: ["websocket"],
            reconnection: false,
          });
          c.on("connect", () => resolve(c));
          c.on("connect_error", reject);
        });
        clients.push(driverClient);

        // Give server connection handler a brief tick to join room & populate socket.data
        await new Promise((r) => setTimeout(r, 40));

        const detailOnline = await request(app)
          .get(`/api/drivers/${onlineDriverId}`)
          .set("Authorization", `Bearer ${token}`);
        expect(detailOnline.status).toBe(200);
        expect(detailOnline.body.isOnline).toBe(true);

        const disconnectPromise = new Promise<void>((resolve) => {
          if (driverClient.disconnected) {
            resolve();
            return;
          }
          driverClient.once("disconnect", () => resolve());
        });

        const delRes = await request(app)
          .delete(`/api/drivers/${onlineDriverId}`)
          .set("Authorization", `Bearer ${token}`);
        expect(delRes.status).toBe(200);

        await disconnectPromise;
        expect(driverClient.connected).toBe(false);
      } finally {
        for (const c of clients) {
          c.disconnect();
        }
        await new Promise<void>((resolve) => ioServer.close(() => resolve()));
        if (httpServer.listening) {
          await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        }
      }
    });
  });
});
