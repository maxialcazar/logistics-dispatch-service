import "dotenv/config";
import request from "supertest";
import axios from "axios";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
import { redis } from "../src/redis";
import { swaggerSpec } from "../src/swagger";
import { MAX_BULK_PACKAGES } from "../src/schemas/package.schema";
import { parseCsv, escapeCsvCell } from "../src/utils/csv";
import * as websocketModule from "../src/websocket";

describe("Task 2.2.4 — POST /api/packages/bulk & GET /api/packages/export", () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let companyAId: string;
  let companyBId: string;
  let adminAToken: string;
  let dispatcherAToken: string;
  let driverAToken: string;
  let adminBToken: string;

  let driverAId: string;
  let activeZoneAId: string;
  let inactiveZoneAId: string;
  let zoneBId: string;

  const activeZonePolygon = [
    [-64.2, -31.43],
    [-64.16, -31.43],
    [-64.16, -31.39],
    [-64.2, -31.39],
  ];

  beforeAll(async () => {
    const [regA, regB] = await Promise.all([
      request(app)
        .post("/api/auth/register-company")
        .set("X-Forwarded-For", "203.0.113.201")
        .send({
          companyName: `Bulk Alpha ${runId}`,
          companySlug: `bulk-alpha-${runId}`,
          username: `bulk_admin_a_${runId}`,
          password: "securepassword123",
        }),
      request(app)
        .post("/api/auth/register-company")
        .set("X-Forwarded-For", "203.0.113.202")
        .send({
          companyName: `Bulk Beta ${runId}`,
          companySlug: `bulk-beta-${runId}`,
          username: `bulk_admin_b_${runId}`,
          password: "securepassword123",
        }),
    ]);

    expect(regA.status).toBe(201);
    expect(regB.status).toBe(201);

    companyAId = regA.body.company.id;
    companyBId = regB.body.company.id;
    adminAToken = regA.body.token;
    adminBToken = regB.body.token;

    const dispUsername = `bulk_disp_a_${runId}`;
    const drvUsername = `bulk_drv_a_${runId}`;

    const [dispRes, drvRes] = await Promise.all([
      request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          username: dispUsername,
          password: "dispatcherPass123",
          role: "dispatcher",
        }),
      request(app)
        .post("/api/drivers")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          name: "Bulk Driver A",
          username: drvUsername,
          password: "driverPass123",
        }),
    ]);

    expect(dispRes.status).toBe(201);
    expect(drvRes.status).toBe(201);
    driverAId = drvRes.body.id;

    const [dispLogin, drvLogin] = await Promise.all([
      request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "203.0.113.203")
        .send({ username: dispUsername, password: "dispatcherPass123" }),
      request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "203.0.113.204")
        .send({ username: drvUsername, password: "driverPass123" }),
    ]);

    expect(dispLogin.status).toBe(200);
    expect(drvLogin.status).toBe(200);
    dispatcherAToken = dispLogin.body.token;
    driverAToken = drvLogin.body.token;

    const [activeZone, inactiveZone, zoneB] = await Promise.all([
      prisma.zone.create({
        data: {
          name: "Active Centro Zone",
          companyId: companyAId,
          isActive: true,
          driverId: driverAId,
          polygon: activeZonePolygon,
        },
      }),
      prisma.zone.create({
        data: {
          name: "Inactive Zone",
          companyId: companyAId,
          isActive: false,
          driverId: driverAId,
        },
      }),
      prisma.zone.create({
        data: {
          name: "Company B Zone",
          companyId: companyBId,
          isActive: true,
        },
      }),
    ]);

    activeZoneAId = activeZone.id;
    inactiveZoneAId = inactiveZone.id;
    zoneBId = zoneB.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  describe("Swagger & RBAC", () => {
    it("documents /api/packages/bulk and /api/packages/export in OpenAPI spec", () => {
      const paths = (swaggerSpec as any).paths;
      expect(paths["/api/packages/bulk"]).toBeDefined();
      expect(paths["/api/packages/bulk"].post).toBeDefined();
      expect(paths["/api/packages/bulk"].post.requestBody.content["application/json"]).toBeDefined();
      expect(paths["/api/packages/bulk"].post.requestBody.content["text/csv"]).toBeDefined();

      expect(paths["/api/packages/export"]).toBeDefined();
      expect(paths["/api/packages/export"].get).toBeDefined();
      expect(paths["/api/packages/export"].get.responses["200"].content["text/csv"]).toBeDefined();
    });

    it("enforces authentication (401) and admin/dispatcher role (403 for driver)", async () => {
      const unauthBulk = await request(app).post("/api/packages/bulk").send({ packages: [] });
      expect(unauthBulk.status).toBe(401);

      const unauthExport = await request(app).get("/api/packages/export");
      expect(unauthExport.status).toBe(401);

      const driverBulk = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${driverAToken}`)
        .send({
          packages: [
            {
              trackingCode: `DRV-BLK-${runId}`,
              recipientName: "Test Driver Role",
              recipientAddress: "Av. Test 123",
              recipientPhone: "3510001111",
            },
          ],
        });
      expect(driverBulk.status).toBe(403);

      // Ensures /export is matched before /:id (which allows drivers and would return 400 invalid UUID)
      const driverExport = await request(app)
        .get("/api/packages/export")
        .set("Authorization", `Bearer ${driverAToken}`);
      expect(driverExport.status).toBe(403);
    });
  });

  describe("POST /api/packages/bulk — JSON & CSV Bulk Creation", () => {
    it("imports JSON { packages: [...] }, auto-detects active zone, creates PackageHistory, invalidates cache, and emits Socket.IO", async () => {
      const delPrefixSpy = jest.spyOn(redis, "delPrefix").mockResolvedValue(undefined);
      const emitSpy = jest.spyOn(websocketModule, "emitToRoom").mockImplementation(() => {});
      const axiosSpy = jest.spyOn(axios, "get").mockResolvedValue({
        data: [{ lat: "-31.41", lon: "-64.18" }],
      } as any);

      const code1 = `BLK-JSON-1-${runId}`;
      const code2 = `BLK-JSON-2-${runId}`;
      const code3 = `BLK-JSON-3-${runId}`;

      const res = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${dispatcherAToken}`)
        .send({
          packages: [
            {
              trackingCode: code1,
              recipientName: "Ana Centro",
              recipientAddress: "Av. Colón 200, Córdoba",
              recipientPhone: "3511110001",
              recipientEmail: "ana@example.com",
              addressFloor: "3B",
              addressCity: "Córdoba",
              addressZip: "5000",
              weight: 2.5,
              volume: 0.1,
              lat: -31.41,
              lng: -64.18,
              deliveryWindowStart: "2026-11-20T09:00:00Z",
              deliveryWindowEnd: "2026-11-20T13:00:00Z",
            },
            {
              trackingCode: code2,
              recipientName: "Luis Inactivo",
              recipientAddress: "Av. Sabattini 900, Córdoba",
              recipientPhone: "3511110002",
              zoneId: inactiveZoneAId,
              lat: -31.45,
              lng: -64.15,
            },
            {
              trackingCode: code3,
              recipientName: "Geo Memoizado",
              recipientAddress: "Av. General Paz 100, Córdoba",
              recipientPhone: "3511110003",
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(3);
      expect(res.body.assignedCount).toBe(2); // code1 (auto-detected active) + code3 (geocoded into active zone)
      expect(res.body.pendingCount).toBe(1); // code2 (inactive zone)
      expect(res.body.items).toHaveLength(3);

      const [pkg1, pkg2, pkg3] = res.body.items;
      expect(pkg1.trackingCode).toBe(code1);
      expect(pkg1.status).toBe("assigned");
      expect(pkg1.zoneId).toBe(activeZoneAId);
      expect(pkg1.driverId).toBe(driverAId);
      expect(pkg1.addressFloor).toBe("3B");
      expect(pkg1.addressZip).toBe("5000");

      expect(pkg2.trackingCode).toBe(code2);
      expect(pkg2.status).toBe("pending");
      expect(pkg2.zoneId).toBe(inactiveZoneAId);
      expect(pkg2.driverId).toBeNull();

      expect(pkg3.trackingCode).toBe(code3);
      expect(pkg3.status).toBe("assigned");
      expect(pkg3.zoneId).toBe(activeZoneAId);
      expect(axiosSpy).toHaveBeenCalledTimes(1);

      const histories = await prisma.packageHistory.findMany({
        where: { packageId: { in: [pkg1.id, pkg2.id, pkg3.id] } },
      });
      expect(histories).toHaveLength(3);
      expect(histories.find((h) => h.packageId === pkg1.id)?.status).toBe("assigned");
      expect(histories.find((h) => h.packageId === pkg2.id)?.status).toBe("pending");

      expect(delPrefixSpy).toHaveBeenCalledWith(`packages:${companyAId}:`);
      expect(emitSpy).toHaveBeenCalledWith(
        `company-${companyAId}`,
        "packages-bulk-created",
        expect.objectContaining({
          count: 3,
          packageIds: [pkg1.id, pkg2.id, pkg3.id],
        })
      );
      expect(emitSpy).toHaveBeenCalledWith(
        `company-${companyAId}`,
        "package-created",
        expect.objectContaining({ trackingCode: code1 })
      );
      expect(emitSpy).toHaveBeenCalledWith(
        `company-${companyAId}`,
        "business-event",
        expect.objectContaining({ title: "Carga Masiva de Paquetes" })
      );
    });

    it("accepts top-level JSON array payload", async () => {
      const code = `BLK-ARR-${runId}`;
      const res = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send([
          {
            trackingCode: code,
            recipientName: "Array User",
            recipientAddress: "Calle Array 10, Córdoba",
            recipientPhone: "3512220001",
            lat: -31.5,
            lng: -64.3,
          },
        ]);

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(1);
      expect(res.body.items[0].trackingCode).toBe(code);
      expect(res.body.items[0].status).toBe("pending");
    });

    it("imports CSV via JSON { csv } supporting RFC-4180 quotes, commas, newlines, BOM, and snake_case headers", async () => {
      const c1 = `BLK-CSVJ-1-${runId}`;
      const c2 = `BLK-CSVJ-2-${runId}`;
      const csvPayload =
        "\uFEFF" +
        [
          "tracking_code,recipient_name,recipient_address,recipient_phone,address_references,weight,lat,lng",
          `${c1},"Gómez, María","Av. Vélez Sarsfield 100, ""Piso 4""",3513330001,"Portón ""rojo"", timbre 4",3.75,-31.41,-64.18`,
          `${c2},Carlos Díaz,"Bv. San Juan 500\nDepto 2B",3513330002,,, -31.50 , -64.30 `,
        ].join("\r\n");

      const res = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ csv: csvPayload });

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(2);
      expect(res.body.items[0]).toMatchObject({
        trackingCode: c1,
        recipientName: "Gómez, María",
        recipientAddress: 'Av. Vélez Sarsfield 100, "Piso 4"',
        addressReferences: 'Portón "rojo", timbre 4',
        weight: 3.75,
        status: "assigned",
        zoneId: activeZoneAId,
      });
      expect(res.body.items[1]).toMatchObject({
        trackingCode: c2,
        recipientName: "Carlos Díaz",
        recipientAddress: "Bv. San Juan 500\nDepto 2B",
        weight: null,
        lat: -31.5,
        lng: -64.3,
        status: "pending",
      });
    });

    it("imports raw text/csv Content-Type payload via express.text middleware", async () => {
      const c1 = `BLK-RAWCSV-1-${runId}`;
      const c2 = `BLK-RAWCSV-2-${runId}`;
      const rawCsv = [
        "trackingCode,recipientName,recipientAddress,recipientPhone,zoneId,lat,lng",
        `${c1},Sofía Raw,"Av. Fuerza Aérea 1200, Córdoba",3514440001,${activeZoneAId},-31.42,-64.22`,
        `${c2},Mateo Raw,"Av. Recta Martinolli 300, Córdoba",3514440002,,-31.35,-64.25`,
      ].join("\n");

      const res = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${dispatcherAToken}`)
        .set("Content-Type", "text/csv; charset=utf-8")
        .send(rawCsv);

      expect(res.status).toBe(201);
      expect(res.body.count).toBe(2);
      expect(res.body.items[0].status).toBe("assigned");
      expect(res.body.items[0].zoneId).toBe(activeZoneAId);
      expect(res.body.items[1].status).toBe("pending");
    });
  });

  describe("POST /api/packages/bulk — Zod Validation, Tenant Isolation & Conflicts", () => {
    it("rejects empty payloads, batch size > MAX_BULK_PACKAGES, invalid rows, and malformed CSV with 400", async () => {
      const emptyObj = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({});
      expect(emptyObj.status).toBe(400);
      expect(emptyObj.body.error).toBe("Validation failed");

      const emptyArr = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ packages: [] });
      expect(emptyArr.status).toBe(400);

      const headerOnlyCsv = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .set("Content-Type", "text/csv")
        .send("trackingCode,recipientName,recipientAddress,recipientPhone\n");
      expect(headerOnlyCsv.status).toBe(400);

      const overLimitJson = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          packages: Array.from({ length: MAX_BULK_PACKAGES + 1 }, (_, i) => ({
            trackingCode: `OVER-${i}-${runId}`,
            recipientName: "Overflow User",
            recipientAddress: "Calle Overflow 100",
            recipientPhone: "3510000000",
          })),
        });
      expect(overLimitJson.status).toBe(400);
      expect(overLimitJson.body.error).toBe("Validation failed");

      const overLimitCsv = [
        "trackingCode,recipientName,recipientAddress,recipientPhone",
        ...Array.from(
          { length: MAX_BULK_PACKAGES + 1 },
          (_, i) => `OCSV-${i}-${runId},Overflow User,Calle Overflow 100,3510000000`
        ),
      ].join("\n");
      const overLimitCsvRes = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .set("Content-Type", "text/csv")
        .send(overLimitCsv);
      expect(overLimitCsvRes.status).toBe(400);

      const invalidRowCsv = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          csv: [
            "trackingCode,recipientName,recipientAddress,recipientPhone,weight,lat",
            `VALID-${runId},Valid Name,Calle Valida 123,3510000001,1.5,-31.41`,
            `BAD,Invalid User,Calle Bad 456,3510000002,notanumber,120`,
          ].join("\n"),
        });
      expect(invalidRowCsv.status).toBe(400);
      expect(invalidRowCsv.body.details.length).toBeGreaterThanOrEqual(2);

      // Ensure atomic rejection: VALID-${runId} was NOT inserted
      const persisted = await prisma.package.findFirst({
        where: { companyId: companyAId, trackingCode: `VALID-${runId}` },
      });
      expect(persisted).toBeNull();

      const unterminatedQuoteCsv = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .set("Content-Type", "text/csv")
        .send('trackingCode,recipientName,recipientAddress,recipientPhone\nPKG-12345,"Unclosed,Calle 1,123');
      expect(unterminatedQuoteCsv.status).toBe(400);

      const duplicateInBatch = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send([
          {
            trackingCode: `DUP-IN-${runId}`,
            recipientName: "First",
            recipientAddress: "Calle Uno 123",
            recipientPhone: "3510001",
          },
          {
            trackingCode: `DUP-IN-${runId}`,
            recipientName: "Second",
            recipientAddress: "Calle Dos 456",
            recipientPhone: "3510002",
          },
        ]);
      expect(duplicateInBatch.status).toBe(400);
    });

    it("prevents cross-tenant zone assignment and rolls back the entire transaction", async () => {
      const validCode = `XTEN-OK-${runId}`;
      const badCode = `XTEN-BAD-${runId}`;

      const res = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          packages: [
            {
              trackingCode: validCode,
              recipientName: "Tenant A Valid",
              recipientAddress: "Av. Colón 500, Córdoba",
              recipientPhone: "3515550001",
              lat: -31.5,
              lng: -64.3,
            },
            {
              trackingCode: badCode,
              recipientName: "Cross Tenant Zone",
              recipientAddress: "Av. Colón 600, Córdoba",
              recipientPhone: "3515550002",
              zoneId: zoneBId, // Belongs to Company B!
              lat: -31.5,
              lng: -64.3,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("zone not found");

      const leaked = await prisma.package.findFirst({
        where: { companyId: companyAId, trackingCode: { in: [validCode, badCode] } },
      });
      expect(leaked).toBeNull();
    });

    it("returns 409 on existing trackingCode within same tenant while allowing same trackingCode in another tenant", async () => {
      const sharedCode = `SHARED-CODE-${runId}`;

      const createA = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send([
          {
            trackingCode: sharedCode,
            recipientName: "Company A Owner",
            recipientAddress: "Av. Tenant A 100",
            recipientPhone: "3516660001",
            lat: -31.5,
            lng: -64.3,
          },
        ]);
      expect(createA.status).toBe(201);

      const dupA = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send([
          {
            trackingCode: `NEW-BEFORE-DUP-${runId}`,
            recipientName: "Rollback Check",
            recipientAddress: "Av. Tenant A 200",
            recipientPhone: "3516660002",
            lat: -31.5,
            lng: -64.3,
          },
          {
            trackingCode: sharedCode,
            recipientName: "Duplicate A",
            recipientAddress: "Av. Tenant A 300",
            recipientPhone: "3516660003",
            lat: -31.5,
            lng: -64.3,
          },
        ]);
      expect(dupA.status).toBe(409);
      expect(dupA.body.duplicates).toContain(sharedCode);

      const rollbackCheck = await prisma.package.findFirst({
        where: { companyId: companyAId, trackingCode: `NEW-BEFORE-DUP-${runId}` },
      });
      expect(rollbackCheck).toBeNull();

      // Same trackingCode in Company B succeeds (multi-tenant isolation)
      const createB = await request(app)
        .post("/api/packages/bulk")
        .set("Authorization", `Bearer ${adminBToken}`)
        .send([
          {
            trackingCode: sharedCode,
            recipientName: "Company B Owner",
            recipientAddress: "Av. Tenant B 100",
            recipientPhone: "1155550001",
            zoneId: zoneBId,
            lat: -34.6,
            lng: -58.38,
          },
        ]);
      expect(createB.status).toBe(201);
      expect(createB.body.items[0].companyId).toBe(companyBId);
    });
  });

  describe("GET /api/packages/export — Filtered CSV Export & Formula Injection Mitigation", () => {
    let expPendingId: string;
    let expDeliveredId: string;
    let expArchivedId: string;
    let expInjectionId: string;

    beforeAll(async () => {
      const [p1, p2, p3, p4] = await Promise.all([
        prisma.package.create({
          data: {
            trackingCode: `EXP-PEND-${runId}`,
            recipientName: "Export Pending",
            recipientAddress: "Av. Export 100",
            recipientPhone: "3517770001",
            status: "pending",
            companyId: companyAId,
            zoneId: inactiveZoneAId,
            createdAt: new Date("2026-06-05T10:00:00Z"),
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `EXP-DELIV-${runId}`,
            recipientName: "Export Delivered",
            recipientAddress: 'Calle Coma, "Comilla" 200',
            recipientPhone: "3517770002",
            status: "delivered",
            companyId: companyAId,
            zoneId: activeZoneAId,
            driverId: driverAId,
            createdAt: new Date("2026-06-10T15:00:00Z"),
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `EXP-ARCH-${runId}`,
            recipientName: "Export Archived",
            recipientAddress: "Calle Archivo 300",
            recipientPhone: "3517770003",
            status: "cancelled",
            isArchived: true,
            companyId: companyAId,
            createdAt: new Date("2026-06-10T16:00:00Z"),
          },
        }),
        prisma.package.create({
          data: {
            trackingCode: `EXP-INJ-${runId}`,
            recipientName: "=CMD|'/C calc'!A0",
            recipientAddress: "+SUM(A1:A2), \"Test\"\nLine2",
            recipientPhone: "-2+3",
            addressReferences: "@SUM(1,1)",
            senderName: "\t=HYPERLINK(\"http://evil\")",
            senderAddress: "\r=1+1",
            senderPhone: " =1+1",
            status: "assigned",
            companyId: companyAId,
            zoneId: activeZoneAId,
            driverId: driverAId,
            lat: -31.4167,
            lng: -64.1833,
            createdAt: new Date("2026-06-12T12:00:00Z"),
          },
        }),
      ]);

      expPendingId = p1.id;
      expDeliveredId = p2.id;
      expArchivedId = p3.id;
      expInjectionId = p4.id;
    });

    it("returns proper CSV headers and isolates data by tenant", async () => {
      const resA = await request(app)
        .get("/api/packages/export")
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(resA.status).toBe(200);
      expect(resA.headers["content-type"]).toContain("text/csv");
      expect(resA.headers["content-type"]).toContain("charset=utf-8");
      expect(resA.headers["content-disposition"]).toBe('attachment; filename="packages.csv"');

      const parsedA = parseCsv(resA.text);
      const codesA = parsedA.rows.map((r) => r.trackingCode);
      expect(codesA).toContain(`EXP-PEND-${runId}`);
      expect(codesA).toContain(`EXP-DELIV-${runId}`);
      expect(codesA).not.toContain(`EXP-ARCH-${runId}`); // default isArchived=false

      // Company B cannot see Company A's packages even if passing Company A's zoneId/driverId
      const resB = await request(app)
        .get(`/api/packages/export?zoneId=${activeZoneAId}&driverId=${driverAId}`)
        .set("Authorization", `Bearer ${adminBToken}`);
      expect(resB.status).toBe(200);
      const parsedB = parseCsv(resB.text);
      expect(parsedB.rows).toHaveLength(0);
      expect(parsedB.headers).toContain("trackingCode");
    });

    it("filters exported CSV by status, dateFrom/dateTo, search, zoneId, driverId, and isArchived", async () => {
      const byStatusAndDate = await request(app)
        .get("/api/packages/export?status=delivered&dateFrom=2026-06-08&dateTo=2026-06-11")
        .set("Authorization", `Bearer ${dispatcherAToken}`);

      expect(byStatusAndDate.status).toBe(200);
      const parsedStatusDate = parseCsv(byStatusAndDate.text);
      expect(parsedStatusDate.rows).toHaveLength(1);
      expect(parsedStatusDate.rows[0].id).toBe(expDeliveredId);
      expect(parsedStatusDate.rows[0].zoneName).toBe("Active Centro Zone");
      expect(parsedStatusDate.rows[0].driverName).toBe("Bulk Driver A");

      const byMultiStatus = await request(app)
        .get("/api/packages/export?status=pending,delivered&dateFrom=2026-06-01&dateTo=2026-06-11")
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(byMultiStatus.status).toBe(200);
      const multiIds = parseCsv(byMultiStatus.text).rows.map((r) => r.id);
      expect(multiIds).toEqual(expect.arrayContaining([expPendingId, expDeliveredId]));
      expect(multiIds).not.toContain(expInjectionId);

      const byArchived = await request(app)
        .get("/api/packages/export?isArchived=true&search=Archived")
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(byArchived.status).toBe(200);
      const archivedRows = parseCsv(byArchived.text).rows;
      expect(archivedRows).toHaveLength(1);
      expect(archivedRows[0].id).toBe(expArchivedId);
    });

    it("validates export query parameters with Zod (400)", async () => {
      const invalidUrls = [
        "/api/packages/export?status=unknown_status",
        "/api/packages/export?zoneId=not-a-uuid",
        "/api/packages/export?dateFrom=2026-06-20&dateTo=2026-06-01",
        "/api/packages/export?isArchived=maybe",
      ];

      for (const url of invalidUrls) {
        const res = await request(app).get(url).set("Authorization", `Bearer ${adminAToken}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Validation failed");
      }
    });

    it("neutralizes CSV formula injection (=, +, -, @, tab, CR, leading space) and escapes commas/quotes/newlines", async () => {
      const res = await request(app)
        .get(`/api/packages/export?trackingCode=EXP-INJ-${runId}`)
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      const parsed = parseCsv(res.text);
      expect(parsed.rows).toHaveLength(1);

      const row = parsed.rows[0];
      expect(row.id).toBe(expInjectionId);
      expect(row.recipientName).toBe("'=CMD|'/C calc'!A0");
      expect(row.recipientAddress).toBe("'+SUM(A1:A2), \"Test\"\nLine2");
      expect(row.recipientPhone).toBe("'-2+3");
      expect(row.addressReferences).toBe("'@SUM(1,1)");
      expect(row.senderName).toBe("'\t=HYPERLINK(\"http://evil\")");
      expect(row.senderAddress).toBe("'\r=1+1");
      expect(row.senderPhone).toBe("' =1+1");
      expect(row.lat).toBe("'-31.4167");
      expect(row.lng).toBe("'-64.1833");

      // Every single exported cell must not start with unescaped formula trigger characters
      for (const cellValue of Object.values(row)) {
        expect(cellValue).not.toMatch(/^(?:[=+\-@\t\r]| +[=+\-@\t\r])/);
      }

      // Direct unit sanity check on escapeCsvCell for commas/quotes
      expect(escapeCsvCell('Calle 1, "Centro"')).toBe('"Calle 1, ""Centro"""');
    });
  });
});
