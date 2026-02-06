import { Router } from "express";
import { PackageService } from "../services/package.service";
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
 *     responses:
 *       200:
 *         description: Package tracking info
 *       404:
 *         description: Package not found
 */
router.get("/track/:trackingCode", trackingLimiter, async (req, res) => {
  const { trackingCode } = req.params;
  
  try {
    const pkg = await PackageService.getPublicTracking(trackingCode as string);
    
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }
    
    res.json(pkg);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
import { eventBus } from "../services/event.service";

// ... existing imports ...

// SSE Stream endpoint
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
 *     responses:
 *       200:
 *         description: SSE Stream
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get("/track/:trackingCode/stream", trackingLimiter, async (req, res) => {
  const { trackingCode } = req.params;

  try {
    // 1. Validate package and get assigned driver
    const driverId = await PackageService.getAssignedDriverId(trackingCode as string);
    
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
       if (data.driverId === driverId) {
          // Construct client-safe payload (exclude internal driver ID)
          const clientPayload = {
             lat: data.lat,
             lng: data.lng,
             timestamp: data.timestamp
          };
          res.write(`data: ${JSON.stringify(clientPayload)}\n\n`);
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
    // If headers not sent, send error
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
    // If headers sent, just end connection
     res.end();
  }
});

export default router;
