import "dotenv/config";
import request from "supertest";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
import { redis } from "../src/redis";
import { PackageService } from "../src/services/package.service";

describe("Prisma Schema, Package.driverId, onDelete Policies & Indexes", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let companyId: string;
  let adminToken: string;
  let driverAId: string;
  let driverAToken: string;
  let driverBId: string;
  let driverBToken: string;
  let zoneId: string;

  beforeAll(async () => {
    const reg = await request(app).post("/api/auth/register-company").send({
      companyName: "Prisma Driver Co",
      companySlug: `prisma-drv-${suffix}`,
      username: `prisma_admin_${suffix}`,
      password: "securepassword123",
    });
    expect(reg.status).toBe(201);
    companyId = reg.body.company.id;

    const adminLogin = await request(app).post("/api/auth/login").send({
      username: `prisma_admin_${suffix}`,
      password: "securepassword123",
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    const drvARes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Driver Alpha",
        username: `drv_alpha_${suffix}`,
        password: "driverpass123",
      });
    expect(drvARes.status).toBe(201);
    driverAId = drvARes.body.id;

    const drvBRes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Driver Beta",
        username: `drv_beta_${suffix}`,
        password: "driverpass123",
      });
    expect(drvBRes.status).toBe(201);
    driverBId = drvBRes.body.id;

    const [loginA, loginB] = await Promise.all([
      request(app).post("/api/auth/login").send({
        username: `drv_alpha_${suffix}`,
        password: "driverpass123",
      }),
      request(app).post("/api/auth/login").send({
        username: `drv_beta_${suffix}`,
        password: "driverpass123",
      }),
    ]);
    driverAToken = loginA.body.token;
    driverBToken = loginB.body.token;

    const zone = await prisma.zone.create({
      data: {
        name: "Zone One",
        companyId,
        driverId: driverAId,
        isActive: true,
      },
    });
    zoneId = zone.id;
  });

  afterAll(async () => {
    if (companyId) {
      await redis.delPrefix(`drivers:${companyId}:`).catch(() => {});
      await redis.delPrefix(`zones:${companyId}:`).catch(() => {});
      await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
    }
    await closeDatabase();
    await redis.disconnect();
  });

  it("sets direct driverId on package creation, assignment, and zone status transitions without rewriting historical drivers", async () => {
    // 1. Auto-assigned package created on active zone gets driverAId directly
    const deliveredRes = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        trackingCode: `HIST-DEL-${suffix}`,
        recipientName: "Delivered Hist",
        recipientAddress: "Av. Colon 100",
        recipientPhone: "3511000001",
        zoneId,
      });
    expect(deliveredRes.status).toBe(201);
    expect(deliveredRes.body.status).toBe("assigned");
    expect(deliveredRes.body.driverId).toBe(driverAId);

    const deliveredPkgId = deliveredRes.body.id;

    // Move deliveredPkg to in_transit -> delivered by Driver A
    const t1 = await request(app)
      .patch(`/api/packages/${deliveredPkgId}/status`)
      .set("Authorization", `Bearer ${driverAToken}`)
      .send({ status: "in_transit" });
    expect(t1.status).toBe(200);

    const t2 = await request(app)
      .patch(`/api/packages/${deliveredPkgId}/status`)
      .set("Authorization", `Bearer ${driverAToken}`)
      .send({ status: "delivered" });
    expect(t2.status).toBe(200);

    // 2. Second package moved to in_transit by Driver A
    const inTransitRes = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        trackingCode: `HIST-TRN-${suffix}`,
        recipientName: "Transit Hist",
        recipientAddress: "Av. Colon 200",
        recipientPhone: "3511000002",
        zoneId,
      });
    expect(inTransitRes.status).toBe(201);
    const inTransitPkgId = inTransitRes.body.id;

    const t3 = await request(app)
      .patch(`/api/packages/${inTransitPkgId}/status`)
      .set("Authorization", `Bearer ${driverAToken}`)
      .send({ status: "in_transit" });
    expect(t3.status).toBe(200);

    // 3. Third package remains in assigned state
    const assignedRes = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        trackingCode: `HIST-ASN-${suffix}`,
        recipientName: "Assigned Hist",
        recipientAddress: "Av. Colon 300",
        recipientPhone: "3511000003",
        zoneId,
      });
    expect(assignedRes.status).toBe(201);
    const assignedPkgId = assignedRes.body.id;

    // Transfer active zone ownership from Driver A to Driver B
    const transferRes = await request(app)
      .patch(`/api/zones/${zoneId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId: driverBId });
    expect(transferRes.status).toBe(200);
    expect(transferRes.body.driverId).toBe(driverBId);

    const [dbDelivered, dbInTransit, dbAssigned] = await Promise.all([
      prisma.package.findUnique({ where: { id: deliveredPkgId } }),
      prisma.package.findUnique({ where: { id: inTransitPkgId } }),
      prisma.package.findUnique({ where: { id: assignedPkgId } }),
    ]);

    // Historical delivered and active in_transit packages MUST preserve Driver A
    expect(dbDelivered?.driverId).toBe(driverAId);
    expect(dbInTransit?.driverId).toBe(driverAId);
    // Still-assigned package moves to new zone owner Driver B
    expect(dbAssigned?.driverId).toBe(driverBId);

    // Public tracking stream target MUST resolve to Driver A for the in_transit package, not Driver B
    const streamTarget = await PackageService.getAssignedDriverId(
      `HIST-TRN-${suffix}`,
      `prisma-drv-${suffix}`
    );
    expect(streamTarget).toEqual({ driverId: driverAId });

    // Driver B cannot hijack Driver A's in_transit package even after zone transfer
    const hijackRes = await request(app)
      .patch(`/api/packages/${inTransitPkgId}/status`)
      .set("Authorization", `Bearer ${driverBToken}`)
      .send({ status: "delivered" });
    expect(hijackRes.status).toBe(403);

    // Driver A CAN still finish delivering their in_transit package
    const finishRes = await request(app)
      .patch(`/api/packages/${inTransitPkgId}/status`)
      .set("Authorization", `Bearer ${driverAToken}`)
      .send({ status: "delivered" });
    expect(finishRes.status).toBe(200);
    expect(finishRes.body.driverId).toBe(driverAId);

    // Driver A still sees delivered packages in my-packages; Driver B only sees assignedPkgId
    const [myPkgA, myPkgB] = await Promise.all([
      request(app).get("/api/packages/my-packages").set("Authorization", `Bearer ${driverAToken}`),
      request(app).get("/api/packages/my-packages").set("Authorization", `Bearer ${driverBToken}`),
    ]);
    expect(myPkgA.status).toBe(200);
    expect(myPkgB.status).toBe(200);
    expect(myPkgA.body.map((p: any) => p.id)).toEqual(
      expect.arrayContaining([deliveredPkgId, inTransitPkgId])
    );
    expect(myPkgA.body.map((p: any) => p.id)).not.toContain(assignedPkgId);
    expect(myPkgB.body.map((p: any) => p.id)).toContain(assignedPkgId);
    expect(myPkgB.body.map((p: any) => p.id)).not.toContain(deliveredPkgId);

    // Reverting zone to inactive clears driverId on assigned package -> pending, preserves delivered
    const deactRes = await request(app)
      .patch(`/api/zones/${zoneId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactRes.status).toBe(200);

    const dbAssignedAfterDeact = await prisma.package.findUnique({ where: { id: assignedPkgId } });
    const dbDeliveredAfterDeact = await prisma.package.findUnique({ where: { id: deliveredPkgId } });
    expect(dbAssignedAfterDeact?.status).toBe("pending");
    expect(dbAssignedAfterDeact?.driverId).toBeNull();
    expect(dbDeliveredAfterDeact?.driverId).toBe(driverAId);
  });

  it("handles bulk zone status, manual assignToDriver, and DriverService.assignZones without rewriting historical driverId", async () => {
    const bulkZone = await prisma.zone.create({
      data: {
        name: "Bulk Transfer Zone",
        companyId,
        driverId: driverAId,
        isActive: false,
      },
    });

    const manualPkg = await prisma.package.create({
      data: {
        trackingCode: `BULK-MAN-${suffix}`,
        recipientName: "Manual Assign",
        recipientAddress: "Av. Velez 100",
        recipientPhone: "3512000001",
        status: "pending",
        zoneId: bulkZone.id,
        companyId,
      },
    });

    // Manual assignToDriver persists direct driverId
    const assignRes = await request(app)
      .post(`/api/packages/${manualPkg.id}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ driverId: driverAId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.driverId).toBe(driverAId);

    // Move manualPkg to delivered by Driver A
    await request(app)
      .patch(`/api/packages/${manualPkg.id}/status`)
      .set("Authorization", `Bearer ${driverAToken}`)
      .send({ status: "in_transit" })
      .expect(200);
    await request(app)
      .patch(`/api/packages/${manualPkg.id}/status`)
      .set("Authorization", `Bearer ${driverAToken}`)
      .send({ status: "delivered" })
      .expect(200);

    // Create a pending package in bulkZone, then bulk-activate all zones
    const pendingBulkPkg = await prisma.package.create({
      data: {
        trackingCode: `BULK-PND-${suffix}`,
        recipientName: "Pending Bulk",
        recipientAddress: "Av. Velez 200",
        recipientPhone: "3512000002",
        status: "pending",
        zoneId: bulkZone.id,
        companyId,
      },
    });

    const bulkOnRes = await request(app)
      .post("/api/zones/bulk-status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });
    expect(bulkOnRes.status).toBe(200);

    const pendingAfterBulkOn = await prisma.package.findUnique({ where: { id: pendingBulkPkg.id } });
    expect(pendingAfterBulkOn?.status).toBe("assigned");
    expect(pendingAfterBulkOn?.driverId).toBe(driverAId);

    // Transfer active bulkZone from Driver A to Driver B via POST /api/drivers/:driverId/zones
    const reassignRes = await request(app)
      .post(`/api/drivers/${driverBId}/zones`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ zoneIds: [bulkZone.id] });
    expect(reassignRes.status).toBe(200);

    const [manualAfterTransfer, pendingAfterTransfer] = await Promise.all([
      prisma.package.findUnique({ where: { id: manualPkg.id } }),
      prisma.package.findUnique({ where: { id: pendingBulkPkg.id } }),
    ]);

    expect(manualAfterTransfer?.driverId).toBe(driverAId);
    expect(pendingAfterTransfer?.driverId).toBe(driverBId);

    // Bulk deactivate clears driverId on assigned package -> pending, keeps delivered package driverAId
    const bulkOffRes = await request(app)
      .post("/api/zones/bulk-status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(bulkOffRes.status).toBe(200);

    const [manualAfterBulkOff, pendingAfterBulkOff] = await Promise.all([
      prisma.package.findUnique({ where: { id: manualPkg.id } }),
      prisma.package.findUnique({ where: { id: pendingBulkPkg.id } }),
    ]);
    expect(manualAfterBulkOff?.driverId).toBe(driverAId);
    expect(pendingAfterBulkOff?.status).toBe("pending");
    expect(pendingAfterBulkOff?.driverId).toBeNull();
  });

  it("enforces explicit onDelete policies (SetNull on User/Driver/Zone, Cascade on Package/Company)", async () => {
    const tempCompany = await prisma.company.create({
      data: { name: "OnDelete Co", slug: `ondelete-${suffix}` },
    });
    const tempUser = await prisma.user.create({
      data: {
        username: `ondel_user_${suffix}`,
        password: "hashedpassword",
        role: "dispatcher",
        companyId: tempCompany.id,
      },
    });
    const tempDriver = await prisma.driver.create({
      data: { name: "OnDelete Driver", companyId: tempCompany.id },
    });
    const tempZone = await prisma.zone.create({
      data: {
        name: "OnDelete Zone",
        companyId: tempCompany.id,
        driverId: tempDriver.id,
        isActive: true,
      },
    });
    const tempPkg = await prisma.package.create({
      data: {
        trackingCode: `ONDEL-${suffix}`,
        recipientName: "OnDelete Recip",
        recipientAddress: "Calle 123",
        recipientPhone: "123456",
        status: "delivered",
        companyId: tempCompany.id,
        zoneId: tempZone.id,
        driverId: tempDriver.id,
        history: {
          create: {
            status: "delivered",
            userId: tempUser.id,
            notes: "Delivered before user deletion",
          },
        },
      },
    });

    // Deleting User sets PackageHistory.userId to null without destroying audit log
    await prisma.user.delete({ where: { id: tempUser.id } });
    const historyAfterUserDelete = await prisma.packageHistory.findMany({
      where: { packageId: tempPkg.id },
    });
    expect(historyAfterUserDelete).toHaveLength(1);
    expect(historyAfterUserDelete[0].userId).toBeNull();

    // Deleting Driver sets Package.driverId and Zone.driverId to null
    await prisma.driver.delete({ where: { id: tempDriver.id } });
    const [pkgAfterDrvDel, zoneAfterDrvDel] = await Promise.all([
      prisma.package.findUnique({ where: { id: tempPkg.id } }),
      prisma.zone.findUnique({ where: { id: tempZone.id } }),
    ]);
    expect(pkgAfterDrvDel?.driverId).toBeNull();
    expect(zoneAfterDrvDel?.driverId).toBeNull();

    // Deleting Package cascades to PackageHistory
    await prisma.package.delete({ where: { id: tempPkg.id } });
    const historyAfterPkgDelete = await prisma.packageHistory.findMany({
      where: { packageId: tempPkg.id },
    });
    expect(historyAfterPkgDelete).toHaveLength(0);

    // Deleting Company cascades cleanly
    await prisma.company.delete({ where: { id: tempCompany.id } });
    const deletedCompany = await prisma.company.findUnique({ where: { id: tempCompany.id } });
    expect(deletedCompany).toBeNull();
  });

  it("creates all required composite indexes on Package and Zone in PostgreSQL", async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('Package', 'Zone')
    `;
    const names = indexes.map((i) => i.indexname);

    expect(names).toEqual(
      expect.arrayContaining([
        "Package_companyId_isArchived_createdAt_idx",
        "Package_trackingCode_idx",
        "Package_companyId_driverId_idx",
        "Zone_companyId_driverId_idx",
        "Zone_companyId_isActive_idx",
      ])
    );
  });
});
