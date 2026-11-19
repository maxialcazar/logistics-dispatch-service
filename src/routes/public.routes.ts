import { Router, Request, Response } from "express";
import { PackageService } from "../services/package.service";
import { eventBus } from "../services/event.service";
import { rateLimit } from "express-rate-limit";

const router = Router();

// Strict rate limit for public tracking to prevent scraping/guessing codes
const trackingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 requests per hour per IP
  message: { error: "Too many tracking attempts. Please try again later." },
});

/**
 * @openapi
 * tags:
 *   name: Public
 *   description: Publicly accessible endpoints (no auth required)
 */

function resolveCompanySlug(req: Request): string | undefined {
  const paramSlug = req.params.companySlug;
  if (typeof paramSlug === "string" && paramSlug.trim()) {
    return paramSlug.trim();
  }
  const querySlug = req.query.companySlug;
  if (typeof querySlug === "string" && querySlug.trim()) {
    return querySlug.trim();
  }
  return undefined;
}

async function handlePublicTrack(req: Request, res: Response) {
  const { trackingCode } = req.params;
  const companySlug = resolveCompanySlug(req);

  try {
    const pkg = await PackageService.getPublicTracking(trackingCode as string, companySlug);

    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    res.json(pkg);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handlePublicTrackStream(req: Request, res: Response) {
  const { trackingCode } = req.params;
  const companySlug = resolveCompanySlug(req);

  try {
    // 1. Validate package exists (scoped by companySlug if provided) and get assigned driver
    const streamTarget = await PackageService.getAssignedDriverId(trackingCode as string, companySlug);
    if (!streamTarget) {
      return res.status(404).json({ error: "Package not found" });
    }

    const { driverId } = streamTarget;

    // Setup SSE Headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    res.write("retry: 10000\n\n"); // Reconnect every 10s if lost

    if (!driverId) {
      // Package exists but no driver assigned.
      // Keep connection open but just send heartbeat.
      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);

      req.on("close", () => {
        clearInterval(heartbeat);
      });
      return;
    }

    // 2. Define listener to filter events
    const listener = (data: any) => {
      try {
        if (data.driverId === driverId) {
          // Construct client-safe payload (exclude internal driver ID)
          const clientPayload = {
            lat: data.lat,
            lng: data.lng,
            timestamp: data.timestamp,
          };

          // Defensive writing check
          if (res.writable) {
            res.write(`data: ${JSON.stringify(clientPayload)}\n\n`);
          }
        }
      } catch (err) {
        console.error("SSE Write Error:", err);
      }
    };

    // 3. Subscribe to EventBus
    eventBus.on("driver.location.updated", listener);

    // Heartbeat
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);

    // 4. Cleanup
    req.on("close", () => {
      eventBus.off("driver.location.updated", listener);
      clearInterval(heartbeat);
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal Server Error" });
    }
    res.end();
  }
}

/**
 * @openapi
 * /api/public/track/{trackingCode}:
 *   get:
 *     summary: Track a package status publicly
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: trackingCode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: companySlug
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Package tracking info
 *       404:
 *         description: Package not found
 */
router.get("/track/:trackingCode", trackingLimiter, handlePublicTrack);

/**
 * @openapi
 * /api/public/track/{trackingCode}/stream:
 *   get:
 *     summary: Subscribe to real-time location updates for a package (SSE)
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: trackingCode
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: companySlug
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SSE Stream
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       404:
 *         description: Package not found
 */
router.get("/track/:trackingCode/stream", trackingLimiter, handlePublicTrackStream);
router.get("/:companySlug/track/:trackingCode", trackingLimiter, handlePublicTrack);
router.get("/:companySlug/track/:trackingCode/stream", trackingLimiter, handlePublicTrackStream);

export default router;
