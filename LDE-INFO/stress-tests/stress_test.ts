import { prisma } from "../src/prisma";
import http from "http";
import jwt from "jsonwebtoken";

// Config
const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const DRIVER_COUNT = 50;
const UPDATES_PER_DRIVER = 20; 
const UPDATE_INTERVAL_MS = 200; 
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

async function main() {
  console.log("🚀 Starting STRESS TEST...");
  console.log(`🎯 Targets: ${DRIVER_COUNT} Drivers, ${UPDATES_PER_DRIVER} Updates each.`);
  
  // 1. Setup Data
  console.log("🛠️  Seeding test data...");
  const drivers: any[] = [];
  const tokens: string[] = [];
  const trackingCodes: string[] = [];
  const zones: any[] = [];

  console.log("⚡ Creating 50 coupled Driver-Zone-Package units...");
  for (let i = 0; i < DRIVER_COUNT; i++) {
      const d = await prisma.driver.create({
          data: { 
              name: `Stress ${i}`,
              lat: 0, lng: 0
           }
      });
      // Forge token
      const token = jwt.sign(
        { userId: `stress-user-${i}`, role: "driver", driverId: d.id }, 
        JWT_SECRET, 
        { expiresIn: "1h" }
      );
      
      const z = await prisma.zone.create({
          data: {
              name: `Zone ${i}`,
              driverId: d.id
          }
      });
      const p = await prisma.package.create({
          data: {
              trackingCode: `STR-${i}-${Date.now()}`,
              address: "Fake St",
              status: "in_transit",
              zoneId: z.id,
              lat: 0, 
              lng: 0
          }
      });
      drivers.push(d);
      tokens.push(token);
      zones.push(z);
      trackingCodes.push(p.trackingCode);
  }

  // 2. Open SSE Connections
  console.log(`📡 Opening ${DRIVER_COUNT} SSE connections...`);
  const sseCounters = new Array(DRIVER_COUNT).fill(0);
  const connections: any[] = [];

  trackingCodes.forEach((code, idx) => {
    const req = http.request(`${BASE_URL}/api/public/track/${code}/stream`, (res) => {
        res.on('data', (chunk) => {
            const str = chunk.toString();
            if (str.includes("driverId")) {
                console.error("❌ LEAK: DriverID exposed!");
            }
            if (str.includes("timestamp")) {
                sseCounters[idx]++;
            }
        });
    });
    req.end();
    connections.push(req);
  });

  // Wait a bit for connections to establish and subscribe to redis
  await new Promise(r => setTimeout(r, 2000));

  // 3. Start Update Storm
  console.log("🌪️  STARTING UPDATE STORM (Http Ingest)...");
  const startTime = Date.now();
  let failureCount = 0;

  const updatePromises = drivers.map(async (driver, idx) => {
      for (let j = 0; j < UPDATES_PER_DRIVER; j++) {
          if (failureCount > 50) return; // Fail fast

          const lat = -34.00 + (j * 0.001);
          const lng = -58.00 + (j * 0.001);
          
          await fetch(`${BASE_URL}/api/drivers/location`, {
              method: 'PATCH',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${tokens[idx]}` 
              },
              body: JSON.stringify({
                  lat,
                  lng
              })
          }).then(res => {
              if (res.status !== 200) {
                  console.error(`Err D${idx}: ${res.status}`);
                  failureCount++;
              }
          }).catch(e => {
              console.error(`Update failed D${idx}:`, e.message);
              failureCount++;
          });

          await new Promise(r => setTimeout(r, UPDATE_INTERVAL_MS));
      }
  });

  await Promise.all(updatePromises);
  const duration = (Date.now() - startTime) / 1000;

  console.log(`🏁 Storm finished in ${duration.toFixed(2)}s`);
  
  // Wait for events to propagate
  await new Promise(r => setTimeout(r, 5000));

  // 4. Analysis
  const totalSent = DRIVER_COUNT * UPDATES_PER_DRIVER;
  const totalReceived = sseCounters.reduce((a, b) => a + b, 0);
  
  console.log("\n📊 RESULTS:");
  console.log(`   Updates Sent:     ${totalSent}`);
  console.log(`   Events Received:  ${totalReceived}`);
  console.log(`   Delivery Rate:    ${((totalReceived / totalSent) * 100).toFixed(1)}%`);
  console.log(`   Throughput:       ${(totalSent / duration).toFixed(0)} req/sec`);

  if (totalReceived > 0) {
      console.log("\n✅ SUCCESS: Infrastructure handled the load.");
  } else {
      console.log("\n❌ ALL FAILED: No events received. Check redis/eventbus connections.");
  }

  // 5. Cleanup
  console.log("\n🧹 Cleaning up...");
  connections.forEach(req => req.destroy());
  await prisma.package.deleteMany({ where: { trackingCode: { in: trackingCodes } } });
  await prisma.zone.deleteMany({ where: { id: { in: zones.map(z => z.id) } } });
  await prisma.driver.deleteMany({ where: { id: { in: drivers.map(d => d.id) } } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
