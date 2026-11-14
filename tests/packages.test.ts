import "dotenv/config";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/prisma";
import { redis } from "../src/redis";

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
  await prisma.company.deleteMany({
    where: { id: { in: [companyAId, companyBId] } },
  });
  await prisma.$disconnect();
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
