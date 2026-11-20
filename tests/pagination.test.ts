import "dotenv/config";
import request from "supertest";
import app from "../src/app";
import { closeDatabase, prisma } from "../src/prisma";
import { redis } from "../src/redis";
import { DriverService } from "../src/services/driver.service";
import { ZoneService } from "../src/services/zone.service";
import { PackageService } from "../src/services/package.service";
import logger from "../src/utils/logger";
import { sanitizePagination } from "../src/utils/pagination";

describe("sanitizePagination utility", () => {
  it("uses defaults when page or limit are missing or empty", () => {
    expect(sanitizePagination()).toEqual({ page: 1, limit: 10 });
    expect(sanitizePagination({})).toEqual({ page: 1, limit: 10 });
    expect(sanitizePagination({ page: "", limit: "" })).toEqual({ page: 1, limit: 10 });
  });

  it("falls back to defaults on NaN, non-numeric strings, and non-finite numbers", () => {
    expect(sanitizePagination({ page: "abc", limit: "xyz" })).toEqual({ page: 1, limit: 10 });
    expect(sanitizePagination({ page: "NaN", limit: "Infinity" })).toEqual({ page: 1, limit: 10 });
    expect(sanitizePagination({ page: Number.NaN, limit: Number.POSITIVE_INFINITY })).toEqual({
      page: 1,
      limit: 10,
    });
    expect(sanitizePagination({ page: "9".repeat(400), limit: "9".repeat(400) })).toEqual({
      page: 1,
      limit: 10,
    });
  });

  it("clamps negative values and handles zero safely", () => {
    expect(sanitizePagination({ page: "-5", limit: "-10" })).toEqual({ page: 1, limit: 1 });
    expect(sanitizePagination({ page: -3, limit: -1 })).toEqual({ page: 1, limit: 1 });
    expect(sanitizePagination({ page: "0", limit: "0" })).toEqual({ page: 1, limit: 10 });
    expect(sanitizePagination({ page: 0, limit: 0 })).toEqual({ page: 1, limit: 10 });
  });

  it("caps limit at 100 to prevent excessive queries", () => {
    expect(sanitizePagination({ page: "2", limit: "101" })).toEqual({ page: 2, limit: 100 });
    expect(sanitizePagination({ page: "3", limit: "1000000" })).toEqual({ page: 3, limit: 100 });
    expect(sanitizePagination({ page: 4, limit: 500 })).toEqual({ page: 4, limit: 100 });
    expect(sanitizePagination({ page: "1", limit: "100" })).toEqual({ page: 1, limit: 100 });
  });

  it("truncates decimal values and ignores arrays or nested objects", () => {
    expect(sanitizePagination({ page: "3.9", limit: "25.7" })).toEqual({ page: 3, limit: 25 });
    expect(sanitizePagination({ page: 2.8, limit: 15.4 })).toEqual({ page: 2, limit: 15 });
    expect(sanitizePagination({ page: ["2", "3"], limit: { nested: "5" } })).toEqual({
      page: 1,
      limit: 10,
    });
  });
});

