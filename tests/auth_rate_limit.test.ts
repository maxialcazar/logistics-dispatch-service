import "dotenv/config";
import request from "supertest";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
import { redis } from "../src/redis";

describe("Trust proxy & strict auth rate limiters", () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminUser = {
    username: `rl_admin_${runId}`,
    password: "securePassword123",
  };
  const baseCompanySlug = `rl-company-${runId}`;
  const createdCompanyIds: string[] = [];

  beforeAll(async () => {
    const reg = await request(app)
      .post("/api/auth/register-company")
      .set("X-Forwarded-For", "192.0.2.1")
      .send({
        companyName: "Rate Limit Test Co",
        companySlug: baseCompanySlug,
        username: adminUser.username,
        password: adminUser.password,
      });

    expect(reg.status).toBe(201);
    if (reg.body.company?.id) {
      createdCompanyIds.push(reg.body.company.id);
    }
  });

  afterAll(async () => {
    if (createdCompanyIds.length > 0) {
      await prisma.user.deleteMany({
        where: { companyId: { in: createdCompanyIds } },
      });
      await prisma.driver.deleteMany({
        where: { companyId: { in: createdCompanyIds } },
      });
      await prisma.company.deleteMany({
        where: { id: { in: createdCompanyIds } },
      });
    }
    await closeDatabase();
    await redis.disconnect();
  });

  it("configures app trust proxy to 1 hop", () => {
    expect(app.get("trust proxy")).toBe(1);
  });

  it("blocks brute-force attempts on POST /api/auth/login with 429, resists X-Forwarded-For spoofing, and isolates distinct client IPs", async () => {
    const attackerIp = "203.0.113.11";
    const innocentIp = "203.0.113.12";

    // First 10 failed login attempts from attackerIp are allowed up to the limit
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", attackerIp)
        .send({
          username: adminUser.username,
          password: `wrong_pass_${i}`,
        });

      expect(res.status).toBe(401);
      expect(res.headers["ratelimit-limit"]).toBe("10");
      expect(res.headers["ratelimit-remaining"]).toBe(String(9 - i));
    }

    // 11th attempt from attackerIp is blocked with 429 even with valid credentials
    const blockedRes = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", attackerIp)
      .send(adminUser);

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body).toEqual({
      error: "Too many login attempts, please try again later.",
    });
    expect(blockedRes.headers["ratelimit-remaining"]).toBe("0");

    // Prepending a spoofed client IP before the proxy-appended IP cannot bypass trust proxy = 1
    const spoofedRes = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", `198.51.100.99, ${attackerIp}`)
      .send(adminUser);

    expect(spoofedRes.status).toBe(429);

    // Another client IP behind the same reverse proxy is unaffected
    const innocentRes = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", innocentIp)
      .send(adminUser);

    expect(innocentRes.status).toBe(200);
    expect(innocentRes.body.token).toBeDefined();
  });

  it("does not lock out legitimate successful logins on POST /api/auth/login", async () => {
    const legitimateIp = "203.0.113.13";

    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", legitimateIp)
        .send(adminUser);

      expect(res.status).toBe(200);
    }
  });

  it("enforces strict rate limit on POST /api/auth/register-company (including 201s) and keeps login bucket separate", async () => {
    const registerIp = "203.0.113.20";
    const otherRegisterIp = "203.0.113.21";

    // 1st call succeeds (201) and consumes 1 slot from the registration quota
    const createdRes = await request(app)
      .post("/api/auth/register-company")
      .set("X-Forwarded-For", registerIp)
      .send({
        companyName: "Rate Limit Second Co",
        companySlug: `${baseCompanySlug}-second`,
        username: `rl_admin_second_${runId}`,
        password: "securePassword123",
      });

    expect(createdRes.status).toBe(201);
    if (createdRes.body.company?.id) {
      createdCompanyIds.push(createdRes.body.company.id);
    }
    expect(createdRes.headers["ratelimit-limit"]).toBe("10");
    expect(createdRes.headers["ratelimit-remaining"]).toBe("9");

    // Next 9 registration attempts from registerIp consume the remaining quota
    for (let i = 0; i < 9; i++) {
      const res = await request(app)
        .post("/api/auth/register-company")
        .set("X-Forwarded-For", registerIp)
        .send({
          companyName: "Duplicate Co",
          companySlug: baseCompanySlug,
          username: `rl_dup_${i}_${runId}`,
          password: "securePassword123",
        });

      expect(res.status).toBe(409);
      expect(res.headers["ratelimit-remaining"]).toBe(String(8 - i));
    }

    // 11th registration attempt from registerIp returns 429 before validation/controller
    const blockedRegRes = await request(app)
      .post("/api/auth/register-company")
      .set("X-Forwarded-For", registerIp)
      .send({});

    expect(blockedRegRes.status).toBe(429);
    expect(blockedRegRes.body).toEqual({
      error: "Too many registration attempts, please try again later.",
    });

    // Different client IP can still reach /register-company
    const otherIpRes = await request(app)
      .post("/api/auth/register-company")
      .set("X-Forwarded-For", otherRegisterIp)
      .send({
        companyName: "Duplicate Co",
        companySlug: baseCompanySlug,
        username: `rl_other_${runId}`,
        password: "securePassword123",
      });

    expect(otherIpRes.status).toBe(409);

    // registerIp being throttled on /register-company does not block /login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .set("X-Forwarded-For", registerIp)
      .send(adminUser);

    expect(loginRes.status).toBe(200);
  });
});
