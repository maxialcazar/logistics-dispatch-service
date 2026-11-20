import "dotenv/config";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
import { redis } from "../src/redis";

describe("Tenant Company Endpoints (GET /api/company & PATCH /api/company)", () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let companyAId: string;
  let companyASlug: string;
  let companyBId: string;
  let companyBSlug: string;

  let adminAToken: string;
  let adminBToken: string;
  let dispatcherAToken: string;
  let driverAToken: string;

  beforeAll(async () => {
    companyASlug = `company-a-${runId}`;
    companyBSlug = `company-b-${runId}`;

    const [regA, regB] = await Promise.all([
      request(app)
        .post("/api/auth/register-company")
        .set("X-Forwarded-For", "203.0.113.111")
        .send({
          companyName: "Company Alpha Logistics",
          companySlug: companyASlug,
          username: `comp_admin_a_${runId}`,
          password: "securepassword123",
        }),
      request(app)
        .post("/api/auth/register-company")
        .set("X-Forwarded-For", "203.0.113.112")
        .send({
          companyName: "Company Beta Logistics",
          companySlug: companyBSlug,
          username: `comp_admin_b_${runId}`,
          password: "securepassword123",
        }),
    ]);

    expect(regA.status).toBe(201);
    expect(regB.status).toBe(201);

    companyAId = regA.body.company.id;
    companyBId = regB.body.company.id;
    adminAToken = regA.body.token;
    adminBToken = regB.body.token;

    const dispUsername = `comp_disp_a_${runId}`;
    const drvUsername = `comp_drv_a_${runId}`;

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
          name: "Company Driver A",
          username: drvUsername,
          password: "driverPass123",
        }),
    ]);

    expect(dispRes.status).toBe(201);
    expect(drvRes.status).toBe(201);

    const [dispLogin, drvLogin] = await Promise.all([
      request(app).post("/api/auth/login").send({
        username: dispUsername,
        password: "dispatcherPass123",
      }),
      request(app).post("/api/auth/login").send({
        username: drvUsername,
        password: "driverPass123",
      }),
    ]);

    expect(dispLogin.status).toBe(200);
    expect(drvLogin.status).toBe(200);

    dispatcherAToken = dispLogin.body.token;
    driverAToken = drvLogin.body.token;
  });

  afterAll(async () => {
    const companyIds = [companyAId, companyBId].filter(Boolean);
    if (companyIds.length > 0) {
      await Promise.all(companyIds.map((cId) => redis.delPrefix(`drivers:${cId}:`)));
      await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.driver.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } }).catch(() => {});
    }
    await closeDatabase();
    await redis.disconnect();
  });

  describe("GET /api/company", () => {
    it("returns 401 when unauthenticated or token has whitespace companyId", async () => {
      const noAuth = await request(app).get("/api/company");
      expect(noAuth.status).toBe(401);

      const badToken = jwt.sign(
        { userId: "u-1", role: "admin", driverId: null, companyId: "   " },
        process.env.JWT_SECRET!,
        { expiresIn: "1h" }
      );
      const badRes = await request(app)
        .get("/api/company")
        .set("Authorization", `Bearer ${badToken}`);
      expect(badRes.status).toBe(401);
    });

    it("returns 403 for dispatcher and driver roles (admin only)", async () => {
      const [dispRes, drvRes] = await Promise.all([
        request(app).get("/api/company").set("Authorization", `Bearer ${dispatcherAToken}`),
        request(app).get("/api/company").set("Authorization", `Bearer ${driverAToken}`),
      ]);

      expect(dispRes.status).toBe(403);
      expect(drvRes.status).toBe(403);
    });

    it("returns 200 with strictly tenant-scoped Company details for admin", async () => {
      const [resA, resB] = await Promise.all([
        request(app).get("/api/company").set("Authorization", `Bearer ${adminAToken}`),
        request(app).get("/api/company").set("Authorization", `Bearer ${adminBToken}`),
      ]);

      expect(resA.status).toBe(200);
      expect(resA.body).toEqual(
        expect.objectContaining({
          id: companyAId,
          name: "Company Alpha Logistics",
          slug: companyASlug,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })
      );

      expect(resB.status).toBe(200);
      expect(resB.body).toEqual(
        expect.objectContaining({
          id: companyBId,
          name: "Company Beta Logistics",
          slug: companyBSlug,
        })
      );
    });

    it("returns 404 when the authenticated admin's companyId does not exist", async () => {
      const ghostToken = jwt.sign(
        { userId: randomUUID(), role: "admin", driverId: null, companyId: randomUUID() },
        process.env.JWT_SECRET!,
        { expiresIn: "1h" }
      );

      const res = await request(app)
        .get("/api/company")
        .set("Authorization", `Bearer ${ghostToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/company", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app)
        .patch("/api/company")
        .send({ name: "Unauthorized Edit" });
      expect(res.status).toBe(401);
    });

    it("returns 403 for dispatcher and driver roles (admin only)", async () => {
      const [dispRes, drvRes] = await Promise.all([
        request(app)
          .patch("/api/company")
          .set("Authorization", `Bearer ${dispatcherAToken}`)
          .send({ name: "Dispatcher Edit" }),
        request(app)
          .patch("/api/company")
          .set("Authorization", `Bearer ${driverAToken}`)
          .send({ name: "Driver Edit" }),
      ]);

      expect(dispRes.status).toBe(403);
      expect(drvRes.status).toBe(403);
    });

    it("returns 400 when body is empty or fails Zod validation", async () => {
      const invalidPayloads: any[] = [
        undefined,
        {},
        { unknownField: "value" },
        { name: "" },
        { name: "   " },
        { name: "A" },
        { name: "x".repeat(101) },
        { name: null },
        { slug: "" },
        { slug: "a" },
        { slug: "Invalid Slug!" },
        { slug: "UPPERCASE" },
        { slug: "--bad-slug" },
        { slug: "bad--slug" },
        { slug: "bad-slug-" },
        { slug: null },
      ];

      for (const payload of invalidPayloads) {
        const req = request(app)
          .patch("/api/company")
          .set("Authorization", `Bearer ${adminAToken}`);

        const res = payload === undefined ? await req : await req.send(payload);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Validation failed");
      }
    });

    it("updates company name (trimmed) and persists to database without affecting Company B", async () => {
      const res = await request(app)
        .patch("/api/company")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ name: "  Company Alpha Updated  " });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          id: companyAId,
          name: "Company Alpha Updated",
          slug: companyASlug,
        })
      );

      const [dbCompanyA, dbCompanyB, getRes, meRes] = await Promise.all([
        prisma.company.findUnique({ where: { id: companyAId } }),
        prisma.company.findUnique({ where: { id: companyBId } }),
        request(app).get("/api/company").set("Authorization", `Bearer ${adminAToken}`),
        request(app).get("/api/auth/me").set("Authorization", `Bearer ${adminAToken}`),
      ]);

      expect(dbCompanyA?.name).toBe("Company Alpha Updated");
      expect(dbCompanyA?.slug).toBe(companyASlug);
      expect(dbCompanyB?.name).toBe("Company Beta Logistics");
      expect(dbCompanyB?.slug).toBe(companyBSlug);

      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe("Company Alpha Updated");
      expect(meRes.status).toBe(200);
      expect(meRes.body.company.name).toBe("Company Alpha Updated");
    });

    it("updates company slug, allows keeping current slug, and ignores non-updatable fields", async () => {
      const nextSlug = `company-a-renamed-${runId}`;

      const slugRes = await request(app)
        .patch("/api/company")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ slug: `  ${nextSlug}  ` });

      expect(slugRes.status).toBe(200);
      expect(slugRes.body.id).toBe(companyAId);
      expect(slugRes.body.slug).toBe(nextSlug);
      expect(slugRes.body.name).toBe("Company Alpha Updated");
      companyASlug = nextSlug;

      // Updating name + same company's current slug should succeed (no self-conflict)
      // and extraneous id/companyId in payload must be ignored
      const bothRes = await request(app)
        .patch("/api/company")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          id: companyBId,
          companyId: companyBId,
          name: "Company Alpha Final",
          slug: companyASlug,
        });

      expect(bothRes.status).toBe(200);
      expect(bothRes.body.id).toBe(companyAId);
      expect(bothRes.body.name).toBe("Company Alpha Final");
      expect(bothRes.body.slug).toBe(companyASlug);

      const dbCompanyB = await prisma.company.findUnique({ where: { id: companyBId } });
      expect(dbCompanyB?.name).toBe("Company Beta Logistics");
      expect(dbCompanyB?.slug).toBe(companyBSlug);
    });

    it("returns 409 when updating slug to another company's existing slug (P2002)", async () => {
      const conflictRes = await request(app)
        .patch("/api/company")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          name: "Should Not Persist",
          slug: companyBSlug,
        });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error).toBe("Company URL/Slug already exists");

      const dbCompanyA = await prisma.company.findUnique({ where: { id: companyAId } });
      expect(dbCompanyA?.name).toBe("Company Alpha Final");
      expect(dbCompanyA?.slug).toBe(companyASlug);
    });

    it("returns 404 when the authenticated admin's companyId does not exist (P2025)", async () => {
      const ghostToken = jwt.sign(
        { userId: randomUUID(), role: "admin", driverId: null, companyId: randomUUID() },
        process.env.JWT_SECRET!,
        { expiresIn: "1h" }
      );

      const res = await request(app)
        .patch("/api/company")
        .set("Authorization", `Bearer ${ghostToken}`)
        .send({ name: "Ghost Company" });

      expect(res.status).toBe(404);
    });
  });

  describe("Swagger / OpenAPI documentation", () => {
    it("documents GET and PATCH /api/company in /swagger.json", async () => {
      const res = await request(app).get("/swagger.json");
      expect(res.status).toBe(200);
      expect(res.body.paths["/api/company"]?.get).toBeDefined();
      expect(res.body.paths["/api/company"]?.patch).toBeDefined();
    });
  });
});
