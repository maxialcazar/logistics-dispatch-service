import "dotenv/config";
import http from "http";
import request from "supertest";
import jwt from "jsonwebtoken";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import app from "../src/app";
import { prisma } from "../src/prisma";
import { z } from "zod";
import { redis } from "../src/redis";
import { initSocket, getGlobalConnectedClientCount } from "../src/websocket";
import { validate } from "../src/middlewares/validate.middleware";
import { errorHandler, redactSensitiveFields } from "../src/middlewares/error.middleware";
import logger from "../src/utils/logger";

// ─── Test Fixtures ────────────────────────────────────────────────────────────
const COMPANY_SLUG = `test-auth-${Date.now()}`;
const ADMIN_USER = { username: `admin_${Date.now()}`, password: "securepassword123" };

let createdCompanyId: string | null = null;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
  // Register a test company + admin user via the API
  const res = await request(app).post("/api/auth/register-company").send({
    companyName: "Auth Test Company",
    companySlug: COMPANY_SLUG,
    username: ADMIN_USER.username,
    password: ADMIN_USER.password,
  });
  expect(res.status).toBe(201);
  createdCompanyId = res.body.company?.id ?? null;
});

afterAll(async () => {
  // Clean up: delete user → driver → company (order matters for FK constraints)
  if (createdCompanyId) {
    await prisma.user.deleteMany({ where: { companyId: createdCompanyId } });
    await prisma.driver.deleteMany({ where: { companyId: createdCompanyId } });
    await prisma.company.delete({ where: { id: createdCompanyId } }).catch(() => {});
  }
  await prisma.$disconnect();
  await redis.disconnect();
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("should return 200 and a JWT token on valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send(ADMIN_USER);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.username).toBe(ADMIN_USER.username);
    expect(res.body.user.role).toBe("admin");
    expect(res.body.user.companyId).toBeDefined();
    // Security: password must NOT be returned
    expect(res.body.user.password).toBeUndefined();
  });

  it("should return 401 on wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      username: ADMIN_USER.username,
      password: "wrongpassword",
    });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it("should return 401 on non-existent username", async () => {
    const res = await request(app).post("/api/auth/login").send({
      username: "user_that_does_not_exist",
      password: "anypassword",
    });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it("should return 400 if username is missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("should return 400 if password is too short", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "user", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

// ─── POST /api/auth/register-company ─────────────────────────────────────────
describe("POST /api/auth/register-company", () => {
  it("should return 409 when slug is already taken", async () => {
    const res = await request(app).post("/api/auth/register-company").send({
      companyName: "Duplicate Company",
      companySlug: COMPANY_SLUG, // Already exists
      username: `other_user_${Date.now()}`,
      password: "securepassword123",
    });
    expect(res.status).toBe(409);
  });

  it("should return 409 when username is already taken", async () => {
    const res = await request(app).post("/api/auth/register-company").send({
      companyName: "Another Company",
      companySlug: `new-slug-${Date.now()}`,
      username: ADMIN_USER.username, // Already exists
      password: "securepassword123",
    });
    expect(res.status).toBe(409);
  });

  it("should return 400 when companySlug has invalid format", async () => {
    const res = await request(app).post("/api/auth/register-company").send({
      companyName: "Invalid Slug Co",
      companySlug: "Invalid Slug!",
      username: `valid_user_${Date.now()}`,
      password: "securepassword123",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("should return 400 when password is too short", async () => {
    const res = await request(app).post("/api/auth/register-company").send({
      companyName: "Short Pass Co",
      companySlug: `short-pass-${Date.now()}`,
      username: `valid_user2_${Date.now()}`,
      password: "123",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

// ─── PUT /api/users/password ──────────────────────────────────────────────────
describe("PUT /api/users/password", () => {
  let token: string;

  beforeAll(async () => {
    const loginRes = await request(app).post("/api/auth/login").send(ADMIN_USER);
    token = loginRes.body.token;
  });

  it("should return 400 if currentPassword is missing", async () => {
    const res = await request(app)
      .put("/api/users/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "StrongPassword1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("should return 400 if newPassword is weak", async () => {
    const res = await request(app)
      .put("/api/users/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: ADMIN_USER.password, newPassword: "weak" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("should return 401 if currentPassword is incorrect", async () => {
    const res = await request(app)
      .put("/api/users/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrongCurrentPassword", newPassword: "StrongPassword1" });
    expect(res.status).toBe(401);
  });

  it("should return 200 and update password when currentPassword is valid and newPassword is strong", async () => {
    const newPassword = "StrongPassword1";
    const res = await request(app)
      .put("/api/users/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: ADMIN_USER.password, newPassword });
    expect(res.status).toBe(200);

    const loginRes = await request(app).post("/api/auth/login").send({
      username: ADMIN_USER.username,
      password: newPassword,
    });
    expect(loginRes.status).toBe(200);
  });
});

// ─── Middleware Security — Payload Redaction ──────────────────────────────────
describe("Middleware Security — Payload Redaction", () => {
  it("validate middleware should not log Original Payload or password on Zod failure", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const schema = z.object({
      body: z.object({
        username: z.string(),
        password: z.string().min(8),
      }),
      query: z.any().optional(),
      params: z.any().optional(),
    });

    const req = {
      body: { username: "alice", password: "sec123" },
      query: {},
      params: {},
    } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    validate(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const allLoggedText = consoleSpy.mock.calls.flat().join(" ");
    expect(allLoggedText).not.toContain("Original Payload");
    expect(allLoggedText).not.toContain("sec123");
    consoleSpy.mockRestore();
  });

  it("redactSensitiveFields and errorHandler should redact sensitive keys including nested objects", () => {
    const payload = {
      username: "bob",
      password: "plainPassword",
      currentPassword: "oldPassword",
      newPassword: "newPassword123",
      signature: "data:image/png;base64,abc",
      photo: "data:image/jpeg;base64,xyz",
      nested: {
        password: "nestedPassword",
        note: "keep-me",
      },
    };

    const redacted = redactSensitiveFields(payload) as any;
    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.currentPassword).toBe("[REDACTED]");
    expect(redacted.newPassword).toBe("[REDACTED]");
    expect(redacted.signature).toBe("[REDACTED]");
    expect(redacted.photo).toBe("[REDACTED]");
    expect(redacted.nested.password).toBe("[REDACTED]");
    expect(redacted.nested.note).toBe("keep-me");
    expect(redacted.username).toBe("bob");

    const loggerSpy = jest.spyOn(logger, "error").mockImplementation((() => logger) as any);
    const req = { method: "POST", url: "/api/test", body: payload } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    errorHandler(new Error("Boom"), req, res, next);

    expect(loggerSpy).toHaveBeenCalledTimes(1);
    const loggedMeta = (loggerSpy.mock.calls[0] as any[])[1];
    expect(loggedMeta.body.password).toBe("[REDACTED]");
    expect(loggedMeta.body.currentPassword).toBe("[REDACTED]");
    expect(loggedMeta.body.newPassword).toBe("[REDACTED]");
    expect(loggedMeta.body.signature).toBe("[REDACTED]");
    expect(loggedMeta.body.photo).toBe("[REDACTED]");
    expect(loggedMeta.body.nested.password).toBe("[REDACTED]");
    expect(loggedMeta.body.nested.note).toBe("keep-me");
    loggerSpy.mockRestore();
  });
});

// ─── POST /api/users ──────────────────────────────────────────────────────────
describe("POST /api/users", () => {
  let adminToken: string;
  let dispatcherUsername: string;
  const dispatcherPassword = "dispatcherPass123";

  beforeAll(async () => {
    dispatcherUsername = `disp_${Date.now()}`;
    let loginRes = await request(app).post("/api/auth/login").send({
      username: ADMIN_USER.username,
      password: "StrongPassword1",
    });
    if (loginRes.status !== 200) {
      loginRes = await request(app).post("/api/auth/login").send(ADMIN_USER);
    }
    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.token;
  });

  it("should return 201 when admin creates a dispatcher without exposing password", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        username: dispatcherUsername,
        password: dispatcherPassword,
        role: "dispatcher",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.username).toBe(dispatcherUsername);
    expect(res.body.role).toBe("dispatcher");
    expect(res.body.companyId).toBe(createdCompanyId);
    expect(res.body.password).toBeUndefined();
  });

  it("should return 409 when username already exists", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        username: dispatcherUsername,
        password: dispatcherPassword,
        role: "dispatcher",
      });

    expect(res.status).toBe(409);
  });

  it("should return 403 when a dispatcher attempts to create a user", async () => {
    const dispLogin = await request(app).post("/api/auth/login").send({
      username: dispatcherUsername,
      password: dispatcherPassword,
    });
    expect(dispLogin.status).toBe(200);

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${dispLogin.body.token}`)
      .send({
        username: `unauth_disp_${Date.now()}`,
        password: "dispatcherPass123",
        role: "dispatcher",
      });

    expect(res.status).toBe(403);
  });

  it("should return 400 when attempting to create a driver user without Driver profile", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        username: `orphan_driver_${Date.now()}`,
        password: "driverPass123",
        role: "driver",
      });

    expect(res.status).toBe(400);
  });
});

// ─── WebSocket Security, CORS_ORIGIN & JWT username ──────────────────────────
describe("WebSocket Security, CORS_ORIGIN & JWT username", () => {
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (originalCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = originalCorsOrigin;
    }
  });

  it("includes username in the JWT payload issued by POST /api/auth/login", async () => {
    let res = await request(app).post("/api/auth/login").send({
      username: ADMIN_USER.username,
      password: "StrongPassword1",
    });
    if (res.status !== 200) {
      res = await request(app).post("/api/auth/login").send(ADMIN_USER);
    }
    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET!) as Record<string, any>;
    expect(decoded.username).toBe(ADMIN_USER.username);
    expect(decoded.companyId).toBe(createdCompanyId);
  });

  it("configures Socket.IO cors.origin from CORS_ORIGIN instead of hardcoded wildcard", async () => {
    delete process.env.CORS_ORIGIN;
    const s1 = http.createServer(app);
    const ioDefault = initSocket(s1);
    expect((ioDefault as any).opts.cors.origin).toEqual([
      "http://localhost:5173",
      "http://localhost:8080",
    ]);
    await new Promise<void>((resolve) => ioDefault.close(() => resolve()));

    process.env.CORS_ORIGIN = "https://ops.example.com, https://dispatch.example.com";
    const s2 = http.createServer(app);
    const ioEnv = initSocket(s2);
    expect((ioEnv as any).opts.cors.origin).toEqual([
      "https://ops.example.com",
      "https://dispatch.example.com",
    ]);
    await new Promise<void>((resolve) => ioEnv.close(() => resolve()));
  });

  it("disconnects sockets without token or with invalid JWT and emits driver name from JWT username", async () => {
    delete process.env.CORS_ORIGIN;
    let adminLogin = await request(app).post("/api/auth/login").send({
      username: ADMIN_USER.username,
      password: "StrongPassword1",
    });
    if (adminLogin.status !== 200) {
      adminLogin = await request(app).post("/api/auth/login").send(ADMIN_USER);
    }
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.token;

    const driverUsername = `ws_driver_${Date.now()}`;
    const driverPass = "driverPass123";
    const drvCreate = await request(app)
      .post("/api/drivers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "WS Driver", username: driverUsername, password: driverPass });
    expect(drvCreate.status).toBe(201);
    const driverId = drvCreate.body.id;

    const drvLogin = await request(app).post("/api/auth/login").send({
      username: driverUsername,
      password: driverPass,
    });
    expect(drvLogin.status).toBe(200);
    const driverToken = drvLogin.body.token;
    const decodedDrv = jwt.verify(driverToken, process.env.JWT_SECRET!) as Record<string, any>;
    expect(decodedDrv.username).toBe(driverUsername);

    const httpServer = http.createServer(app);
    const ioServer = initSocket(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const url = `http://127.0.0.1:${port}`;

    const waitForForcedDisconnect = (authPayload?: Record<string, any>) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Socket was not disconnected")), 3000);
        const client = ioClient(url, {
          ...(authPayload ? { auth: authPayload } : {}),
          transports: ["websocket"],
          reconnection: false,
        });
        client.on("disconnect", () => {
          clearTimeout(timer);
          client.close();
          resolve();
        });
        client.on("connect_error", (err) => {
          clearTimeout(timer);
          client.close();
          reject(err);
        });
      });

    const clients: ClientSocket[] = [];
    try {
      await waitForForcedDisconnect();
      await waitForForcedDisconnect({ token: "not.a.valid.jwt" });
      const missingClaimsToken = jwt.sign(
        { userId: "u-only", role: "driver" },
        process.env.JWT_SECRET!,
        { expiresIn: "1h" }
      );
      await waitForForcedDisconnect({ token: missingClaimsToken });

      await new Promise((r) => setTimeout(r, 30));
      expect(getGlobalConnectedClientCount()).toBe(0);

      const adminClient = await new Promise<ClientSocket>((resolve, reject) => {
        const c = ioClient(url, {
          auth: { token: adminToken },
          transports: ["websocket"],
          reconnection: false,
        });
        c.on("connect", () => resolve(c));
        c.on("connect_error", reject);
      });
      clients.push(adminClient);
      await new Promise((r) => setTimeout(r, 30));

      const statusEvents: any[] = [];
      let resolveOnline!: () => void;
      let resolveOffline!: () => void;
      const onlinePromise = new Promise<void>((resolve) => {
        resolveOnline = resolve;
      });
      const offlinePromise = new Promise<void>((resolve) => {
        resolveOffline = resolve;
      });
      adminClient.on("driver-status-updated", (evt: any) => {
        statusEvents.push(evt);
        if (evt.status === "online") resolveOnline();
        if (evt.status === "offline") resolveOffline();
      });

      const driverClient = await new Promise<ClientSocket>((resolve, reject) => {
        const c = ioClient(url, {
          auth: { token: driverToken },
          transports: ["websocket"],
          reconnection: false,
        });
        c.on("connect", () => resolve(c));
        c.on("connect_error", reject);
      });
      clients.push(driverClient);

      await onlinePromise;
      expect(statusEvents[0]).toEqual({
        driverId,
        status: "online",
        name: driverUsername,
      });

      driverClient.disconnect();
      await offlinePromise;

      expect(statusEvents[1]).toEqual({
        driverId,
        status: "offline",
        name: driverUsername,
      });
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
