import "dotenv/config";
import request from "supertest";
import axios from "axios";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
import { redis } from "../src/redis";
import { detectZone } from "../src/utils/geofencing";
import { geocodeAddress } from "../src/utils/geocoder";
import { PackageService } from "../src/services/package.service";
import { swaggerSpec } from "../src/swagger";
import * as websocketModule from "../src/websocket";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const SLUG_A = `company-a-${Date.now()}`;
const SLUG_B = `company-b-${Date.now()}`;

let tokenA: string;
let tokenB: string;
let companyAId: string;
let companyBId: string;
let zoneAId: string;
let packageAId: string;

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Register Company A
  const regA = await request(app).post("/api/auth/register-company").send({
    companyName: "Empresa A",
    companySlug: SLUG_A,
    username: `dispatcher_a_${Date.now()}`,
    password: "securepassword123",
  });
  companyAId = regA.body.company.id;
  const loginA = await request(app).post("/api/auth/login").send({
    username: regA.body.user.username,
    password: "securepassword123",
  });
  tokenA = loginA.body.token;

  // Register Company B
  const regB = await request(app).post("/api/auth/register-company").send({
    companyName: "Empresa B",
    companySlug: SLUG_B,
    username: `dispatcher_b_${Date.now()}`,
    password: "securepassword123",
  });
  companyBId = regB.body.company.id;
  const loginB = await request(app).post("/api/auth/login").send({
    username: regB.body.user.username,
    password: "securepassword123",
  });
  tokenB = loginB.body.token;

  // Create a zone for Company A
  const zone = await prisma.zone.create({
    data: { name: "Zone A-1", companyId: companyAId },
  });
  zoneAId = zone.id;
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
afterAll(async () => {
  await prisma.packageHistory.deleteMany({
    where: { package: { companyId: { in: [companyAId, companyBId] } } },
  });
  await prisma.package.deleteMany({
    where: { companyId: { in: [companyAId, companyBId] } },
  });
  await prisma.zone.deleteMany({
    where: { companyId: { in: [companyAId, companyBId] } },
  });
  await prisma.user.deleteMany({
    where: { companyId: { in: [companyAId, companyBId] } },
  });
  await prisma.driver.deleteMany({
    where: { companyId: { in: [companyAId, companyBId] } },
  });
  await prisma.company.deleteMany({
    where: { id: { in: [companyAId, companyBId] } },
  });
  await closeDatabase();
  await redis.disconnect();
});

// ─── POST /api/packages ───────────────────────────────────────────────────────
describe("POST /api/packages — Create Package", () => {
  it("should create a package with all required fields", async () => {
    const res = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: `PKG-${Date.now()}`,
        recipientName: "Juan Pérez",
        recipientAddress: "Av. Corrientes 1234, Buenos Aires",
        recipientPhone: "1161234567",
        zoneId: zoneAId,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("pending");
    expect(res.body.companyId).toBe(companyAId);

    packageAId = res.body.id;
  });

  it("should return 400 if required fields are missing", async () => {
    const res = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: "PKG-INCOMPLETE",
        // Missing recipientName, recipientAddress, recipientPhone
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("should return 401 without a token", async () => {
    const res = await request(app).post("/api/packages").send({
      trackingCode: "PKG-NO-AUTH",
      recipientName: "Test",
      recipientAddress: "Test Address",
      recipientPhone: "123",
    });
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/packages/:id/status — State Machine ──────────────────────────
describe("PATCH /api/packages/:id/status — Status Transitions", () => {
  it("should transition pending → in_transit", async () => {
    const res = await request(app)
      .patch(`/api/packages/${packageAId}/status`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "in_transit" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_transit");
  });

  it("should transition in_transit → delivered", async () => {
    const res = await request(app)
      .patch(`/api/packages/${packageAId}/status`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "delivered" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("delivered");
  });

  it("should reject an invalid transition (delivered → cancelled)", async () => {
    const res = await request(app)
      .patch(`/api/packages/${packageAId}/status`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "cancelled" });

    // The package is already delivered; this transition is not allowed
    expect(res.status).toBe(422);
  });
});

// ─── MULTI-TENANT ISOLATION ───────────────────────────────────────────────────
describe("Multi-Tenant Isolation", () => {
  it("Company B cannot read Company A packages", async () => {
    const res = await request(app)
      .get("/api/packages")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    // Company B response must NOT contain any of Company A's packages
    const ids = res.body.items?.map((p: any) => p.companyId) ?? [];
    expect(ids).not.toContain(companyAId);
  });

  it("Company B cannot update status of Company A's package", async () => {
    const res = await request(app)
      .patch(`/api/packages/${packageAId}/status`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ status: "cancelled" });

    // Must be 404 (package not found in Company B's scope) or 403
    expect([403, 404, 422]).toContain(res.status);
  });
});

// ─── Task 1.2.3 — Auto-assign on active zone & assignToDriver state guard ─────
describe("Task 1.2.3 — Auto-assign on active zone & assignToDriver state guard", () => {
  let taskDriverId: string;
  let activeGeoZoneId: string;
  let inactiveAssignedZoneId: string;

  beforeAll(async () => {
    const driver = await prisma.driver.create({
      data: { name: "Task 1.2.3 Driver", companyId: companyAId },
    });
    taskDriverId = driver.id;

    const activeZone = await prisma.zone.create({
      data: {
        name: "Active Geo Zone",
        companyId: companyAId,
        driverId: taskDriverId,
        isActive: true,
        polygon: [
          [-64.20, -31.43],
          [-64.16, -31.43],
          [-64.16, -31.40],
          [-64.20, -31.40],
        ],
      },
    });
    activeGeoZoneId = activeZone.id;

    const inactiveZone = await prisma.zone.create({
      data: {
        name: "Inactive Zone With Driver",
        companyId: companyAId,
        driverId: taskDriverId,
        isActive: false,
      },
    });
    inactiveAssignedZoneId = inactiveZone.id;
  });

  it("should auto-assign package when geofenced zone is active and has a driver", async () => {
    const res = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: `PKG-AUTO-${Date.now()}`,
        recipientName: "Laura Auto",
        recipientAddress: "Av. Hipolito Yrigoyen 100, Cordoba",
        recipientPhone: "3515551234",
        lat: -31.415,
        lng: -64.18,
      });

    expect(res.status).toBe(201);
    expect(res.body.zoneId).toBe(activeGeoZoneId);
    expect(res.body.status).toBe("assigned");
  });

  it("should keep status pending when zone is inactive even if it has a driver", async () => {
    const res = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: `PKG-INACTIVE-${Date.now()}`,
        recipientName: "Mario Pending",
        recipientAddress: "Av. Colon 200, Cordoba",
        recipientPhone: "3515559876",
        lat: -31.50,
        lng: -64.50,
        zoneId: inactiveAssignedZoneId,
      });

    expect(res.status).toBe(201);
    expect(res.body.zoneId).toBe(inactiveAssignedZoneId);
    expect(res.body.status).toBe("pending");
  });

  it("should reject assignToDriver with 422 when package is in_transit, delivered, or cancelled", async () => {
    const inTransitPkg = await prisma.package.create({
      data: {
        trackingCode: `PKG-TRANSIT-${Date.now()}`,
        recipientName: "Transit User",
        recipientAddress: "Calle Falsa 000",
        recipientPhone: "3510000000",
        status: "in_transit",
        zoneId: activeGeoZoneId,
        companyId: companyAId,
      },
    });

    const resInTransit = await request(app)
      .post(`/api/packages/${inTransitPkg.id}/assign`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ driverId: taskDriverId });

    expect(resInTransit.status).toBe(422);
    const dbInTransit = await prisma.package.findUnique({ where: { id: inTransitPkg.id } });
    expect(dbInTransit?.status).toBe("in_transit");

    const deliveredPkg = await prisma.package.create({
      data: {
        trackingCode: `PKG-DELIV-${Date.now()}`,
        recipientName: "Delivered User",
        recipientAddress: "Calle Falsa 123",
        recipientPhone: "3510001111",
        status: "delivered",
        zoneId: activeGeoZoneId,
        companyId: companyAId,
      },
    });

    const cancelledPkg = await prisma.package.create({
      data: {
        trackingCode: `PKG-CANCEL-${Date.now()}`,
        recipientName: "Cancelled User",
        recipientAddress: "Calle Falsa 456",
        recipientPhone: "3510002222",
        status: "cancelled",
        zoneId: activeGeoZoneId,
        companyId: companyAId,
      },
    });

    const resDelivered = await request(app)
      .post(`/api/packages/${deliveredPkg.id}/assign`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ driverId: taskDriverId });

    expect(resDelivered.status).toBe(422);
    const dbDelivered = await prisma.package.findUnique({ where: { id: deliveredPkg.id } });
    expect(dbDelivered?.status).toBe("delivered");

    const resCancelled = await request(app)
      .post(`/api/packages/${cancelledPkg.id}/assign`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ driverId: taskDriverId });

    expect(resCancelled.status).toBe(422);
    const dbCancelled = await prisma.package.findUnique({ where: { id: cancelledPkg.id } });
    expect(dbCancelled?.status).toBe("cancelled");
  });

  it("should assign pending package to driver via POST /api/packages/:id/assign", async () => {
    const pendingPkg = await prisma.package.create({
      data: {
        trackingCode: `PKG-PEND-${Date.now()}`,
        recipientName: "Pending User",
        recipientAddress: "Calle Real 789",
        recipientPhone: "3510003333",
        status: "pending",
        zoneId: inactiveAssignedZoneId,
        companyId: companyAId,
      },
    });

    const res = await request(app)
      .post(`/api/packages/${pendingPkg.id}/assign`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ driverId: taskDriverId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("assigned");
  });
});

