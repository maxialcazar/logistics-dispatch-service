import "dotenv/config";
import http from "http";
import request from "supertest";
import jwt from "jsonwebtoken";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
import { redis } from "../src/redis";
import { initSocket, getTenantConnectedClientCount } from "../src/websocket";

describe("GET /api/health", () => {
  it("should return 200 and status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/admin/metrics — RBAC, Multi-Tenant Isolation & System Scope", () => {
  const suffix = Date.now();
  let companyAId: string;
  let companyBId: string;
  let adminTokenA: string;
  let dispatcherTokenA: string;
  let driverTokenA: string;
  let adminTokenB: string;
  let systemTokenA: string;

  beforeAll(async () => {
    const regA = await request(app).post("/api/auth/register-company").send({
      companyName: "Metrics Co A",
      companySlug: `metrics-co-a-${suffix}`,
      username: `metrics_admin_a_${suffix}`,
      password: "securepass123",
    });
    expect(regA.status).toBe(201);
    companyAId = regA.body.company.id;

    const loginAdminA = await request(app).post("/api/auth/login").send({
      username: `metrics_admin_a_${suffix}`,
      password: "securepass123",
    });
    adminTokenA = loginAdminA.body.token;

    const dispRes = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminTokenA}`)
      .send({
        username: `metrics_disp_a_${suffix}`,
        password: "securepass123",
        role: "dispatcher",
      });
    expect(dispRes.status).toBe(201);

    const loginDispA = await request(app).post("/api/auth/login").send({
      username: `metrics_disp_a_${suffix}`,
      password: "securepass123",
    });
    dispatcherTokenA = loginDispA.body.token;

    const drvRes = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${adminTokenA}`)
      .send({
        name: "Metrics Driver A",
        username: `metrics_drv_a_${suffix}`,
        password: "securepass123",
      });
    expect(drvRes.status).toBe(201);

    const loginDrvA = await request(app).post("/api/auth/login").send({
      username: `metrics_drv_a_${suffix}`,
      password: "securepass123",
    });
    driverTokenA = loginDrvA.body.token;

    await prisma.zone.createMany({
      data: [
        { name: "Zone A Active", companyId: companyAId, isActive: true },
        { name: "Zone A Inactive", companyId: companyAId, isActive: false },
      ],
    });

    await prisma.package.createMany({
      data: [
        {
          trackingCode: `MET-A-1-${suffix}`,
          recipientName: "Pkg A1",
          recipientAddress: "Calle A 1",
          recipientPhone: "3511111111",
          status: "pending",
          companyId: companyAId,
        },
        {
          trackingCode: `MET-A-2-${suffix}`,
          recipientName: "Pkg A2",
          recipientAddress: "Calle A 2",
          recipientPhone: "3511111112",
          status: "in_transit",
          companyId: companyAId,
        },
        {
          trackingCode: `MET-A-ARCH-${suffix}`,
          recipientName: "Pkg A Archived",
          recipientAddress: "Calle A 3",
          recipientPhone: "3511111113",
          status: "delivered",
          isArchived: true,
          companyId: companyAId,
        },
      ],
    });

    const regB = await request(app).post("/api/auth/register-company").send({
      companyName: "Metrics Co B",
      companySlug: `metrics-co-b-${suffix}`,
      username: `metrics_admin_b_${suffix}`,
      password: "securepass123",
    });
    expect(regB.status).toBe(201);
    companyBId = regB.body.company.id;

    const loginAdminB = await request(app).post("/api/auth/login").send({
      username: `metrics_admin_b_${suffix}`,
      password: "securepass123",
    });
    adminTokenB = loginAdminB.body.token;

    await prisma.driver.createMany({
      data: [
        { name: "Driver B1", companyId: companyBId },
        { name: "Driver B2", companyId: companyBId },
      ],
    });
    await prisma.zone.create({
      data: { name: "Zone B Active", companyId: companyBId, isActive: true },
    });
    await prisma.package.create({
      data: {
        trackingCode: `MET-B-1-${suffix}`,
        recipientName: "Pkg B1",
        recipientAddress: "Calle B 1",
        recipientPhone: "3512222222",
        status: "delivered",
        companyId: companyBId,
      },
    });

    systemTokenA = jwt.sign(
      {
        userId: regA.body.user.id,
        role: "admin",
        driverId: null,
        companyId: companyAId,
        scope: "system",
      },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    );
  });

  afterAll(async () => {
    const companyIds = [companyAId, companyBId].filter(Boolean);
    if (companyIds.length > 0) {
      await prisma.packageHistory.deleteMany({
        where: { package: { companyId: { in: companyIds } } },
      });
      await prisma.package.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.zone.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.user.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.driver.deleteMany({
        where: { companyId: { in: companyIds } },
      });
      await prisma.company.deleteMany({
        where: { id: { in: companyIds } },
      });
    }
    await closeDatabase();
    await redis.disconnect();
  });

  it("returns 401 without token and 403 for driver role", async () => {
    const unauth = await request(app).get("/api/admin/metrics");
    expect(unauth.status).toBe(401);

    const forbidden = await request(app)
      .get("/api/admin/metrics")
      .set("Authorization", `Bearer ${driverTokenA}`);
    expect(forbidden.status).toBe(403);
  });

  it("allows admin and dispatcher to read strictly tenant-scoped operational metrics without global server internals", async () => {
    for (const token of [adminTokenA, dispatcherTokenA]) {
      const res = await request(app)
        .get("/api/admin/metrics")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.companyId).toBe(companyAId);
      expect(res.body.metrics.packages).toEqual({
        pending: 1,
        assigned: 0,
        in_transit: 1,
        delivered: 0,
        cancelled: 0,
        total: 2,
      });
      expect(res.body.metrics.drivers).toEqual({ total: 1 });
      expect(res.body.metrics.zones).toEqual({ total: 2, active: 1 });
      expect(res.body.metrics.websockets).toEqual({ connected_clients: 0 });
      expect(res.body.uptime).toBeUndefined();
      expect(res.body.resources).toBeUndefined();
      expect(res.body.components.redis).toBeUndefined();
      expect(res.body.components.database.latency_ms).toBeUndefined();
      expect(res.body.components.websockets.global_connected_clients).toBeUndefined();
    }
  });

  it("isolates metrics for Company B from Company A", async () => {
    const resB = await request(app)
      .get("/api/admin/metrics")
      .set("Authorization", `Bearer ${adminTokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.companyId).toBe(companyBId);
    expect(resB.body.metrics.packages).toEqual({
      pending: 0,
      assigned: 0,
      in_transit: 0,
      delivered: 1,
      cancelled: 0,
      total: 1,
    });
    expect(resB.body.metrics.drivers).toEqual({ total: 2 });
    expect(resB.body.metrics.zones).toEqual({ total: 1, active: 1 });
  });

  it("exposes global server metrics only when token has system scope", async () => {
    const resSys = await request(app)
      .get("/api/admin/metrics")
      .set("Authorization", `Bearer ${systemTokenA}`);

    expect(resSys.status).toBe(200);
    expect(resSys.body.companyId).toBe(companyAId);
    expect(typeof resSys.body.uptime).toBe("string");
    expect(resSys.body.resources).toEqual(
      expect.objectContaining({
        memory_rss_mb: expect.any(Number),
        memory_heap_mb: expect.any(Number),
      })
    );
    expect(typeof resSys.body.components.database.latency_ms).toBe("number");
    expect(resSys.body.components.redis).toEqual(
      expect.objectContaining({
        status: expect.any(String),
        latency_ms: expect.any(Number),
      })
    );
    expect(typeof resSys.body.components.websockets.global_connected_clients).toBe("number");
  });

  it("allows system and superadmin roles and rejects whitespace companyId tokens with 401", async () => {
    const whitespaceToken = jwt.sign(
      { userId: "u1", role: "admin", driverId: null, companyId: "   " },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    );
    const badRes = await request(app)
      .get("/api/admin/metrics")
      .set("Authorization", `Bearer ${whitespaceToken}`);
    expect(badRes.status).toBe(401);

    for (const sysRole of ["system", "superadmin"]) {
      const roleToken = jwt.sign(
        { userId: "sys-1", role: sysRole, driverId: null, companyId: companyAId },
        process.env.JWT_SECRET!,
        { expiresIn: "1h" }
      );
      const res = await request(app)
        .get("/api/admin/metrics")
        .set("Authorization", `Bearer ${roleToken}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.uptime).toBe("string");
      expect(typeof res.body.components.websockets.global_connected_clients).toBe("number");
    }
  });

  it("isolates live WebSocket client counts per tenant room while keeping global count system-only", async () => {
    const httpServer = http.createServer(app);
    const ioServer = initSocket(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const url = `http://127.0.0.1:${port}`;

    const connectClient = (token: string) =>
      new Promise<ClientSocket>((resolve, reject) => {
        const client = ioClient(url, {
          auth: { token },
          transports: ["websocket"],
          reconnection: false,
        });
        client.on("connect", () => resolve(client));
        client.on("connect_error", reject);
      });

    const clients: ClientSocket[] = [];
    try {
      clients.push(
        await connectClient(adminTokenA),
        await connectClient(dispatcherTokenA),
        await connectClient(adminTokenB)
      );

      await new Promise((r) => setTimeout(r, 30));

      expect(getTenantConnectedClientCount("")).toBe(0);
      expect(getTenantConnectedClientCount("   ")).toBe(0);

      const [resA, resB, resSys] = await Promise.all([
        request(app).get("/api/admin/metrics").set("Authorization", `Bearer ${adminTokenA}`),
        request(app).get("/api/admin/metrics").set("Authorization", `Bearer ${adminTokenB}`),
        request(app).get("/api/admin/metrics").set("Authorization", `Bearer ${systemTokenA}`),
      ]);

      expect(resA.status).toBe(200);
      expect(resA.body.metrics.websockets.connected_clients).toBe(2);
      expect(resA.body.components.websockets.global_connected_clients).toBeUndefined();

      expect(resB.status).toBe(200);
      expect(resB.body.metrics.websockets.connected_clients).toBe(1);
      expect(resB.body.components.websockets.global_connected_clients).toBeUndefined();

      expect(resSys.status).toBe(200);
      expect(resSys.body.metrics.websockets.connected_clients).toBe(2);
      expect(resSys.body.components.websockets.global_connected_clients).toBe(3);
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
