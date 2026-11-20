import "dotenv/config";
import http from "http";
import request from "supertest";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
import { redis } from "../src/redis";
import { initSocket } from "../src/websocket";

describe("Team Users Management API (GET /api/users & DELETE /api/users/:id)", () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let companyAId: string;
  let companyBId: string;
  let adminAId: string;
  let adminAToken: string;
  let adminBToken: string;

  let dispA1Id: string;
  let dispA1Username: string;
  let dispA1Token: string;
  let dispA2Id: string;
  let dispA3Id: string;
  let dispB1Id: string;

  let driverAId: string;
  let driverAUserId: string;
  let driverAToken: string;

  beforeAll(async () => {
    const [regA, regB] = await Promise.all([
      request(app)
        .post("/api/auth/register-company")
        .set("X-Forwarded-For", "203.0.113.101")
        .send({
          companyName: "Users Team Co A",
          companySlug: `users-co-a-${runId}`,
          username: `users_admin_a_${runId}`,
          password: "securepassword123",
        }),
      request(app)
        .post("/api/auth/register-company")
        .set("X-Forwarded-For", "203.0.113.102")
        .send({
          companyName: "Users Team Co B",
          companySlug: `users-co-b-${runId}`,
          username: `users_admin_b_${runId}`,
          password: "securepassword123",
        }),
    ]);

    expect(regA.status).toBe(201);
    expect(regB.status).toBe(201);

    companyAId = regA.body.company.id;
    companyBId = regB.body.company.id;
    adminAId = regA.body.user.id;
    adminAToken = regA.body.token;
    adminBToken = regB.body.token;

    dispA1Username = `alpha_disp_${runId}`;
    const [d1, d2, d3, db1, drv] = await Promise.all([
      request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ username: dispA1Username, password: "dispatcherPass123", role: "dispatcher" }),
      request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ username: `beta_disp_${runId}`, password: "dispatcherPass123", role: "dispatcher" }),
      request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ username: `gamma_disp_${runId}`, password: "dispatcherPass123", role: "dispatcher" }),
      request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminBToken}`)
        .send({ username: `other_disp_${runId}`, password: "dispatcherPass123", role: "dispatcher" }),
      request(app)
        .post("/api/drivers")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({
          name: "Team Driver A",
          username: `team_drv_${runId}`,
          password: "driverPass123",
        }),
    ]);

    expect(d1.status).toBe(201);
    expect(d2.status).toBe(201);
    expect(d3.status).toBe(201);
    expect(db1.status).toBe(201);
    expect(drv.status).toBe(201);

    dispA1Id = d1.body.id;
    dispA2Id = d2.body.id;
    dispA3Id = d3.body.id;
    dispB1Id = db1.body.id;
    driverAId = drv.body.id;
    driverAUserId = drv.body.user.id;

    const [dispLogin, drvLogin] = await Promise.all([
      request(app).post("/api/auth/login").send({
        username: dispA1Username,
        password: "dispatcherPass123",
      }),
      request(app).post("/api/auth/login").send({
        username: `team_drv_${runId}`,
        password: "driverPass123",
      }),
    ]);

    expect(dispLogin.status).toBe(200);
    expect(drvLogin.status).toBe(200);
    dispA1Token = dispLogin.body.token;
    driverAToken = drvLogin.body.token;
  });

  afterAll(async () => {
    const companyIds = [companyAId, companyBId].filter(Boolean);
    if (companyIds.length > 0) {
      await Promise.all(companyIds.map((cId) => redis.delPrefix(`drivers:${cId}:`)));
      await prisma.packageHistory.deleteMany({
        where: { package: { companyId: { in: companyIds } } },
      });
      await prisma.package.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.driver.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } }).catch(() => {});
    }
    await closeDatabase();
    await redis.disconnect();
  });

  describe("GET /api/users", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app).get("/api/users");
      expect(res.status).toBe(401);
    });

    it("returns 403 for dispatcher and driver roles (RBAC admin only)", async () => {
      const [dispRes, drvRes] = await Promise.all([
        request(app).get("/api/users").set("Authorization", `Bearer ${dispA1Token}`),
        request(app).get("/api/users").set("Authorization", `Bearer ${driverAToken}`),
      ]);

      expect(dispRes.status).toBe(403);
      expect(drvRes.status).toBe(403);
    });

    it("returns paginated company-scoped users without password field", async () => {
      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.meta).toMatchObject({
        total: 5, // adminA + 3 dispatchers + 1 driver user
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const returnedIds = res.body.items.map((u: any) => u.id);
      expect(returnedIds).toContain(adminAId);
      expect(returnedIds).toContain(dispA1Id);
      expect(returnedIds).toContain(dispA2Id);
      expect(returnedIds).toContain(dispA3Id);
      expect(returnedIds).toContain(driverAUserId);
      // Cross-tenant user must never appear
      expect(returnedIds).not.toContain(dispB1Id);

      for (const user of res.body.items) {
        expect(user.companyId).toBe(companyAId);
        expect(user.password).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(user, "password")).toBe(false);
      }
    });

    it("supports role and case-insensitive search filters plus sanitized pagination", async () => {
      const roleFiltered = await request(app)
        .get("/api/users?role=dispatcher&page=1&limit=2")
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(roleFiltered.status).toBe(200);
      expect(roleFiltered.body.items).toHaveLength(2);
      expect(roleFiltered.body.meta).toMatchObject({
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2,
      });
      expect(roleFiltered.body.items.every((u: any) => u.role === "dispatcher")).toBe(true);

      const searchFiltered = await request(app)
        .get("/api/users?search=BETA_DISP")
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(searchFiltered.status).toBe(200);
      expect(searchFiltered.body.items).toHaveLength(1);
      expect(searchFiltered.body.items[0].id).toBe(dispA2Id);

      const sanitized = await request(app)
        .get("/api/users?page=abc&limit=9999")
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(sanitized.status).toBe(200);
      expect(sanitized.body.meta.page).toBe(1);
      expect(sanitized.body.meta.limit).toBe(100);
    });

    it("returns 400 when role query filter is invalid", async () => {
      const res = await request(app)
        .get("/api/users?role=superadmin")
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });
  });

  describe("DELETE /api/users/:id", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app).delete(`/api/users/${dispA2Id}`);
      expect(res.status).toBe(401);
    });

    it("returns 403 for dispatcher and driver roles", async () => {
      const [dispRes, drvRes] = await Promise.all([
        request(app)
          .delete(`/api/users/${dispA2Id}`)
          .set("Authorization", `Bearer ${dispA1Token}`),
        request(app)
          .delete(`/api/users/${dispA2Id}`)
          .set("Authorization", `Bearer ${driverAToken}`),
      ]);

      expect(dispRes.status).toBe(403);
      expect(drvRes.status).toBe(403);
    });

    it("returns 400 for invalid UUID parameter", async () => {
      const res = await request(app)
        .delete("/api/users/not-a-valid-uuid")
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    it("prevents admin self-deletion and keeps admin account intact", async () => {
      const res = await request(app)
        .delete(`/api/users/${adminAId}`)
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/own/i);

      const adminStillExists = await prisma.user.findUnique({ where: { id: adminAId } });
      expect(adminStillExists).not.toBeNull();
    });

    it("returns 404 for non-existent user or cross-tenant user (leaving other tenant untouched)", async () => {
      const nonExistentRes = await request(app)
        .delete("/api/users/00000000-0000-4000-8000-000000000000")
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(nonExistentRes.status).toBe(404);

      const crossTenantRes = await request(app)
        .delete(`/api/users/${dispB1Id}`)
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(crossTenantRes.status).toBe(404);

      const companyBUser = await prisma.user.findUnique({ where: { id: dispB1Id } });
      expect(companyBUser).not.toBeNull();
    });

    it("safely rejects deleting a driver user directly without orphaning the driver profile", async () => {
      const res = await request(app)
        .delete(`/api/users/${driverAUserId}`)
        .set("Authorization", `Bearer ${adminAToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/drivers/i);

      const [driverRecord, driverUser] = await Promise.all([
        prisma.driver.findUnique({ where: { id: driverAId } }),
        prisma.user.findUnique({ where: { id: driverAUserId } }),
      ]);
      expect(driverRecord).not.toBeNull();
      expect(driverUser).not.toBeNull();
      expect(driverUser?.driverId).toBe(driverAId);
    });

    it("deletes dispatcher, preserves PackageHistory with userId=null, invalidates session, and disconnects active socket", async () => {
      // Create a package using dispA1Token so a PackageHistory row references dispA1Id
      const pkgRes = await request(app)
        .post("/api/packages")
        .set("Authorization", `Bearer ${dispA1Token}`)
        .send({
          trackingCode: `USR-DEL-${runId}`,
          recipientName: "History Preserved Recipient",
          recipientAddress: "Av. Colon 100, Cordoba, Argentina",
          recipientPhone: "3515550000",
        });
      expect(pkgRes.status).toBe(201);
      const pkgId = pkgRes.body.id;

      const httpServer = http.createServer(app);
      const ioServer = initSocket(httpServer);
      await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
      const addr = httpServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const url = `http://127.0.0.1:${port}`;

      let dispSocket: ClientSocket | null = null;
      try {
        dispSocket = await new Promise<ClientSocket>((resolve, reject) => {
          const client = ioClient(url, {
            auth: { token: dispA1Token },
            transports: ["websocket"],
            reconnection: false,
          });
          client.on("connect", () => resolve(client));
          client.on("connect_error", reject);
        });
        await new Promise((r) => setTimeout(r, 40));

        const disconnectPromise = new Promise<void>((resolve) => {
          if (dispSocket!.disconnected) {
            resolve();
            return;
          }
          dispSocket!.once("disconnect", () => resolve());
        });

        const delRes = await request(app)
          .delete(`/api/users/${dispA1Id}`)
          .set("Authorization", `Bearer ${adminAToken}`);

        expect(delRes.status).toBe(200);
        expect(delRes.body).toMatchObject({
          ok: true,
          deletedUserId: dispA1Id,
          user: {
            id: dispA1Id,
            username: dispA1Username,
            role: "dispatcher",
          },
        });

        await disconnectPromise;
        expect(dispSocket.connected).toBe(false);

        // User removed from DB and GET /api/users
        const dbUser = await prisma.user.findUnique({ where: { id: dispA1Id } });
        expect(dbUser).toBeNull();

        const listAfter = await request(app)
          .get("/api/users")
          .set("Authorization", `Bearer ${adminAToken}`);
        expect(listAfter.status).toBe(200);
        expect(listAfter.body.items.map((u: any) => u.id)).not.toContain(dispA1Id);

        // Deleted user cannot log in or call /api/auth/me
        const loginAfter = await request(app).post("/api/auth/login").send({
          username: dispA1Username,
          password: "dispatcherPass123",
        });
        expect(loginAfter.status).toBe(401);

        const meAfter = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${dispA1Token}`);
        expect(meAfter.status).toBe(401);

        // PackageHistory preserved with userId set to null
        const histories = await prisma.packageHistory.findMany({
          where: { packageId: pkgId },
        });
        expect(histories.length).toBeGreaterThanOrEqual(1);
        expect(histories[0].userId).toBeNull();

        // Second delete returns 404
        const secondDelete = await request(app)
          .delete(`/api/users/${dispA1Id}`)
          .set("Authorization", `Bearer ${adminAToken}`);
        expect(secondDelete.status).toBe(404);
      } finally {
        dispSocket?.disconnect();
        await new Promise<void>((resolve) => ioServer.close(() => resolve()));
        if (httpServer.listening) {
          await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        }
      }
    });
  });

  describe("Swagger / OpenAPI documentation", () => {
    it("documents register-company, auth/me, and team users endpoints in /swagger.json", async () => {
      const res = await request(app).get("/swagger.json");
      expect(res.status).toBe(200);
      expect(res.body.paths["/api/auth/register-company"]?.post).toBeDefined();
      expect(res.body.paths["/api/auth/me"]?.get).toBeDefined();
      expect(res.body.paths["/api/users"]?.get).toBeDefined();
      expect(res.body.paths["/api/users"]?.post).toBeDefined();
      expect(res.body.paths["/api/users/{id}"]?.delete).toBeDefined();
    });
  });
});