describe("Pagination sanitization and try/catch error handling on list endpoints", () => {
  const suffix = Date.now();
  let companyId: string;
  let token: string;

  beforeAll(async () => {
    const reg = await request(app).post("/api/auth/register-company").send({
      companyName: "Pagination Test Co",
      companySlug: `pagination-co-${suffix}`,
      username: `pagination_admin_${suffix}`,
      password: "securepassword123",
    });
    expect(reg.status).toBe(201);
    companyId = reg.body.company.id;

    const login = await request(app).post("/api/auth/login").send({
      username: `pagination_admin_${suffix}`,
      password: "securepassword123",
    });
    expect(login.status).toBe(200);
    token = login.body.token;

    await Promise.all([
      prisma.driver.create({ data: { name: "Driver One", companyId } }),
      prisma.driver.create({ data: { name: "Driver Two", companyId } }),
      prisma.zone.create({ data: { name: "Zone One", companyId } }),
      prisma.zone.create({ data: { name: "Zone Two", companyId } }),
      prisma.package.create({
        data: {
          trackingCode: `PAG-1-${suffix}`,
          recipientName: "Recipient One",
          recipientAddress: "Street 100",
          recipientPhone: "1111111111",
          companyId,
        },
      }),
      prisma.package.create({
        data: {
          trackingCode: `PAG-2-${suffix}`,
          recipientName: "Recipient Two",
          recipientAddress: "Street 200",
          recipientPhone: "2222222222",
          companyId,
        },
      }),
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (companyId) {
      await redis.delPrefix(`drivers:${companyId}:`);
      await redis.delPrefix(`zones:${companyId}:`);
      await prisma.packageHistory.deleteMany({ where: { package: { companyId } } });
      await prisma.package.deleteMany({ where: { companyId } });
      await prisma.zone.updateMany({ where: { companyId }, data: { driverId: null } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.driver.deleteMany({ where: { companyId } });
      await prisma.zone.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
    }
    await closeDatabase();
    await redis.disconnect();
  });

  const endpoints = ["/api/drivers", "/api/zones", "/api/packages"] as const;

  it.each(endpoints)(
    "GET %s sanitizes NaN, negative, zero, and >100 pagination parameters without 500",
    async (endpoint) => {
      const nanRes = await request(app)
        .get(`${endpoint}?page=abc&limit=notanumber`)
        .set("Authorization", `Bearer ${token}`);
      expect(nanRes.status).toBe(200);
      expect(nanRes.body.meta.page).toBe(1);
      expect(nanRes.body.meta.limit).toBe(10);

      const negRes = await request(app)
        .get(`${endpoint}?page=-5&limit=-20`)
        .set("Authorization", `Bearer ${token}`);
      expect(negRes.status).toBe(200);
      expect(negRes.body.meta.page).toBe(1);
      expect(negRes.body.meta.limit).toBe(1);
      expect(negRes.body.items).toHaveLength(1);

      const zeroRes = await request(app)
        .get(`${endpoint}?page=0&limit=0`)
        .set("Authorization", `Bearer ${token}`);
      expect(zeroRes.status).toBe(200);
      expect(zeroRes.body.meta.page).toBe(1);
      expect(zeroRes.body.meta.limit).toBe(10);

      const hugeLimitRes = await request(app)
        .get(`${endpoint}?page=1&limit=999999`)
        .set("Authorization", `Bearer ${token}`);
      expect(hugeLimitRes.status).toBe(200);
      expect(hugeLimitRes.body.meta.page).toBe(1);
      expect(hugeLimitRes.body.meta.limit).toBe(100);

      const validRes = await request(app)
        .get(`${endpoint}?page=2&limit=1`)
        .set("Authorization", `Bearer ${token}`);
      expect(validRes.status).toBe(200);
      expect(validRes.body.meta.page).toBe(2);
      expect(validRes.body.meta.limit).toBe(1);
      expect(validRes.body.items).toHaveLength(1);
    }
  );

  it("catches service errors in getDrivers, getZones, and getPackages and returns sanitized 500 JSON", async () => {
    const loggerSpy = jest.spyOn(logger, "error").mockImplementation(() => logger);

    jest.spyOn(DriverService, "getAllDrivers").mockRejectedValueOnce(new Error("sensitive driver db failure"));
    const drvErr = await request(app).get("/api/drivers").set("Authorization", `Bearer ${token}`);
    expect(drvErr.status).toBe(500);
    expect(drvErr.body).toEqual({ error: "Internal Server Error" });

    jest.spyOn(ZoneService, "getAllZones").mockRejectedValueOnce(new Error("sensitive zone db failure"));
    const zoneErr = await request(app).get("/api/zones").set("Authorization", `Bearer ${token}`);
    expect(zoneErr.status).toBe(500);
    expect(zoneErr.body).toEqual({ error: "Internal Server Error" });

    jest.spyOn(PackageService, "getAllPackages").mockRejectedValueOnce(new Error("sensitive pkg db failure"));
    const pkgErr = await request(app).get("/api/packages").set("Authorization", `Bearer ${token}`);
    expect(pkgErr.status).toBe(500);
    expect(pkgErr.body).toEqual({ error: "Internal Server Error" });

    expect(loggerSpy).toHaveBeenCalledTimes(3);
  });
});
