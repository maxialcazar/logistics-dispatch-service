import "dotenv/config";
import request from "supertest";
import bcrypt from "bcrypt";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
import { redis } from "../src/redis";
import * as websocket from "../src/websocket";

describe("Zones CRUD — GET /api/zones/:id and DELETE /api/zones/:id", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let companyId: string;
  let adminToken: string;
  let dispatcherUserId: string;
  let dispatcherToken: string;
  let driverId: string;
  let driverUsername: string;
  let driverToken: string;

  let otherCompanyId: string;
  let otherAdminToken: string;
  let otherZoneId: string;

  const samplePolygon: [number, number][] = [
    [-64.19, -31.42],
    [-64.17, -31.42],
    [-64.17, -31.4],
    [-64.19, -31.4],
    [-64.19, -31.42],
  ];

  beforeAll(async () => {
    const reg = await request(app).post("/api/auth/register-company").send({
      companyName: "Zones CRUD Co",
      companySlug: `zones-crud-${suffix}`,
      username: `zones_admin_${suffix}`,
      password: "securepassword123",
    });
    expect(reg.status).toBe(201);
    companyId = reg.body.company.id;

    const adminLogin = await request(app).post("/api/auth/login").send({
      username: reg.body.user.username,
      password: "securepassword123",
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    // Create a dispatcher user in the same tenant
    const dispatcherUsername = `zones_disp_${suffix}`;
    const hashedDispatcherPass = await bcrypt.hash("dispatcherpass123", 10);
    const dispatcherUser = await prisma.user.create({
      data: {
        username: dispatcherUsername,
        password: hashedDispatcherPass,
        role: "dispatcher",
        companyId,
      },
    });
    dispatcherUserId = dispatcherUser.id;
    const dispatcherLogin = await request(app).post("/api/auth/login").send({
      username: dispatcherUsername,
      password: "dispatcherpass123",
    });
    expect(dispatcherLogin.status).toBe(200);
    dispatcherToken = dispatcherLogin.body.token;

    // Create a driver in the same tenant
    driverUsername = `zones_drv_${suffix}`;
    const driverRes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Zona Driver",
        username: driverUsername,
        password: "driverpass123",
      });
    expect(driverRes.status).toBe(201);
    driverId = driverRes.body.id;

    const driverLogin = await request(app).post("/api/auth/login").send({
      username: driverUsername,
      password: "driverpass123",
    });
    expect(driverLogin.status).toBe(200);
    driverToken = driverLogin.body.token;

    // Create a second tenant for cross-tenant isolation checks
    const otherReg = await request(app).post("/api/auth/register-company").send({
      companyName: "Other Zones Co",
      companySlug: `zones-other-${suffix}`,
      username: `zones_other_admin_${suffix}`,
      password: "securepassword123",
    });
    expect(otherReg.status).toBe(201);
    otherCompanyId = otherReg.body.company.id;

    const otherLogin = await request(app).post("/api/auth/login").send({
      username: otherReg.body.user.username,
      password: "securepassword123",
    });
    expect(otherLogin.status).toBe(200);
    otherAdminToken = otherLogin.body.token;

    const otherZoneRes = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${otherAdminToken}`)
      .send({
        name: "Other Tenant Zone",
        description: "Belongs to tenant B",
        polygon: samplePolygon,
      });
    expect(otherZoneRes.status).toBe(201);
    otherZoneId = otherZoneRes.body.id;
  });

  afterAll(async () => {
    for (const cId of [companyId, otherCompanyId].filter(Boolean)) {
      await redis.delPrefix(`zones:${cId}:`).catch(() => {});
      await redis.delPrefix(`packages:${cId}:`).catch(() => {});
      await redis.delPrefix(`drivers:${cId}:`).catch(() => {});
      await prisma.packageHistory.deleteMany({ where: { package: { companyId: cId } } });
      await prisma.package.deleteMany({ where: { companyId: cId } });
      await prisma.zone.deleteMany({ where: { companyId: cId } });
      await prisma.user.deleteMany({ where: { companyId: cId } });
      await prisma.driver.deleteMany({ where: { companyId: cId } });
      await prisma.company.delete({ where: { id: cId } }).catch(() => {});
    }
    await closeDatabase();
    await redis.disconnect();
  });

  describe("Route ordering, RBAC, Zod validation & Swagger docs", () => {
    it("documents GET, PATCH, and DELETE /api/zones/{id} in /swagger.json", async () => {
      const res = await request(app).get("/swagger.json");
      expect(res.status).toBe(200);
      const pathSpec = res.body?.paths?.["/api/zones/{id}"];
      expect(pathSpec).toBeDefined();
      expect(pathSpec.get).toBeDefined();
      expect(pathSpec.patch).toBeDefined();
      expect(pathSpec.delete).toBeDefined();
    });

    it("keeps static routes (/api/zones and /api/zones/bulk-status) working ahead of /:id", async () => {
      const listRes = await request(app)
        .get("/api/zones")
        .set("Authorization", `Bearer ${dispatcherToken}`);
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.items)).toBe(true);

      const bulkRes = await request(app)
        .post("/api/zones/bulk-status")
        .set("Authorization", `Bearer ${dispatcherToken}`)
        .send({ isActive: false });
      expect(bulkRes.status).toBe(200);
    });

    it("rejects unauthenticated (401) and driver-role (403) requests on GET/DELETE /:id", async () => {
      const fakeUuid = "00000000-0000-4000-8000-000000000000";

      const unauthGet = await request(app).get(`/api/zones/${fakeUuid}`);
      expect(unauthGet.status).toBe(401);

      const unauthDel = await request(app).delete(`/api/zones/${fakeUuid}`);
      expect(unauthDel.status).toBe(401);

      const drvGet = await request(app)
        .get(`/api/zones/${fakeUuid}`)
        .set("Authorization", `Bearer ${driverToken}`);
      expect(drvGet.status).toBe(403);

      const drvDel = await request(app)
        .delete(`/api/zones/${fakeUuid}`)
        .set("Authorization", `Bearer ${driverToken}`);
      expect(drvDel.status).toBe(403);
    });

    it("validates UUID path params with Zod and returns 400 on invalid IDs", async () => {
      const badGet = await request(app)
        .get("/api/zones/not-a-uuid")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(badGet.status).toBe(400);
      expect(badGet.body.error).toBe("Validation failed");

      const badDel = await request(app)
        .delete("/api/zones/not-a-uuid")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(badDel.status).toBe(400);
      expect(badDel.body.error).toBe("Validation failed");
    });
  });

  describe("GET /api/zones/:id", () => {
    it("returns complete zone detail with polygon, driver (without password), and non-archived packageCounts", async () => {
      const createdRes = await request(app)
        .post("/api/zones")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Zona Centro Detalle",
          description: "Cobertura centro",
          polygon: samplePolygon,
        });
      expect(createdRes.status).toBe(201);
      const zoneId = createdRes.body.id;

      const patchRes = await request(app)
        .patch(`/api/zones/${zoneId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ driverId, isActive: true });
      expect(patchRes.status).toBe(200);

      const ts = Date.now();
      const [pkgAssigned, pkgInTransit, pkgDelivered, pkgArchived] = await Promise.all([
        prisma.package.create({
          data: {
            trackingCode: `ZN-GET-ASG-${ts}`,
            recipientName: "Assigned Recip",
            recipientAddress: "Av. Colon 10",
            recipientPhone: "3511110001",
            status: "assigned",
            zoneId,
            driverId,
            companyId,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `ZN-GET-TRN-${ts}`,
            recipientName: "Transit Recip",
            recipientAddress: "Av. Colon 20",
            recipientPhone: "3511110002",
            status: "in_transit",
            zoneId,
            driverId,
            companyId,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `ZN-GET-DLV-${ts}`,
            recipientName: "Delivered Recip",
            recipientAddress: "Av. Colon 30",
            recipientPhone: "3511110003",
            status: "delivered",
            zoneId,
            driverId,
            companyId,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `ZN-GET-ARC-${ts}`,
            recipientName: "Archived Recip",
            recipientAddress: "Av. Colon 40",
            recipientPhone: "3511110004",
            status: "delivered",
            zoneId,
            driverId,
            isArchived: true,
            companyId,
          },
        }),
      ]);

      try {
        const res = await request(app)
          .get(`/api/zones/${zoneId}`)
          .set("Authorization", `Bearer ${dispatcherToken}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(zoneId);
        expect(res.body.name).toBe("Zona Centro Detalle");
        expect(res.body.description).toBe("Cobertura centro");
        expect(res.body.isActive).toBe(true);
        expect(res.body.companyId).toBe(companyId);
        expect(res.body.polygon).toEqual(samplePolygon);

        expect(res.body.driver).toBeDefined();
        expect(res.body.driver.id).toBe(driverId);
        expect(res.body.driver.name).toBe("Zona Driver");
        expect(res.body.driver.user).toBeDefined();
        expect(res.body.driver.user.username).toBe(driverUsername);
        expect(res.body.driver.user.password).toBeUndefined();
        expect("password" in res.body.driver.user).toBe(false);

        expect(res.body.packageCounts).toEqual({
          pending: 0,
          assigned: 1,
          in_transit: 1,
          delivered: 1,
          cancelled: 0,
          total: 3,
        });
      } finally {
        await prisma.package.deleteMany({
          where: {
            id: { in: [pkgAssigned.id, pkgInTransit.id, pkgDelivered.id, pkgArchived.id] },
          },
        });
        await prisma.zone.delete({ where: { id: zoneId } }).catch(() => {});
      }
    });

    it("returns 404 when zone does not exist or belongs to another company", async () => {
      const notFoundRes = await request(app)
        .get("/api/zones/00000000-0000-4000-8000-000000000000")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(notFoundRes.status).toBe(404);

      const crossTenantRes = await request(app)
        .get(`/api/zones/${otherZoneId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(crossTenantRes.status).toBe(404);
    });
  });

  describe("DELETE /api/zones/:id", () => {
    it("returns 404 for unknown or cross-tenant zone without modifying the other tenant", async () => {
      const notFoundRes = await request(app)
        .delete("/api/zones/00000000-0000-4000-8000-000000000000")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(notFoundRes.status).toBe(404);

      const crossTenantRes = await request(app)
        .delete(`/api/zones/${otherZoneId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(crossTenantRes.status).toBe(404);

      const otherStillExists = await prisma.zone.findUnique({ where: { id: otherZoneId } });
      expect(otherStillExists).not.toBeNull();
      expect(otherStillExists?.name).toBe("Other Tenant Zone");
    });

    it("deletes zone in transaction: reverts assigned packages to pending with PackageHistory, preserves in_transit/delivered/cancelled/pending, invalidates caches, and emits Socket.IO", async () => {
      const createdRes = await request(app)
        .post("/api/zones")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Zona Norte Eliminar",
          description: "Para borrar",
          polygon: samplePolygon,
        });
      expect(createdRes.status).toBe(201);
      const zoneId = createdRes.body.id;

      await request(app)
        .patch(`/api/zones/${zoneId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ driverId, isActive: true })
        .expect(200);

      const ts = Date.now();
      const [assignedPkg1, assignedPkg2, inTransitPkg, deliveredPkg, cancelledPkg, pendingPkg] =
        await Promise.all([
          prisma.package.create({
            data: {
              trackingCode: `ZN-DEL-ASG1-${ts}`,
              recipientName: "Assigned One",
              recipientAddress: "Calle 100",
              recipientPhone: "3512220001",
              status: "assigned",
              zoneId,
              driverId,
              companyId,
            },
          }),
          prisma.package.create({
            data: {
              trackingCode: `ZN-DEL-ASG2-${ts}`,
              recipientName: "Assigned Two",
              recipientAddress: "Calle 200",
              recipientPhone: "3512220002",
              status: "assigned",
              zoneId,
              driverId: null,
              companyId,
            },
          }),
          prisma.package.create({
            data: {
              trackingCode: `ZN-DEL-TRN-${ts}`,
              recipientName: "In Transit Keep",
              recipientAddress: "Calle 300",
              recipientPhone: "3512220003",
              status: "in_transit",
              zoneId,
              driverId,
              companyId,
            },
          }),
          prisma.package.create({
            data: {
              trackingCode: `ZN-DEL-DLV-${ts}`,
              recipientName: "Delivered Keep",
              recipientAddress: "Calle 400",
              recipientPhone: "3512220004",
              status: "delivered",
              zoneId,
              driverId,
              companyId,
            },
          }),
          prisma.package.create({
            data: {
              trackingCode: `ZN-DEL-CNC-${ts}`,
              recipientName: "Cancelled Keep",
              recipientAddress: "Calle 500",
              recipientPhone: "3512220005",
              status: "cancelled",
              zoneId,
              driverId,
              companyId,
            },
          }),
          prisma.package.create({
            data: {
              trackingCode: `ZN-DEL-PND-${ts}`,
              recipientName: "Pending Keep",
              recipientAddress: "Calle 600",
              recipientPhone: "3512220006",
              status: "pending",
              zoneId,
              driverId: null,
              companyId,
            },
          }),
        ]);

      // Warm list caches to ensure deletion invalidates stale cached entries when Redis is enabled
      await request(app).get("/api/zones").set("Authorization", `Bearer ${adminToken}`).expect(200);
      await request(app).get("/api/packages").set("Authorization", `Bearer ${adminToken}`).expect(200);
      await request(app).get("/api/drivers").set("Authorization", `Bearer ${adminToken}`).expect(200);

      const delPrefixSpy = jest.spyOn(redis, "delPrefix");
      const emitSpy = jest.spyOn(websocket, "emitToRoom");

      try {
        const res = await request(app)
          .delete(`/api/zones/${zoneId}`)
          .set("Authorization", `Bearer ${dispatcherToken}`);

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.deletedZoneId).toBe(zoneId);
        expect(res.body.revertedCount).toBe(2);
        expect(res.body.revertedPackageIds).toEqual(
          expect.arrayContaining([assignedPkg1.id, assignedPkg2.id])
        );

        // Zone is removed and GET /api/zones/:id returns 404
        const deletedZone = await prisma.zone.findUnique({ where: { id: zoneId } });
        expect(deletedZone).toBeNull();
        const getAfterDelete = await request(app)
          .get(`/api/zones/${zoneId}`)
          .set("Authorization", `Bearer ${adminToken}`);
        expect(getAfterDelete.status).toBe(404);

        // Assigned driver still exists
        const driverStillExists = await prisma.driver.findUnique({ where: { id: driverId } });
        expect(driverStillExists).not.toBeNull();

        // Verify all packages' statuses, zoneId, and driverId
        const [dbAsg1, dbAsg2, dbTransit, dbDelivered, dbCancelled, dbPending] = await Promise.all([
          prisma.package.findUnique({ where: { id: assignedPkg1.id } }),
          prisma.package.findUnique({ where: { id: assignedPkg2.id } }),
          prisma.package.findUnique({ where: { id: inTransitPkg.id } }),
          prisma.package.findUnique({ where: { id: deliveredPkg.id } }),
          prisma.package.findUnique({ where: { id: cancelledPkg.id } }),
          prisma.package.findUnique({ where: { id: pendingPkg.id } }),
        ]);

        expect(dbAsg1?.status).toBe("pending");
        expect(dbAsg1?.zoneId).toBeNull();
        expect(dbAsg1?.driverId).toBeNull();

        expect(dbAsg2?.status).toBe("pending");
        expect(dbAsg2?.zoneId).toBeNull();
        expect(dbAsg2?.driverId).toBeNull();

        expect(dbTransit?.status).toBe("in_transit");
        expect(dbTransit?.zoneId).toBeNull();
        expect(dbTransit?.driverId).toBe(driverId);

        expect(dbDelivered?.status).toBe("delivered");
        expect(dbDelivered?.zoneId).toBeNull();
        expect(dbDelivered?.driverId).toBe(driverId);

        expect(dbCancelled?.status).toBe("cancelled");
        expect(dbCancelled?.zoneId).toBeNull();
        expect(dbCancelled?.driverId).toBe(driverId);

        expect(dbPending?.status).toBe("pending");
        expect(dbPending?.zoneId).toBeNull();
        expect(dbPending?.driverId).toBeNull();

        // PackageHistory created ONLY for reverted assigned packages
        const [hist1, hist2, histTransit, histDelivered, histPending] = await Promise.all([
          prisma.packageHistory.findMany({ where: { packageId: assignedPkg1.id } }),
          prisma.packageHistory.findMany({ where: { packageId: assignedPkg2.id } }),
          prisma.packageHistory.findMany({ where: { packageId: inTransitPkg.id } }),
          prisma.packageHistory.findMany({ where: { packageId: deliveredPkg.id } }),
          prisma.packageHistory.findMany({ where: { packageId: pendingPkg.id } }),
        ]);
        expect(hist1).toHaveLength(1);
        expect(hist1[0].status).toBe("pending");
        expect(hist1[0].userId).toBe(dispatcherUserId);
        expect(hist1[0].notes).toContain("Zona Norte Eliminar");

        expect(hist2).toHaveLength(1);
        expect(hist2[0].status).toBe("pending");
        expect(hist2[0].notes).toContain("deleted");

        expect(histTransit).toHaveLength(0);
        expect(histDelivered).toHaveLength(0);
        expect(histPending).toHaveLength(0);

        // Redis cache invalidations
        expect(delPrefixSpy).toHaveBeenCalledWith(`zones:${companyId}:`);
        expect(delPrefixSpy).toHaveBeenCalledWith(`packages:${companyId}:`);
        expect(delPrefixSpy).toHaveBeenCalledWith(`drivers:${companyId}:`);

        // Fresh list endpoints reflect deletion and reverted packages
        const zonesAfter = await request(app)
          .get("/api/zones")
          .set("Authorization", `Bearer ${adminToken}`);
        expect(zonesAfter.status).toBe(200);
        expect(zonesAfter.body.items.map((z: any) => z.id)).not.toContain(zoneId);

        const pkgsAfter = await request(app)
          .get(`/api/packages/${assignedPkg1.id}`)
          .set("Authorization", `Bearer ${adminToken}`);
        expect(pkgsAfter.status).toBe(200);
        expect(pkgsAfter.body.status).toBe("pending");
        expect(pkgsAfter.body.zoneId).toBeNull();
        expect(pkgsAfter.body.driverId).toBeNull();

        // Socket.IO events emitted
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "package-status-updated",
          expect.objectContaining({ packageId: assignedPkg1.id, status: "pending", zoneId: null })
        );
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "package-status-updated",
          expect.objectContaining({ packageId: assignedPkg2.id, status: "pending", zoneId: null })
        );
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "business-event",
          expect.objectContaining({ type: "SYSTEM", title: "Zona Eliminada" })
        );
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "zone-deleted",
          expect.objectContaining({
            zoneId,
            name: "Zona Norte Eliminar",
            driverId,
          })
        );
      } finally {
        delPrefixSpy.mockRestore();
        emitSpy.mockRestore();
        await prisma.packageHistory.deleteMany({
          where: { packageId: { in: [assignedPkg1.id, assignedPkg2.id] } },
        });
        await prisma.package.deleteMany({
          where: {
            id: {
              in: [
                assignedPkg1.id,
                assignedPkg2.id,
                inTransitPkg.id,
                deliveredPkg.id,
                cancelledPkg.id,
                pendingPkg.id,
              ],
            },
          },
        });
      }
    });

    it("deletes an empty zone cleanly without creating PackageHistory and emits zone-deleted", async () => {
      const emptyRes = await request(app)
        .post("/api/zones")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Zona Vacia" });
      expect(emptyRes.status).toBe(201);
      const emptyZoneId = emptyRes.body.id;

      const emitSpy = jest.spyOn(websocket, "emitToRoom");
      try {
        const delRes = await request(app)
          .delete(`/api/zones/${emptyZoneId}`)
          .set("Authorization", `Bearer ${adminToken}`);

        expect(delRes.status).toBe(200);
        expect(delRes.body).toEqual({
          ok: true,
          deletedZoneId: emptyZoneId,
          revertedPackageIds: [],
          revertedCount: 0,
        });

        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "business-event",
          expect.objectContaining({ type: "SYSTEM", title: "Zona Eliminada" })
        );
        expect(emitSpy).toHaveBeenCalledWith(
          `company-${companyId}`,
          "zone-deleted",
          expect.objectContaining({
            zoneId: emptyZoneId,
            name: "Zona Vacia",
            revertedPackageIds: [],
          })
        );
      } finally {
        emitSpy.mockRestore();
      }
    });
  });
});
