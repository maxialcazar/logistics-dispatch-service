describe("Infrastructure lifecycle unit tests", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		jest.resetModules();
		jest.restoreAllMocks();
		process.env = { ...originalEnv };
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	describe("redis.delPrefix iterative SCAN", () => {
		function setupRedisWithMockClient(options?: {
			enabled?: boolean;
			isOpen?: boolean;
		}) {
			const enabled = options?.enabled ?? true;
			const isOpen = options?.isOpen ?? true;
			process.env.REDIS_ENABLED = enabled ? "true" : "false";

			const mockClient = {
				isOpen,
				on: jest.fn(),
				connect: jest.fn().mockResolvedValue(undefined),
				quit: jest.fn().mockResolvedValue(undefined),
				scan: jest.fn(),
				unlink: jest.fn().mockResolvedValue(0),
				keys: jest.fn(),
			};

			jest.doMock("redis", () => ({
				createClient: jest.fn(() => mockClient),
			}));
			jest.spyOn(console, "log").mockImplementation(() => {});

			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { redis } = require("../src/redis") as typeof import("../src/redis");
			return { redis, mockClient };
		}

		it("scanKeys collects deduplicated keys across multiple SCAN cursor pages", async () => {
			const { redis, mockClient } = setupRedisWithMockClient();

			mockClient.scan
				.mockResolvedValueOnce({ cursor: "7", keys: ["drivers:c1:a", "drivers:c1:b"] })
				.mockResolvedValueOnce({ cursor: "0", keys: ["drivers:c1:b", "drivers:c1:c"] });

			const keys = await redis.scanKeys("drivers:c1:*");

			expect(mockClient.scan).toHaveBeenCalledTimes(2);
			expect(keys).toEqual(["drivers:c1:a", "drivers:c1:b", "drivers:c1:c"]);
		});

		it("iterates across multiple SCAN cursor pages, skips empty intermediate pages, and never calls client.keys", async () => {
			const { redis, mockClient } = setupRedisWithMockClient();

			mockClient.scan
				.mockResolvedValueOnce({ cursor: "14", keys: ["drivers:c1:a", "drivers:c1:b"] })
				.mockResolvedValueOnce({ cursor: "29", keys: [] })
				.mockResolvedValueOnce({ cursor: "0", keys: ["drivers:c1:c"] });

			await redis.delPrefix("drivers:c1:");

			expect(mockClient.keys).not.toHaveBeenCalled();
			expect(mockClient.scan).toHaveBeenCalledTimes(3);
			expect(mockClient.scan).toHaveBeenNthCalledWith(1, "0", {
				MATCH: "drivers:c1:*",
				COUNT: 100,
			});
			expect(mockClient.scan).toHaveBeenNthCalledWith(2, "14", {
				MATCH: "drivers:c1:*",
				COUNT: 100,
			});
			expect(mockClient.scan).toHaveBeenNthCalledWith(3, "29", {
				MATCH: "drivers:c1:*",
				COUNT: 100,
			});

			expect(mockClient.unlink).toHaveBeenCalledTimes(2);
			expect(mockClient.unlink).toHaveBeenNthCalledWith(1, ["drivers:c1:a", "drivers:c1:b"]);
			expect(mockClient.unlink).toHaveBeenNthCalledWith(2, ["drivers:c1:c"]);
		});

		it("handles 0 matching keys without calling client.unlink", async () => {
			const { redis, mockClient } = setupRedisWithMockClient();

			mockClient.scan.mockResolvedValueOnce({ cursor: "0", keys: [] });

			await redis.delPrefix("drivers:missing:");

			expect(mockClient.keys).not.toHaveBeenCalled();
			expect(mockClient.scan).toHaveBeenCalledTimes(1);
			expect(mockClient.scan).toHaveBeenCalledWith("0", {
				MATCH: "drivers:missing:*",
				COUNT: 100,
			});
			expect(mockClient.unlink).not.toHaveBeenCalled();
		});

		it("chunks large SCAN pages into bounded UNLINK batches", async () => {
			const { redis, mockClient } = setupRedisWithMockClient();
			const largePage = Array.from({ length: 1200 }, (_, i) => `zones:c1:${i}`);

			mockClient.scan.mockResolvedValueOnce({ cursor: "0", keys: largePage });

			await redis.delPrefix("zones:c1:");

			expect(mockClient.unlink).toHaveBeenCalledTimes(3);
			expect(mockClient.unlink.mock.calls[0][0]).toHaveLength(500);
			expect(mockClient.unlink.mock.calls[1][0]).toHaveLength(500);
			expect(mockClient.unlink.mock.calls[2][0]).toHaveLength(200);
		});

		it("no-ops when REDIS_ENABLED is false or client is not open", async () => {
			const disabled = setupRedisWithMockClient({ enabled: false, isOpen: true });
			await disabled.redis.delPrefix("drivers:c1:");
			expect(disabled.mockClient.scan).not.toHaveBeenCalled();
			expect(disabled.mockClient.unlink).not.toHaveBeenCalled();

			jest.resetModules();
			const closed = setupRedisWithMockClient({ enabled: true, isOpen: false });
			await closed.redis.delPrefix("drivers:c1:");
			expect(closed.mockClient.scan).not.toHaveBeenCalled();
			expect(closed.mockClient.unlink).not.toHaveBeenCalled();
		});

		it("swallows and logs Redis errors without throwing", async () => {
			const { redis, mockClient } = setupRedisWithMockClient();
			const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
			mockClient.scan.mockRejectedValueOnce(new Error("READONLY"));

			await expect(redis.delPrefix("drivers:c1:")).resolves.toBeUndefined();
			expect(consoleErrorSpy).toHaveBeenCalled();
		});
	});

	describe("src/prisma.ts pool export and closeDatabase", () => {
		function setupMockPrismaModule(options?: {
			disconnectError?: Error;
			poolEnded?: boolean;
		}) {
			const mockPool = {
				ended: options?.poolEnded ?? false,
				ending: false,
				end: jest.fn().mockResolvedValue(undefined),
			};
			const mockPrisma = {
				$disconnect: options?.disconnectError
					? jest.fn().mockRejectedValue(options.disconnectError)
					: jest.fn().mockResolvedValue(undefined),
			};

			jest.doMock("pg", () => ({
				Pool: jest.fn(() => mockPool),
			}));
			jest.doMock("@prisma/adapter-pg", () => ({
				PrismaPg: jest.fn(() => ({})),
			}));
			jest.doMock("@prisma/client", () => ({
				PrismaClient: jest.fn(() => mockPrisma),
			}));
			jest.doMock("dotenv", () => ({
				default: { config: jest.fn() },
				config: jest.fn(),
			}));

			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const mod = require("../src/prisma") as typeof import("../src/prisma");
			return { ...mod, mockPool, mockPrisma };
		}

		it("exports pg Pool and closes Prisma + Pool idempotently", async () => {
			const { pool, closeDatabase, mockPool, mockPrisma } = setupMockPrismaModule();

			expect(pool).toBe(mockPool);

			await Promise.all([closeDatabase(), closeDatabase()]);

			expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
			expect(mockPool.end).toHaveBeenCalledTimes(1);
		});

		it("still closes pg Pool when prisma.$disconnect rejects", async () => {
			const err = new Error("disconnect boom");
			const { closeDatabase, mockPool, mockPrisma } = setupMockPrismaModule({
				disconnectError: err,
			});

			await expect(closeDatabase()).rejects.toThrow("disconnect boom");
			expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
			expect(mockPool.end).toHaveBeenCalledTimes(1);
		});

		it("skips pool.end when pool is already ended", async () => {
			const { closeDatabase, mockPool, mockPrisma } = setupMockPrismaModule({
				poolEnded: true,
			});

			await closeDatabase();

			expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
			expect(mockPool.end).not.toHaveBeenCalled();
		});
	});

	describe("src/index.ts sync interval and gracefulShutdown", () => {
		function setupIndexWithMocks(overrides?: {
			closeDatabaseImpl?: () => Promise<void>;
			redisDisconnectImpl?: () => Promise<void>;
			eventBusCloseImpl?: () => Promise<void>;
		}) {
			const callOrder: string[] = [];
			const mockIo = {
				close: jest.fn((cb?: (err?: Error) => void) => {
					callOrder.push("io.close");
					cb?.();
				}),
			};
			const mockCloseDatabase = jest.fn(async () => {
				callOrder.push("closeDatabase");
				if (overrides?.closeDatabaseImpl) {
					await overrides.closeDatabaseImpl();
				}
			});
			const mockRedisDisconnect = jest.fn(async () => {
				callOrder.push("redis.disconnect");
				if (overrides?.redisDisconnectImpl) {
					await overrides.redisDisconnectImpl();
				}
			});
			const mockEventBus = {
				init: jest.fn(),
				close: jest.fn(async () => {
					callOrder.push("eventBus.close");
					if (overrides?.eventBusCloseImpl) {
						await overrides.eventBusCloseImpl();
					}
				}),
			};
			const mockDriverService = {
				waitForActiveSync: jest.fn(async () => {
					callOrder.push("waitForActiveSync");
				}),
				syncLocationBuffer: jest.fn(async () => {
					callOrder.push("syncLocationBuffer");
				}),
			};

			jest.doMock("../src/app", () => ({
				__esModule: true,
				default: jest.fn(),
			}));
			jest.doMock("../src/prisma", () => ({
				closeDatabase: mockCloseDatabase,
				pool: { end: jest.fn() },
				prisma: { $disconnect: jest.fn() },
			}));
			jest.doMock("../src/redis", () => ({
				redis: { disconnect: mockRedisDisconnect },
			}));
			jest.doMock("../src/websocket", () => ({
				initSocket: jest.fn(() => mockIo),
			}));
			jest.doMock("../src/config/env", () => ({
				env: { PORT: 0 },
			}));
			jest.doMock("../src/services/event.service", () => ({
				eventBus: mockEventBus,
			}));
			jest.doMock("../src/services/driver.service", () => ({
				DriverService: mockDriverService,
			}));

			const exitSpy = jest
				.spyOn(process, "exit")
				.mockImplementation((() => undefined) as never);
			const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
			const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const indexMod = require("../src/index") as typeof import("../src/index");

			return {
				...indexMod,
				callOrder,
				mockIo,
				mockCloseDatabase,
				mockRedisDisconnect,
				mockEventBus,
				mockDriverService,
				exitSpy,
				logSpy,
				errSpy,
			};
		}

		it("stores setInterval reference, clears it in gracefulShutdown, flushes location buffer, and closes DB/Redis/EventBus before exiting", async () => {
			jest.useFakeTimers();
			try {
				const setIntervalSpy = jest.spyOn(global, "setInterval");
				const clearIntervalSpy = jest.spyOn(global, "clearInterval");

				const {
					startLocationSyncInterval,
					gracefulShutdown,
					callOrder,
					mockDriverService,
					mockCloseDatabase,
					mockRedisDisconnect,
					mockEventBus,
					exitSpy,
				} = setupIndexWithMocks();

				const intervalRef = startLocationSyncInterval(5000);
				expect(intervalRef).not.toBeNull();
				expect(setIntervalSpy).toHaveBeenCalledTimes(1);

				// Advance one tick to verify interval invokes syncLocationBuffer
				await jest.advanceTimersByTimeAsync(5000);
				expect(mockDriverService.syncLocationBuffer).toHaveBeenCalledTimes(1);
				callOrder.length = 0;

				await gracefulShutdown("SIGTERM");

				expect(clearIntervalSpy).toHaveBeenCalledWith(intervalRef);
				expect(mockDriverService.waitForActiveSync).toHaveBeenCalledTimes(1);
				expect(mockDriverService.syncLocationBuffer).toHaveBeenCalledTimes(2);
				expect(mockCloseDatabase).toHaveBeenCalledTimes(1);
				expect(mockRedisDisconnect).toHaveBeenCalledTimes(1);
				expect(mockEventBus.close).toHaveBeenCalledTimes(1);
				expect(exitSpy).toHaveBeenCalledWith(0);

				// Ensure final flush completes before database/redis teardown
				const flushIdx = callOrder.indexOf("syncLocationBuffer");
				const dbCloseIdx = callOrder.indexOf("closeDatabase");
				const redisCloseIdx = callOrder.indexOf("redis.disconnect");
				const eventCloseIdx = callOrder.indexOf("eventBus.close");
				expect(flushIdx).toBeGreaterThan(-1);
				expect(dbCloseIdx).toBeGreaterThan(flushIdx);
				expect(redisCloseIdx).toBeGreaterThan(flushIdx);
				expect(eventCloseIdx).toBeGreaterThan(flushIdx);

				// Further timer advancement should not trigger syncLocationBuffer again
				await jest.advanceTimersByTimeAsync(15000);
				expect(mockDriverService.syncLocationBuffer).toHaveBeenCalledTimes(2);
			} finally {
				jest.useRealTimers();
			}
		});

		it("is idempotent when multiple shutdown signals arrive concurrently", async () => {
			const {
				startLocationSyncInterval,
				gracefulShutdown,
				mockDriverService,
				mockCloseDatabase,
				mockRedisDisconnect,
				mockEventBus,
				exitSpy,
			} = setupIndexWithMocks();

			startLocationSyncInterval(5000);
			await Promise.all([gracefulShutdown("SIGTERM"), gracefulShutdown("SIGINT")]);

			expect(mockDriverService.waitForActiveSync).toHaveBeenCalledTimes(1);
			expect(mockDriverService.syncLocationBuffer).toHaveBeenCalledTimes(1);
			expect(mockCloseDatabase).toHaveBeenCalledTimes(1);
			expect(mockRedisDisconnect).toHaveBeenCalledTimes(1);
			expect(mockEventBus.close).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledWith(0);
		});

		it("continues disconnecting remaining resources and exits with code 1 if closeDatabase fails", async () => {
			const {
				gracefulShutdown,
				mockCloseDatabase,
				mockRedisDisconnect,
				mockEventBus,
				exitSpy,
			} = setupIndexWithMocks({
				closeDatabaseImpl: async () => {
					throw new Error("pool end failure");
				},
			});

			await gracefulShutdown("SIGTERM");

			expect(mockCloseDatabase).toHaveBeenCalledTimes(1);
			expect(mockRedisDisconnect).toHaveBeenCalledTimes(1);
			expect(mockEventBus.close).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("still closes DB, Redis, and EventBus cleanly if final syncLocationBuffer flush throws", async () => {
			const {
				startLocationSyncInterval,
				gracefulShutdown,
				mockDriverService,
				mockCloseDatabase,
				mockRedisDisconnect,
				mockEventBus,
				exitSpy,
				errSpy,
			} = setupIndexWithMocks();

			mockDriverService.syncLocationBuffer.mockRejectedValueOnce(new Error("redis timeout"));
			startLocationSyncInterval(5000);

			await gracefulShutdown("SIGTERM");

			expect(errSpy).toHaveBeenCalledWith("Final Sync Error:", expect.any(Error));
			expect(mockCloseDatabase).toHaveBeenCalledTimes(1);
			expect(mockRedisDisconnect).toHaveBeenCalledTimes(1);
			expect(mockEventBus.close).toHaveBeenCalledTimes(1);
			expect(exitSpy).toHaveBeenCalledWith(0);
		});
	});
});
