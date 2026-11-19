import "dotenv/config";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import { z } from "zod";
import { redis } from "../src/redis";
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
  // Clean up: delete user → company (order matters for FK constraints)
  if (createdCompanyId) {
    await prisma.user.deleteMany({ where: { companyId: createdCompanyId } });
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