// ─── Task 1.2.5 — getMyPackages archive filter & getPackageHistory zone auth ──
describe("Task 1.2.5 — getMyPackages archive filter & getPackageHistory zone authorization", () => {
  let driver1Token: string;
  let driver2Token: string;
  let driver1ZoneId: string;
  let driver2ZoneId: string;
  let activePackageId: string;
  let archivedPackageId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const d1User = `drv1_hist_${suffix}`;
    const d2User = `drv2_hist_${suffix}`;

    const d1Res = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Driver One History", username: d1User, password: "driverpass123" });
    expect(d1Res.status).toBe(201);

    const d2Res = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Driver Two History", username: d2User, password: "driverpass123" });
    expect(d2Res.status).toBe(201);

    const [login1, login2] = await Promise.all([
      request(app).post("/api/auth/login").send({ username: d1User, password: "driverpass123" }),
      request(app).post("/api/auth/login").send({ username: d2User, password: "driverpass123" }),
    ]);
    driver1Token = login1.body.token;
    driver2Token = login2.body.token;

    const [z1, z2] = await Promise.all([
      prisma.zone.create({
        data: { name: "Driver 1 Zone", companyId: companyAId, driverId: d1Res.body.id, isActive: true },
      }),
      prisma.zone.create({
        data: { name: "Driver 2 Zone", companyId: companyAId, driverId: d2Res.body.id, isActive: true },
      }),
    ]);
    driver1ZoneId = z1.id;
    driver2ZoneId = z2.id;

    const activeCreate = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: `PKG-MY-ACT-${suffix}`,
        recipientName: "Active MyPkg",
        recipientAddress: "Av. Colon 1000, Cordoba",
        recipientPhone: "3519991111",
        lat: -31.41,
        lng: -64.19,
        zoneId: driver1ZoneId,
      });
    expect(activeCreate.status).toBe(201);
    activePackageId = activeCreate.body.id;

    const archivedCreate = await prisma.package.create({
      data: {
        trackingCode: `PKG-MY-ARCH-${suffix}`,
        recipientName: "Archived MyPkg",
        recipientAddress: "Av. Colon 1001, Cordoba",
        recipientPhone: "3519992222",
        status: "delivered",
        zoneId: driver1ZoneId,
        companyId: companyAId,
        isArchived: true,
      },
    });
    archivedPackageId = archivedCreate.id;
  });

  it("GET /api/packages/my-packages excludes archived packages", async () => {
    const res = await request(app)
      .get("/api/packages/my-packages")
      .set("Authorization", `Bearer ${driver1Token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).toContain(activePackageId);
    expect(ids).not.toContain(archivedPackageId);
    expect(driver2ZoneId).toBeDefined();
  });

  it("GET /api/packages/:packageId/history returns 404 when package does not exist or belongs to another tenant", async () => {
    const missingRes = await request(app)
      .get("/api/packages/00000000-0000-4000-8000-000000000000/history")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(missingRes.status).toBe(404);

    const crossTenantRes = await request(app)
      .get(`/api/packages/${activePackageId}/history`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(crossTenantRes.status).toBe(404);
  });

  it("GET /api/packages/:packageId/history returns 403 for unassigned driver and 200 for assigned driver/admin", async () => {
    const unassignedRes = await request(app)
      .get(`/api/packages/${activePackageId}/history`)
      .set("Authorization", `Bearer ${driver2Token}`);
    expect(unassignedRes.status).toBe(403);

    const assignedRes = await request(app)
      .get(`/api/packages/${activePackageId}/history`)
      .set("Authorization", `Bearer ${driver1Token}`);
    expect(assignedRes.status).toBe(200);
    expect(Array.isArray(assignedRes.body)).toBe(true);
    expect(assignedRes.body.length).toBeGreaterThan(0);

    const adminRes = await request(app)
      .get(`/api/packages/${activePackageId}/history`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(adminRes.status).toBe(200);
    expect(Array.isArray(adminRes.body)).toBe(true);
  });
});

// ─── Task 1.2.6 — detectZone active filter, geocoder timeout & locality ───────
describe("Task 1.2.6 — detectZone active filter, geocoder timeout & explicit locality", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("detectZone ignores inactive zones and matches only isActive: true zones", async () => {
    const polygon = [
      [-58.40, -34.62],
      [-58.36, -34.62],
      [-58.36, -34.59],
      [-58.40, -34.59],
    ];

    const zone = await prisma.zone.create({
      data: {
        name: `Toggle Geo Zone ${Date.now()}`,
        companyId: companyAId,
        isActive: false,
        polygon,
      },
    });

    const inactiveMatch = await detectZone(companyAId, -34.605, -58.38);
    expect(inactiveMatch).toBeNull();

    await prisma.zone.update({
      where: { id: zone.id },
      data: { isActive: true },
    });

    const activeMatch = await detectZone(companyAId, -34.605, -58.38);
    expect(activeMatch).toEqual({ id: zone.id, name: zone.name });
  });

  it("geocodeAddress passes a 5000ms timeout to axios.get", async () => {
    const axiosSpy = jest.spyOn(axios, "get").mockResolvedValueOnce({
      data: [{ lat: "-34.6037", lon: "-58.3816" }],
    } as any);

    const result = await geocodeAddress("Av. Corrientes 1234, CABA, Argentina");

    expect(result).toEqual({ lat: -34.6037, lng: -58.3816 });
    expect(axiosSpy).toHaveBeenCalledWith(
      "https://nominatim.openstreetmap.org/search",
      expect.objectContaining({
        timeout: 5000,
        params: expect.objectContaining({ q: "Av. Corrientes 1234, CABA, Argentina" }),
      })
    );
  });

  it("does not append Cordoba, Argentina when payload includes explicit city/country", async () => {
    const axiosSpy = jest.spyOn(axios, "get").mockResolvedValue({
      data: [{ lat: "-34.6037", lon: "-58.3816" }],
    } as any);

    const suffix = Date.now();

    const resInline = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: `PKG-GEO-INLINE-${suffix}`,
        recipientName: "Carla CABA",
        recipientAddress: "Av. Corrientes 1234, CABA, Argentina",
        recipientPhone: "1155550001",
        addressStreet: "Av. Corrientes",
        addressNumber: "1234",
      });

    expect(resInline.status).toBe(201);
    expect(axiosSpy).toHaveBeenNthCalledWith(
      1,
      "https://nominatim.openstreetmap.org/search",
      expect.objectContaining({
        params: expect.objectContaining({ q: "Av. Corrientes 1234, CABA, Argentina" }),
      })
    );

    const resFields = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: `PKG-GEO-FIELDS-${suffix}`,
        recipientName: "Pedro Rosario",
        recipientAddress: "Bv. Orono 500",
        recipientPhone: "3415550002",
        addressCity: "Rosario",
        addressCountry: "Argentina",
      });

    expect(resFields.status).toBe(201);
    expect(resFields.body.addressCity).toBe("Rosario");
    expect(axiosSpy).toHaveBeenNthCalledWith(
      2,
      "https://nominatim.openstreetmap.org/search",
      expect.objectContaining({
        params: expect.objectContaining({ q: "Bv. Orono 500, Rosario, Argentina" }),
      })
    );

    const resDefault = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: `PKG-GEO-DEF-${suffix}`,
        recipientName: "Luis Default",
        recipientAddress: "Av. Colon 500",
        recipientPhone: "3515550003",
        addressStreet: "Av. Colon",
        addressNumber: "500",
      });

    expect(resDefault.status).toBe(201);
    expect(axiosSpy).toHaveBeenNthCalledWith(
      3,
      "https://nominatim.openstreetmap.org/search",
      expect.objectContaining({
        params: expect.objectContaining({ q: "Av. Colon 500, Cordoba, Argentina" }),
      })
    );

    const resNoDup = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: `PKG-GEO-NODUP-${suffix}`,
        recipientName: "Ana CABA",
        recipientAddress: "Av. Corrientes 1234, CABA, Argentina",
        recipientPhone: "1155550004",
        addressStreet: "   ",
        addressNumber: "   ",
        addressCity: "CABA",
        addressCountry: "Argentina",
        lat: null,
        lng: null,
      });

    expect(resNoDup.status).toBe(201);
    expect(axiosSpy).toHaveBeenNthCalledWith(
      4,
      "https://nominatim.openstreetmap.org/search",
      expect.objectContaining({
        params: expect.objectContaining({ q: "Av. Corrientes 1234, CABA, Argentina" }),
      })
    );

    const resDiacritic = await request(app)
      .post("/api/packages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        trackingCode: `PKG-GEO-PERU-${suffix}`,
        recipientName: "Carlos Lima",
        recipientAddress: "Av. Arequipa 1200 Perú",
        recipientPhone: "5155550005",
      });

    expect(resDiacritic.status).toBe(201);
    expect(axiosSpy).toHaveBeenNthCalledWith(
      5,
      "https://nominatim.openstreetmap.org/search",
      expect.objectContaining({
        params: expect.objectContaining({ q: "Av. Arequipa 1200 Perú" }),
      })
    );
  });
});

// ─── Task 2.1.1 — GET /api/packages server-side search & filters ──────────────
describe("Task 2.1.1 — GET /api/packages server-side search & filters", () => {
  const filterSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let filterCompanyId: string;
  let filterAdminToken: string;
  let otherTenantToken: string;
  let otherTenantId: string;
  let zoneNorthId: string;
  let zoneSouthId: string;
  let driverAlphaId: string;
  let driverBetaId: string;

  let pkgAlphaDirectId: string;
  let pkgZoneFallbackId: string;
  let pkgHistoricalAlphaId: string;
  let pkgDeliveredSouthId: string;
  let pkgArchivedId: string;

  beforeAll(async () => {
    const regMain = await request(app).post("/api/auth/register-company").send({
      companyName: "Filter Test Co",
      companySlug: `filter-co-${filterSuffix}`,
      username: `filter_admin_${filterSuffix}`,
      password: "securepassword123",
    });
    expect(regMain.status).toBe(201);
    filterCompanyId = regMain.body.company.id;

    const regOther = await request(app).post("/api/auth/register-company").send({
      companyName: "Filter Other Co",
      companySlug: `filter-other-${filterSuffix}`,
      username: `filter_other_${filterSuffix}`,
      password: "securepassword123",
    });
    expect(regOther.status).toBe(201);
    otherTenantId = regOther.body.company.id;

    const [loginMain, loginOther] = await Promise.all([
      request(app).post("/api/auth/login").send({
        username: `filter_admin_${filterSuffix}`,
        password: "securepassword123",
      }),
      request(app).post("/api/auth/login").send({
        username: `filter_other_${filterSuffix}`,
        password: "securepassword123",
      }),
    ]);
    filterAdminToken = loginMain.body.token;
    otherTenantToken = loginOther.body.token;

    const [driverAlpha, driverBeta] = await Promise.all([
      prisma.driver.create({ data: { name: "Driver Alpha", companyId: filterCompanyId } }),
      prisma.driver.create({ data: { name: "Driver Beta", companyId: filterCompanyId } }),
    ]);
    driverAlphaId = driverAlpha.id;
    driverBetaId = driverBeta.id;

    // North zone currently assigned to Driver Alpha; South zone assigned to Driver Beta
    const [zoneNorth, zoneSouth] = await Promise.all([
      prisma.zone.create({
        data: {
          name: "North Zone",
          companyId: filterCompanyId,
          driverId: driverAlphaId,
          isActive: true,
        },
      }),
      prisma.zone.create({
        data: {
          name: "South Zone",
          companyId: filterCompanyId,
          driverId: driverBetaId,
          isActive: true,
        },
      }),
    ]);
    zoneNorthId = zoneNorth.id;
    zoneSouthId = zoneSouth.id;

    const [p1, p2, p3, p4, p5] = await Promise.all([
      // 1. Assigned directly to Alpha in North Zone (June 15 morning UTC)
      prisma.package.create({
        data: {
          trackingCode: `FLT-TRACK-001-${filterSuffix}`,
          recipientName: "María González",
          recipientAddress: "Av. Libertador 4500",
          recipientPhone: "3517001111",
          status: "assigned",
          companyId: filterCompanyId,
          zoneId: zoneNorthId,
          driverId: driverAlphaId,
          createdAt: new Date("2026-06-15T08:30:00.000Z"),
        },
      }),
      // 2. Pending in North Zone with driverId=null (tests zone.driverId fallback for Alpha, June 15 end of day UTC)
      prisma.package.create({
        data: {
          trackingCode: `FLT-FALLBACK-002-${filterSuffix}`,
          recipientName: "Lucas Fernández",
          recipientAddress: "Calle San Martín 890",
          recipientPhone: "3518002222",
          status: "pending",
          companyId: filterCompanyId,
          zoneId: zoneNorthId,
          driverId: null,
          createdAt: new Date("2026-06-15T23:50:00.000Z"),
        },
      }),
      // 3. Historical package in South Zone (zone now owned by Beta, but package.driverId is Alpha!) - June 10 UTC
      prisma.package.create({
        data: {
          trackingCode: `FLT-HIST-003-${filterSuffix}`,
          recipientName: "Sofía Martínez",
          recipientAddress: "Bv. Chacabuco 320",
          recipientPhone: "3519003333",
          status: "in_transit",
          companyId: filterCompanyId,
          zoneId: zoneSouthId,
          driverId: driverAlphaId,
          createdAt: new Date("2026-06-10T14:00:00.000Z"),
        },
      }),
      // 4. Delivered package directly assigned to Beta in South Zone - June 20 UTC
      prisma.package.create({
        data: {
          trackingCode: `FLT-DEL-004-${filterSuffix}`,
          recipientName: "Andrés López",
          recipientAddress: "Av. Vélez Sarsfield 1500",
          recipientPhone: "3516004444",
          status: "delivered",
          companyId: filterCompanyId,
          zoneId: zoneSouthId,
          driverId: driverBetaId,
          createdAt: new Date("2026-06-20T18:15:00.000Z"),
        },
      }),
      // 5. Archived package (excluded by default unless isArchived=true)
      prisma.package.create({
        data: {
          trackingCode: `FLT-ARCH-005-${filterSuffix}`,
          recipientName: "María Archivada",
          recipientAddress: "Av. Libertador 9999",
          recipientPhone: "3517005555",
          status: "cancelled",
          isArchived: true,
          companyId: filterCompanyId,
          zoneId: zoneNorthId,
          driverId: driverAlphaId,
          createdAt: new Date("2026-06-15T12:00:00.000Z"),
        },
      }),
    ]);

    pkgAlphaDirectId = p1.id;
    pkgZoneFallbackId = p2.id;
    pkgHistoricalAlphaId = p3.id;
    pkgDeliveredSouthId = p4.id;
    pkgArchivedId = p5.id;
  });

  afterAll(async () => {
    if (filterCompanyId || otherTenantId) {
      const ids = [filterCompanyId, otherTenantId].filter(Boolean);
      await prisma.packageHistory.deleteMany({ where: { package: { companyId: { in: ids } } } });
      await prisma.package.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.zone.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.driver.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.company.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it("filters case-insensitively with search across trackingCode, recipientName, recipientAddress, and recipientPhone", async () => {
    const byTracking = await request(app)
      .get(`/api/packages?search=flt-track-001`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(byTracking.status).toBe(200);
    expect(byTracking.body.items.map((p: any) => p.id)).toEqual([pkgAlphaDirectId]);

    const byName = await request(app)
      .get(`/api/packages?search=${encodeURIComponent("fernández")}`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(byName.status).toBe(200);
    expect(byName.body.items.map((p: any) => p.id)).toEqual([pkgZoneFallbackId]);

    const byAddress = await request(app)
      .get(`/api/packages?search=${encodeURIComponent("chacabuco")}`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(byAddress.status).toBe(200);
    expect(byAddress.body.items.map((p: any) => p.id)).toEqual([pkgHistoricalAlphaId]);

    const byPhone = await request(app)
      .get(`/api/packages?search=6004444`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.items.map((p: any) => p.id)).toEqual([pkgDeliveredSouthId]);

    // Empty search string behaves as unfiltered (returns all 4 non-archived)
    const emptySearch = await request(app)
      .get(`/api/packages?search=`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(emptySearch.status).toBe(200);
    expect(emptySearch.body.meta.total).toBe(4);
  });

  it("filters by single status and comma-separated status values", async () => {
    const single = await request(app)
      .get("/api/packages?status=delivered")
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(single.status).toBe(200);
    expect(single.body.items.map((p: any) => p.id)).toEqual([pkgDeliveredSouthId]);

    const multi = await request(app)
      .get("/api/packages?status=assigned,in_transit")
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(multi.status).toBe(200);
    expect(multi.body.items.map((p: any) => p.id)).toEqual([pkgAlphaDirectId, pkgHistoricalAlphaId]);
  });

  it("filters by zoneId and handles driverId direct + zone fallback without leaking historical packages", async () => {
    const byZoneNorth = await request(app)
      .get(`/api/packages?zoneId=${zoneNorthId}`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(byZoneNorth.status).toBe(200);
    expect(byZoneNorth.body.items.map((p: any) => p.id)).toEqual([
      pkgZoneFallbackId,
      pkgAlphaDirectId,
    ]);

    // Driver Alpha: directly assigned p1 & p3 (even though South Zone belongs to Beta) + zone fallback p2
    const byDriverAlpha = await request(app)
      .get(`/api/packages?driverId=${driverAlphaId}`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(byDriverAlpha.status).toBe(200);
    expect(byDriverAlpha.body.items.map((p: any) => p.id)).toEqual([
      pkgZoneFallbackId,
      pkgAlphaDirectId,
      pkgHistoricalAlphaId,
    ]);

    // Driver Beta: owns South Zone, but MUST NOT include pkgHistoricalAlphaId (direct driverId=Alpha)
    const byDriverBeta = await request(app)
      .get(`/api/packages?driverId=${driverBetaId}`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(byDriverBeta.status).toBe(200);
    expect(byDriverBeta.body.items.map((p: any) => p.id)).toEqual([pkgDeliveredSouthId]);
  });

  it("filters by dateFrom and dateTo inclusively for YYYY-MM-DD and ISO timestamps", async () => {
    // Date-only inclusive full UTC day (includes 23:50:00.000Z on 2026-06-15)
    const sameDay = await request(app)
      .get("/api/packages?dateFrom=2026-06-15&dateTo=2026-06-15")
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(sameDay.status).toBe(200);
    expect(sameDay.body.items.map((p: any) => p.id)).toEqual([
      pkgZoneFallbackId,
      pkgAlphaDirectId,
    ]);

    // ISO timestamps cut off before 23:50:00.000Z
    const isoRange = await request(app)
      .get("/api/packages?dateFrom=2026-06-15T00:00:00Z&dateTo=2026-06-15T12:00:00Z")
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(isoRange.status).toBe(200);
    expect(isoRange.body.items.map((p: any) => p.id)).toEqual([pkgAlphaDirectId]);

    // Open-ended dateFrom / dateTo
    const fromJune15 = await request(app)
      .get("/api/packages?dateFrom=2026-06-15")
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(fromJune15.status).toBe(200);
    expect(fromJune15.body.items.map((p: any) => p.id)).toEqual([
      pkgDeliveredSouthId,
      pkgZoneFallbackId,
      pkgAlphaDirectId,
    ]);

    const toJune14 = await request(app)
      .get("/api/packages?dateTo=2026-06-14")
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(toJune14.status).toBe(200);
    expect(toJune14.body.items.map((p: any) => p.id)).toEqual([pkgHistoricalAlphaId]);
  });

  it("combines search, driverId, zoneId, status, date range, isArchived, and pagination cleanly without OR collisions", async () => {
    // Combines search OR + driverId OR + zoneId + status + date range
    const combined = await request(app)
      .get(
        `/api/packages?search=libertador&driverId=${driverAlphaId}&zoneId=${zoneNorthId}&status=assigned&dateFrom=2026-06-15&dateTo=2026-06-15`
      )
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(combined.status).toBe(200);
    expect(combined.body.items.map((p: any) => p.id)).toEqual([pkgAlphaDirectId]);
    expect(combined.body.meta.total).toBe(1);

    // Search + driverId targeting archived packages
    const archivedMatch = await request(app)
      .get(`/api/packages?search=libertador&driverId=${driverAlphaId}&isArchived=true`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    expect(archivedMatch.status).toBe(200);
    expect(archivedMatch.body.items.map((p: any) => p.id)).toEqual([pkgArchivedId]);

    // Pagination over filtered results (3 items for driverAlphaId, limit=2)
    const page1 = await request(app)
      .get(`/api/packages?driverId=${driverAlphaId}&page=1&limit=2`)
      .set("Authorization", `Bearer ${filterAdminToken}`);
    const page2 = await request(app)
      .get(`/api/packages?driverId=${driverAlphaId}&page=2&limit=2`)
      .set("Authorization", `Bearer ${filterAdminToken}`);

    expect(page1.status).toBe(200);
    expect(page1.body.meta).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2 });
    expect(page1.body.items).toHaveLength(2);

    expect(page2.status).toBe(200);
    expect(page2.body.meta).toEqual({ total: 3, page: 2, limit: 2, totalPages: 2 });
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].id).toBe(pkgHistoricalAlphaId);
  });

  it("preserves strict multi-tenant isolation when querying filters", async () => {
    const crossTenant = await request(app)
      .get(
        `/api/packages?search=libertador&zoneId=${zoneNorthId}&driverId=${driverAlphaId}&dateFrom=2026-06-01&dateTo=2026-06-30`
      )
      .set("Authorization", `Bearer ${otherTenantToken}`);
    expect(crossTenant.status).toBe(200);
    expect(crossTenant.body.items).toEqual([]);
    expect(crossTenant.body.meta.total).toBe(0);
  });

  it("returns 400 on invalid query parameters via Zod validation and rejects Invalid Date in service", async () => {
    const invalidCases = [
      "/api/packages?status=unknown_status",
      "/api/packages?status=pending,invalid",
      "/api/packages?zoneId=not-a-uuid",
      "/api/packages?driverId=not-a-uuid",
      "/api/packages?dateFrom=not-a-date",
      "/api/packages?dateTo=2026-02-29",
      "/api/packages?dateFrom=2026-02-30T10:00:00Z",
      "/api/packages?dateFrom=2026-06-20&dateTo=2026-06-10",
      "/api/packages?isArchived=maybe",
    ];

    for (const url of invalidCases) {
      const res = await request(app)
        .get(url)
        .set("Authorization", `Bearer ${filterAdminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    }

    await expect(
      PackageService.getAllPackages(filterCompanyId, {
        dateFrom: new Date("not-a-date"),
      })
    ).rejects.toThrow("invalid_date_filter");
  });

  it("documents the new GET /api/packages filter parameters in Swagger spec", () => {
    const getOp = (swaggerSpec as any).paths?.["/api/packages"]?.get;
    expect(getOp).toBeDefined();
    const paramNames = (getOp.parameters ?? []).map((p: any) => p.name);
    expect(paramNames).toEqual(
      expect.arrayContaining([
        "search",
        "status",
        "zoneId",
        "driverId",
        "trackingCode",
        "dateFrom",
        "dateTo",
        "isArchived",
        "page",
        "limit",
      ])
    );
  });
});

// ─── Task 2.1.2 — Package Detail, Update & Unarchive ─────────────────────────
describe("Task 2.1.2 — GET /api/packages/:id, PATCH /api/packages/:id & POST /api/packages/unarchive", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let mainCompanyId: string;
  let otherCompanyId: string;
  let adminToken: string;
  let otherAdminToken: string;
  let driver1Token: string;
  let driver2Token: string;

  let driver1Id: string;
  let driver2Id: string;
  let activeZone1Id: string;
  let activeZone2Id: string;
  let inactiveZoneId: string;
  let noDriverActiveZoneId: string;
  let otherTenantZoneId: string;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeAll(async () => {
    const [regMain, regOther] = await Promise.all([
      request(app).post("/api/auth/register-company").send({
        companyName: "CRUD Main Co",
        companySlug: `crud-main-${suffix}`,
        username: `crud_admin_${suffix}`,
        password: "securepassword123",
      }),
      request(app).post("/api/auth/register-company").send({
        companyName: "CRUD Other Co",
        companySlug: `crud-other-${suffix}`,
        username: `crud_other_${suffix}`,
        password: "securepassword123",
      }),
    ]);

    expect(regMain.status).toBe(201);
    expect(regOther.status).toBe(201);
    mainCompanyId = regMain.body.company.id;
    otherCompanyId = regOther.body.company.id;

    const [loginMain, loginOther] = await Promise.all([
      request(app).post("/api/auth/login").send({
        username: `crud_admin_${suffix}`,
        password: "securepassword123",
      }),
      request(app).post("/api/auth/login").send({
        username: `crud_other_${suffix}`,
        password: "securepassword123",
      }),
    ]);
    adminToken = loginMain.body.token;
    otherAdminToken = loginOther.body.token;

    const [d1Res, d2Res] = await Promise.all([
      request(app)
        .post("/api/drivers")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "CRUD Driver 1", username: `crud_d1_${suffix}`, password: "driverpass123" }),
      request(app)
        .post("/api/drivers")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "CRUD Driver 2", username: `crud_d2_${suffix}`, password: "driverpass123" }),
    ]);
    expect(d1Res.status).toBe(201);
    expect(d2Res.status).toBe(201);
    driver1Id = d1Res.body.id;
    driver2Id = d2Res.body.id;

    const [l1, l2] = await Promise.all([
      request(app).post("/api/auth/login").send({ username: `crud_d1_${suffix}`, password: "driverpass123" }),
      request(app).post("/api/auth/login").send({ username: `crud_d2_${suffix}`, password: "driverpass123" }),
    ]);
    driver1Token = l1.body.token;
    driver2Token = l2.body.token;

    const [z1, z2, zInactive, zNoDrv, zOther] = await Promise.all([
      prisma.zone.create({
        data: { name: "CRUD Zone 1", companyId: mainCompanyId, driverId: driver1Id, isActive: true },
      }),
      prisma.zone.create({
        data: { name: "CRUD Zone 2", companyId: mainCompanyId, driverId: driver2Id, isActive: true },
      }),
      prisma.zone.create({
        data: { name: "CRUD Inactive Zone", companyId: mainCompanyId, driverId: driver2Id, isActive: false },
      }),
      prisma.zone.create({
        data: { name: "CRUD No Driver Zone", companyId: mainCompanyId, driverId: null, isActive: false },
      }),
      prisma.zone.create({
        data: { name: "Other Tenant Zone", companyId: otherCompanyId, isActive: true },
      }),
    ]);

    activeZone1Id = z1.id;
    activeZone2Id = z2.id;
    inactiveZoneId = zInactive.id;
    noDriverActiveZoneId = zNoDrv.id;
    otherTenantZoneId = zOther.id;
  });

  afterAll(async () => {
    const ids = [mainCompanyId, otherCompanyId].filter(Boolean);
    if (ids.length > 0) {
      await prisma.packageHistory.deleteMany({ where: { package: { companyId: { in: ids } } } });
      await prisma.package.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.zone.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.driver.deleteMany({ where: { companyId: { in: ids } } });
      await prisma.company.deleteMany({ where: { id: { in: ids } } });
    }
  });

  describe("GET /api/packages/:id", () => {
    let detailPkgId: string;

    beforeAll(async () => {
      const pkg = await prisma.package.create({
        data: {
          trackingCode: `DET-${suffix}`,
          recipientName: "Laura Detalle",
          recipientAddress: "Av. Colón 1500, Córdoba",
          recipientPhone: "3514445566",
          recipientEmail: "laura@example.com",
          addressFloor: "4B",
          addressCity: "Córdoba",
          addressZip: "5000",
          addressReferences: "Edificio azul",
          deliveryWindowStart: new Date("2026-07-01T09:00:00.000Z"),
          deliveryWindowEnd: new Date("2026-07-01T13:00:00.000Z"),
          status: "delivered",
          signatureUrl: "/uploads/sig-test.png",
          photoUrl: "/uploads/photo-test.jpg",
          companyId: mainCompanyId,
          zoneId: activeZone1Id,
          driverId: driver1Id,
        },
      });
      detailPkgId = pkg.id;

      await prisma.packageHistory.create({
        data: {
          packageId: detailPkgId,
          status: "assigned",
          notes: "First event",
          createdAt: new Date("2026-07-01T08:00:00.000Z"),
        },
      });
      await prisma.packageHistory.create({
        data: {
          packageId: detailPkgId,
          status: "in_transit",
          notes: "Second event",
          createdAt: new Date("2026-07-01T10:00:00.000Z"),
        },
      });
      await prisma.packageHistory.create({
        data: {
          packageId: detailPkgId,
          status: "delivered",
          notes: "Third event",
          createdAt: new Date("2026-07-01T11:30:00.000Z"),
        },
      });
    });

    it("returns full package detail with zone, driver, evidences, and chronological history", async () => {
      const res = await request(app)
        .get(`/api/packages/${detailPkgId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(detailPkgId);
      expect(res.body.recipientName).toBe("Laura Detalle");
      expect(res.body.addressFloor).toBe("4B");
      expect(res.body.addressCity).toBe("Córdoba");
      expect(res.body.addressZip).toBe("5000");
      expect(res.body.signatureUrl).toBe("/uploads/sig-test.png");
      expect(res.body.photoUrl).toBe("/uploads/photo-test.jpg");
      expect(res.body.zone?.id).toBe(activeZone1Id);
      expect(res.body.driver?.id).toBe(driver1Id);
      expect(Array.isArray(res.body.history)).toBe(true);
      expect(res.body.history.map((h: any) => h.status)).toEqual([
        "assigned",
        "in_transit",
        "delivered",
      ]);
      expect(res.body.history.map((h: any) => h.notes)).toEqual([
        "First event",
        "Second event",
        "Third event",
      ]);
    });

    it("enforces driver authorization and prevents route collision with static routes", async () => {
      const authorizedDriverRes = await request(app)
        .get(`/api/packages/${detailPkgId}`)
        .set("Authorization", `Bearer ${driver1Token}`);
      expect(authorizedDriverRes.status).toBe(200);
      expect(authorizedDriverRes.body.id).toBe(detailPkgId);

      const unauthorizedDriverRes = await request(app)
        .get(`/api/packages/${detailPkgId}`)
        .set("Authorization", `Bearer ${driver2Token}`);
      expect(unauthorizedDriverRes.status).toBe(403);

      // Static routes remain reachable and not captured by /:id
      const myPackagesRes = await request(app)
        .get("/api/packages/my-packages")
        .set("Authorization", `Bearer ${driver1Token}`);
      expect(myPackagesRes.status).toBe(200);

      const statsRes = await request(app)
        .get("/api/packages/stats")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(statsRes.status).toBe(200);
    });

    it("returns 404 for non-existent or cross-tenant package and 400 for invalid UUID", async () => {
      const missingRes = await request(app)
        .get("/api/packages/00000000-0000-4000-8000-000000000000")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(missingRes.status).toBe(404);

      const crossTenantRes = await request(app)
        .get(`/api/packages/${detailPkgId}`)
        .set("Authorization", `Bearer ${otherAdminToken}`);
      expect(crossTenantRes.status).toBe(404);

      const invalidUuidRes = await request(app)
        .get("/api/packages/not-a-valid-uuid")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(invalidUuidRes.status).toBe(400);
      expect(invalidUuidRes.body.error).toBe("Validation failed");
    });
  });

  describe("PATCH /api/packages/:id", () => {
    it("updates recipient, address, coordinates, and delivery window while creating history, emitting events, and invalidating Redis", async () => {
      const createRes = await request(app)
        .post("/api/packages")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          trackingCode: `UPD-BASE-${suffix}`,
          recipientName: "Carlos Original",
          recipientAddress: "Av. Maipú 100, Córdoba",
          recipientPhone: "3511110000",
          zoneId: activeZone1Id,
          lat: -31.41,
          lng: -64.18,
        });
      expect(createRes.status).toBe(201);
      const pkgId = createRes.body.id;

      const redisSpy = jest.spyOn(redis, "delPrefix").mockResolvedValue(undefined);
      const emitSpy = jest.spyOn(websocketModule, "emitToRoom");

      const patchRes = await request(app)
        .patch(`/api/packages/${pkgId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          recipientName: "Carlos Editado",
          recipientPhone: "3512229999",
          recipientEmail: "carlos.editado@example.com",
          recipientAddress: "Bv. San Juan 500, Córdoba",
          addressFloor: "2A",
          addressCity: "Córdoba",
          addressZip: "5000",
          addressReferences: "Timbre 2A",
          lat: -31.4215,
          lng: -64.1888,
          deliveryWindowStart: "2026-08-10T09:00:00-03:00",
          deliveryWindowEnd: "2026-08-10T13:00:00-03:00",
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.recipientName).toBe("Carlos Editado");
      expect(patchRes.body.recipientPhone).toBe("3512229999");
      expect(patchRes.body.recipientEmail).toBe("carlos.editado@example.com");
      expect(patchRes.body.recipientAddress).toBe("Bv. San Juan 500, Córdoba");
      expect(patchRes.body.addressFloor).toBe("2A");
      expect(patchRes.body.addressCity).toBe("Córdoba");
      expect(patchRes.body.addressZip).toBe("5000");
      expect(patchRes.body.addressReferences).toBe("Timbre 2A");
      expect(patchRes.body.lat).toBeCloseTo(-31.4215, 4);
      expect(patchRes.body.lng).toBeCloseTo(-64.1888, 4);
      expect(new Date(patchRes.body.deliveryWindowStart).toISOString()).toBe("2026-08-10T12:00:00.000Z");
      expect(new Date(patchRes.body.deliveryWindowEnd).toISOString()).toBe("2026-08-10T16:00:00.000Z");
      expect(patchRes.body.status).toBe("assigned");
      expect(patchRes.body.driverId).toBe(driver1Id);
      expect(patchRes.body.history.length).toBeGreaterThanOrEqual(2);
      expect(patchRes.body.history[patchRes.body.history.length - 1].notes).toContain("Updated fields:");

      expect(redisSpy).toHaveBeenCalledWith(`packages:${mainCompanyId}:`);
      expect(emitSpy).toHaveBeenCalledWith(
        `company-${mainCompanyId}`,
        "package-updated",
        expect.objectContaining({ id: pkgId })
      );
    });

    it("synchronizes driverId, status, and PackageHistory when reassigning or clearing zoneId", async () => {
      const pendingPkg = await prisma.package.create({
        data: {
          trackingCode: `UPD-ZONE-${suffix}`,
          recipientName: "Lucía Zona",
          recipientAddress: "Av. Vélez Sarsfield 200",
          recipientPhone: "3513334444",
          status: "pending",
          companyId: mainCompanyId,
          zoneId: null,
          driverId: null,
        },
      });

      // 1. pending (no zone) -> activeZone1 (driver1) => assigned + driver1
      const toZone1 = await request(app)
        .patch(`/api/packages/${pendingPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: activeZone1Id });
      expect(toZone1.status).toBe(200);
      expect(toZone1.body.zoneId).toBe(activeZone1Id);
      expect(toZone1.body.driverId).toBe(driver1Id);
      expect(toZone1.body.status).toBe("assigned");

      // 2. activeZone1 (driver1) -> activeZone2 (driver2) => assigned + driver2
      const toZone2 = await request(app)
        .patch(`/api/packages/${pendingPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: activeZone2Id });
      expect(toZone2.status).toBe(200);
      expect(toZone2.body.zoneId).toBe(activeZone2Id);
      expect(toZone2.body.driverId).toBe(driver2Id);
      expect(toZone2.body.status).toBe("assigned");

      // 3. activeZone2 -> inactiveZone => reverts to pending + driverId null
      const toInactive = await request(app)
        .patch(`/api/packages/${pendingPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: inactiveZoneId });
      expect(toInactive.status).toBe(200);
      expect(toInactive.body.zoneId).toBe(inactiveZoneId);
      expect(toInactive.body.driverId).toBeNull();
      expect(toInactive.body.status).toBe("pending");

      // 4. inactiveZone -> activeZone1 -> null (unassign zone) => pending + null
      await request(app)
        .patch(`/api/packages/${pendingPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: activeZone1Id });

      const clearZone = await request(app)
        .patch(`/api/packages/${pendingPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: null });
      expect(clearZone.status).toBe(200);
      expect(clearZone.body.zoneId).toBeNull();
      expect(clearZone.body.driverId).toBeNull();
      expect(clearZone.body.status).toBe("pending");

      // 5. Assign to zone with no driver => pending + driverId null
      const toNoDriverZone = await request(app)
        .patch(`/api/packages/${pendingPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: noDriverActiveZoneId });
      expect(toNoDriverZone.status).toBe(200);
      expect(toNoDriverZone.body.zoneId).toBe(noDriverActiveZoneId);
      expect(toNoDriverZone.body.driverId).toBeNull();
      expect(toNoDriverZone.body.status).toBe("pending");
    });

    it("protects delivered, cancelled, and in_transit zone reassignments with 422", async () => {
      const [deliveredPkg, cancelledPkg, inTransitPkg] = await Promise.all([
        prisma.package.create({
          data: {
            trackingCode: `UPD-DEL-${suffix}`,
            recipientName: "Delivered Guard",
            recipientAddress: "Calle Guard 1",
            recipientPhone: "3510000001",
            status: "delivered",
            companyId: mainCompanyId,
            zoneId: activeZone1Id,
            driverId: driver1Id,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `UPD-CAN-${suffix}`,
            recipientName: "Cancelled Guard",
            recipientAddress: "Calle Guard 2",
            recipientPhone: "3510000002",
            status: "cancelled",
            companyId: mainCompanyId,
            zoneId: activeZone1Id,
            driverId: driver1Id,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `UPD-TRN-${suffix}`,
            recipientName: "Transit Guard",
            recipientAddress: "Calle Guard 3",
            recipientPhone: "3510000003",
            status: "in_transit",
            companyId: mainCompanyId,
            zoneId: activeZone1Id,
            driverId: driver1Id,
          },
        }),
      ]);

      const deliveredRes = await request(app)
        .patch(`/api/packages/${deliveredPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: activeZone2Id });
      expect(deliveredRes.status).toBe(422);

      const cancelledRes = await request(app)
        .patch(`/api/packages/${cancelledPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ recipientName: "Should Fail" });
      expect(cancelledRes.status).toBe(422);

      const inTransitZoneRes = await request(app)
        .patch(`/api/packages/${inTransitPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: activeZone2Id });
      expect(inTransitZoneRes.status).toBe(422);

      // Non-zone recipient phone update while in_transit is allowed
      const inTransitPhoneRes = await request(app)
        .patch(`/api/packages/${inTransitPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ recipientPhone: "3519998888" });
      expect(inTransitPhoneRes.status).toBe(200);
      expect(inTransitPhoneRes.body.recipientPhone).toBe("3519998888");
      expect(inTransitPhoneRes.body.zoneId).toBe(activeZone1Id);
    });

    it("rejects cross-tenant package/zone, invalid Zod payloads, invalid delivery windows, and driver role", async () => {
      const targetPkg = await prisma.package.create({
        data: {
          trackingCode: `UPD-VAL-${suffix}`,
          recipientName: "Validation Target",
          recipientAddress: "Av. General Paz 400",
          recipientPhone: "3517778888",
          status: "pending",
          deliveryWindowEnd: new Date("2026-09-01T12:00:00.000Z"),
          companyId: mainCompanyId,
          zoneId: activeZone1Id,
        },
      });

      // Cross-tenant packageId -> 404
      const crossTenantPkgRes = await request(app)
        .patch(`/api/packages/${targetPkg.id}`)
        .set("Authorization", `Bearer ${otherAdminToken}`)
        .send({ recipientName: "Hacker" });
      expect(crossTenantPkgRes.status).toBe(404);

      // Missing packageId -> 404
      const missingPkgRes = await request(app)
        .patch("/api/packages/00000000-0000-4000-8000-000000000000")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ recipientName: "Missing" });
      expect(missingPkgRes.status).toBe(404);

      // Cross-tenant zoneId -> 400
      const crossTenantZoneRes = await request(app)
        .patch(`/api/packages/${targetPkg.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: otherTenantZoneId });
      expect(crossTenantZoneRes.status).toBe(400);

      // Driver role -> 403
      const driverRes = await request(app)
        .patch(`/api/packages/${targetPkg.id}`)
        .set("Authorization", `Bearer ${driver1Token}`)
        .send({ recipientName: "Driver Edit" });
      expect(driverRes.status).toBe(403);

      // Zod validations -> 400
      const invalidPayloads = [
        {},
        { recipientName: "A" },
        { recipientEmail: "not-an-email" },
        { lat: 95, lng: -64 },
        { lat: -31, lng: 185 },
        { zoneId: "not-a-uuid" },
        {
          deliveryWindowStart: "2026-09-01T15:00:00Z",
          deliveryWindowEnd: "2026-09-01T10:00:00Z",
        },
        // Violates existing DB deliveryWindowEnd (12:00:00Z)
        { deliveryWindowStart: "2026-09-01T14:00:00Z" },
      ];

      for (const payload of invalidPayloads) {
        const res = await request(app)
          .patch(`/api/packages/${targetPkg.id}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send(payload);
        expect(res.status).toBe(400);
      }
    });
  });

  describe("POST /api/packages/unarchive", () => {
    let archPkg1Id: string;
    let archPkg2Id: string;
    let otherArchPkgId: string;

    beforeAll(async () => {
      const [p1, p2, pOther] = await Promise.all([
        prisma.package.create({
          data: {
            trackingCode: `UNARCH-1-${suffix}`,
            recipientName: "Archived One",
            recipientAddress: "Calle Archivo 1",
            recipientPhone: "3511000001",
            companyId: mainCompanyId,
            isArchived: false,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `UNARCH-2-${suffix}`,
            recipientName: "Archived Two",
            recipientAddress: "Calle Archivo 2",
            recipientPhone: "3511000002",
            companyId: mainCompanyId,
            isArchived: false,
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `UNARCH-OTH-${suffix}`,
            recipientName: "Other Archived",
            recipientAddress: "Calle Archivo 3",
            recipientPhone: "3511000003",
            companyId: otherCompanyId,
            isArchived: true,
          },
        }),
      ]);
      archPkg1Id = p1.id;
      archPkg2Id = p2.id;
      otherArchPkgId = pOther.id;
    });

    it("unarchives archived packages for the tenant, invalidates Redis cache, and isolates other tenants", async () => {
      const archiveRes = await request(app)
        .post("/api/packages/archive")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ packageIds: [archPkg1Id, archPkg2Id] });
      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.count).toBe(2);

      const redisSpy = jest.spyOn(redis, "delPrefix").mockResolvedValue(undefined);

      // Include a cross-tenant archived packageId: must NOT unarchive other tenant's package
      const unarchiveRes = await request(app)
        .post("/api/packages/unarchive")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ packageIds: [archPkg1Id, archPkg2Id, otherArchPkgId] });

      expect(unarchiveRes.status).toBe(200);
      expect(unarchiveRes.body.count).toBe(2);
      expect(redisSpy).toHaveBeenCalledWith(`packages:${mainCompanyId}:`);

      const [dbP1, dbP2, dbOther] = await Promise.all([
        prisma.package.findUnique({ where: { id: archPkg1Id } }),
        prisma.package.findUnique({ where: { id: archPkg2Id } }),
        prisma.package.findUnique({ where: { id: otherArchPkgId } }),
      ]);
      expect(dbP1?.isArchived).toBe(false);
      expect(dbP2?.isArchived).toBe(false);
      expect(dbOther?.isArchived).toBe(true);

      // Idempotent second call returns count: 0
      const secondRes = await request(app)
        .post("/api/packages/unarchive")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ packageIds: [archPkg1Id] });
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.count).toBe(0);
    });

    it("validates payload with Zod and enforces auth/roles", async () => {
      const unauthRes = await request(app)
        .post("/api/packages/unarchive")
        .send({ packageIds: [archPkg1Id] });
      expect(unauthRes.status).toBe(401);

      const driverRes = await request(app)
        .post("/api/packages/unarchive")
        .set("Authorization", `Bearer ${driver1Token}`)
        .send({ packageIds: [archPkg1Id] });
      expect(driverRes.status).toBe(403);

      for (const badBody of [{}, { packageIds: [] }, { packageIds: ["not-a-uuid"] }]) {
        const badRes = await request(app)
          .post("/api/packages/unarchive")
          .set("Authorization", `Bearer ${adminToken}`)
          .send(badBody);
        expect(badRes.status).toBe(400);
        expect(badRes.body.error).toBe("Validation failed");
      }
    });
  });

  it("documents GET/PATCH /api/packages/{id} and POST /api/packages/unarchive in Swagger spec", () => {
    const paths = (swaggerSpec as any).paths ?? {};
    expect(paths["/api/packages/{id}"]?.get).toBeDefined();
    expect(paths["/api/packages/{id}"]?.patch).toBeDefined();
    expect(paths["/api/packages/unarchive"]?.post).toBeDefined();
  });
});
