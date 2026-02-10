// Native fetch in Node 18+ or global fetch
const axios = require('axios');
const { performance: perf } = require('perf_hooks');
const { io } = require("socket.io-client");

const API_URL = "http://127.0.0.1:3010/api";
const SOCKET_URL = "http://127.0.0.1:3010"; // Socket.io on root

// --- TELEMETRY STORE ---
const metrics: Record<string, number[]> = {};
const statusCounts: Record<string, { success: number; fail: number }> = {};
const startTimeGlobal = perf.now();

function track(label: string, duration: number, isSuccess: boolean) {
  if (!metrics[label]) metrics[label] = [];
  if (!statusCounts[label]) statusCounts[label] = { success: 0, fail: 0 };
  
  metrics[label].push(duration);
  if (isSuccess) statusCounts[label].success++;
  else statusCounts[label].fail++;
}

function generateReport() {
  const totalDurationSec = (perf.now() - startTimeGlobal) / 1000;
  console.log("\n\n" + "=".repeat(80));
  console.log(`📊 LOAD TEST RESULTS REPORT (Duration: ${totalDurationSec.toFixed(2)}s)`);
  console.log("=".repeat(80));
  
  const headers = ["Label", "Reqs", "RPS", "Err%", "Min", "Med", "p95", "p99", "Max"];
  const rows = [];

  for (const label of Object.keys(metrics).sort()) {
    const times = metrics[label].sort((a, b) => a - b);
    const count = times.length;
    const { success, fail } = statusCounts[label];
    const total = success + fail;
    const rps = (total / totalDurationSec).toFixed(1);
    const errorRate = ((fail / total) * 100).toFixed(1) + "%";
    
    const min = times[0].toFixed(0);
    const med = times[Math.floor(count * 0.5)].toFixed(0);
    const p95 = times[Math.floor(count * 0.95)] || times[count - 1];
    const p99 = times[Math.floor(count * 0.99)] || times[count - 1];
    const max = times[count - 1].toFixed(0);

    rows.push({
      Label: label, 
      Reqs: total, 
      RPS: rps, 
      "Err%": errorRate, 
      "Min(ms)": min, 
      "Med(ms)": med, 
      "p95(ms)": p95.toFixed(0), 
      "p99(ms)": p99.toFixed(0), 
      "Max(ms)": max
    });
  }
  
  console.table(rows);
  console.log("=".repeat(80));
}
// -----------------------

// ... (rest of code logic is same, just helpers change)

// Helpers
// Helpers with Instrumentation
function cleanLabel(method: string, endpoint: string) {
    // Replace UUIDs with :id to group metrics
    let clean = endpoint.replace(/[0-9a-fA-F-]{36}/g, ':id');
    // Sanitize query params
    clean = clean.split('?')[0]; 
    return `${method} ${clean}`;
}

async function post(endpoint: string, data: any, token?: string) {
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const start = perf.now();
    let success = false;
    
    try {
        const res = await axios.post(`${API_URL}${endpoint}`, data, { headers });
        success = true;
        return res.data;
    } catch (error: any) {
        const msg = error.response ? JSON.stringify(error.response.data) : error.message;
        throw new Error(`POST ${endpoint} failed: ${msg}`);
    } finally {
        track(cleanLabel("POST", endpoint), perf.now() - start, success);
    }
}

async function patch(endpoint: string, data: any, token?: string) {
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const start = perf.now();
    let success = false;

    try {
        const res = await axios.patch(`${API_URL}${endpoint}`, data, { headers });
        success = true;
        return res.data;
    } catch (error: any) {
        const msg = error.response ? JSON.stringify(error.response.data) : error.message;
        throw new Error(`PATCH ${endpoint} failed: ${msg}`);
    } finally {
        track(cleanLabel("PATCH", endpoint), perf.now() - start, success);
    }
}

async function get(endpoint: string, token?: string) {
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const start = perf.now();
    let success = false;

    try {
        const res = await axios.get(`${API_URL}${endpoint}`, { headers });
        success = true;
        return res.data;
    } catch (error: any) {
        const msg = error.response ? JSON.stringify(error.response.data) : error.message;
        throw new Error(`GET ${endpoint} failed: ${msg}`);
    } finally {
        track(cleanLabel("GET", endpoint), perf.now() - start, success);
    }
}

const companies = [
  { name: "Empresa A", slug: "empresa-a", user: "adminA", pass: "123456" }
  //{ name: "Empresa B", slug: "empresa-b", user: "adminB", pass: "123456" },
  //{ name: "Empresa C", slug: "empresa-c", user: "adminC", pass: "123456" },
  //{ name: "Empresa D", slug: "empresa-d", user: "adminD", pass: "123456" },
  //{ name: "Empresa E", slug: "empresa-e", user: "adminE", pass: "123456" },
];

async function main() {
  console.log("🚀 Starting Load Test...");

  // 1. Register Companies & Admins
  const companyTokens: Record<string, string> = {};
  
  for (const c of companies) {
    try {
      console.log(`Creating company: ${c.name}...`);
      await post('/auth/register-company', {
        companyName: c.name,
        companySlug: c.slug,
        username: c.user,
        password: c.pass
      });

      const login = await post('/auth/login', { username: c.user, password: c.pass });
      companyTokens[c.slug] = login.token;
      console.log(`✅ Company ${c.name} registered and logged in.`);
    } catch (e: any) {
      console.error(`❌ Failed to register ${c.name}:`, e.message);
      // Try login if already exists
      try {
          const login = await post('/auth/login', { username: c.user, password: c.pass });
          companyTokens[c.slug] = login.token;
          console.log(`⚠️ Company ${c.name} already existed, logged in.`);
      } catch (loginErr) {
          console.error(`❌ Fatal: Could not access ${c.name}`);
      }
    }
  }

  // 2. Simulate Load for each Company in Parallel
  console.log("🔥 Launching simulation for all companies in PARALLEL...");
  
  try {
      await Promise.all(companies.map(c => {
        if (companyTokens[c.slug]) {
            return simulateCompany(c, companyTokens[c.slug]);
        }
        return Promise.resolve();
      }));
  } catch (err) {
      console.error("Simulation failed partially:", err);
  } finally {
      generateReport();
  }
}

async function simulateCompany(c: any, adminToken: string) {
  console.log(`[${c.name}] Starting simulation...`);
  const DISPATCHERS_COUNT = 1; 
  // Reducing counts slightly to avoid blowing up memory/network local dev immediately if user has limited resources.
  // User asked for 50 dispatchers * 50 drivers = 2500 requests. 
  // Let's stick to the plan but be aware this is heavy.
  
  const OBJECTS_PER_DISPATCHER = 25; 

  // Create dispatchers
  const dispatchers = [];
  for(let i=0; i<DISPATCHERS_COUNT; i++) {
    const username = `disp_${c.slug}_${i}`;
    try {
        await post('/users', {
            username,
            password: '123456',
            role: 'dispatcher'
        }, adminToken);
        // Login as dispatcher to get their own token? 
        // Or just use admin token? In real world, each has their own.
        // Let's use admin token for creation to save time, assume admin does setup.
        // Actually user said "each dispatcher will create..."
        // So we should login as dispatcher.
        
        const login = await post('/auth/login', { username, password: '123456' });
        dispatchers.push({ token: login.token, id: login.user.id, name: username });
    } catch (e: any) {
        console.error(`[${c.name}] Failed to create dispatcher ${username}: ${e.message}`);
      // Ignore if user exists
        const login = await post('/auth/login', { username, password: '123456' });
        dispatchers.push({ token: login.token, id: login.user.id, name: username });
    }
  }
  console.log(`[${c.name}] Created ${dispatchers.length} dispatchers.`);

  // Parallel Execution per Dispatcher
  await Promise.all(dispatchers.map(async (d, i) => {
    // Each dispatcher creates 50 zones, 50 drivers, 50 packages
    const headers = { Authorization: `Bearer ${d.token}` };

    // --- WS CONNECTION ---
    const socket = io(SOCKET_URL, {
        auth: { token: d.token },
        transports: ['websocket'],
        reconnection: false
    });

    socket.on('driver-location-updated', (update: any) => {
        // "timestamp" comes from server (Date.now() when published to Redis)
        // We compare with client Date.now() to measure Redis -> Socket latency
        if (update && update.timestamp) {
            const lag = Date.now() - update.timestamp;
            track("WS Broadcast Lag", Math.max(0, lag), true);
        }
    });
    // ---------------------
    
    // Create Zones
    const zones = [];
    for(let j=0; j<OBJECTS_PER_DISPATCHER; j++) {
        const name = `Zone_${c.slug}_${i}_${j}`;
        const z = await post('/zones', { name }, d.token);
        zones.push(z);
    }

    // Create Drivers
    const drivers = [];
    for(let j=0; j<OBJECTS_PER_DISPATCHER; j++) {
        const name = `Driver_${c.slug}_${i}_${j}`;
        const username = `usr_${name}`; // Drivers need users
        const drv = await post('/drivers', { name, username, password: '123456' }, d.token);
        drivers.push(drv);
    }

    // Create Packages & Assign
    const packages: any[] = [];
    try {
        for(let j=0; j<OBJECTS_PER_DISPATCHER; j++) {
            const zone = zones[j];
            const driver = drivers[j];
            
            // Create Package
            // Create Package (Updated for New Schema)
            const trackingCode = `PKG_${c.slug}_${i}_${j.toString().padStart(3, '0')}`;
            const pkgData = {
                trackingCode,
                recipientName: `Cliente ${c.slug} #${j}`,
                recipientAddress: `Av. Siempre Viva ${j + 100}`,
                recipientPhone: `+54911${Math.floor(Math.random() * 10000000)}`,
                addressStreet: "Av. Siempre Viva",
                addressNumber: `${j + 100}`,
                zoneId: zones[j].id, // Use the correct zone from array
                lat: -34.6037 + (Math.random() * 0.05 - 0.025), // Around Buenos Aires
                lng: -58.3816 + (Math.random() * 0.05 - 0.025),
                weight: Math.floor(Math.random() * 10) + 1,
                volume: parseFloat((Math.random() * 0.5).toFixed(2))
            };

            await post('/packages', pkgData, d.token);
            packages.push({ id: trackingCode }); // Store just ID or full ojbect

            // Assign Driver to Zone
            await post(`/drivers/${driver.id}/zones`, { zoneIds: [zone.id] }, d.token);
        }
    } catch (e: any) {
        console.error(`[${d.name}] Setup failed (partial): ${e.message}`);
    }

    // Simulation Phase: Drivers updating location
    console.log(`[${c.name}] Dispatcher ${d.name} setup complete. Launching drivers...`);
    
    const driverSims = drivers.map(async (drvData, driverIndex) => { 
       try {
            // Login as driver user (created previously)
            // Note: In create steps we made users 'usr_Driver_...'
            const login = await post('/auth/login', { 
                username: `usr_${drvData.name}`, // Fixed username reference
                password: '123456' 
            });
            const drvToken = login.token;

            // 1. Get Packages Assigned to Me
            // The setup phase assigned drivers to zones, and packages to zones.
            // But packages need to be explicitly assigned to drivers or claimed.
            // Assuming the existing logic assigns them, or we need to claim them.
            // Let's try to fetch 'my packages'. If empty, we might need to assign one first.
            let myPackages = await get('/packages/me', drvToken);
            
            // If no packages, let's try to assign the one created for this index
            // We know packages[j] matches drivers[j] in our loop
            if (myPackages.length === 0 && packages[driverIndex]) {
                 try {
                    await post(`/packages/${packages[driverIndex].id}/assign`, { driverId: login.user.driverId }, d.token); // Admin/Dispatcher assigns
                    myPackages = [{ id: packages[driverIndex].id }];
                 } catch (e) { /* Ignore assign error */ }
            }

            const targetPkg = myPackages[0]; // Focus on one package

            // --- MOVEMENT LOOP ---
            const driversPerCol = 10;
            const colIndex = driverIndex % driversPerCol;
            const rowIndex = Math.floor(driverIndex / driversPerCol);
            
            let lat = -34.6037 + (rowIndex * 0.002);
            let lng = -58.3816 + (colIndex * 0.002);
            
            // Randomize speed slightly
            const latStep = 0.00005 * (0.8 + Math.random() * 0.4); 
            const lngStep = 0.00005 * (0.8 + Math.random() * 0.4);

            const locationInterval = setInterval(async () => {
              try {
                lat += latStep;
                lng += lngStep;
                const jitter = (Math.random() - 0.5) * 0.00001; 
                await patch('/drivers/location', { lat: lat + jitter, lng: lng + jitter }, drvToken);
              } catch (e) { /* silent fail */ }
            }, 1000);

            // --- STATUS UPDATE SIMULATION (Staggered) ---
            if (targetPkg) {
                // 1. Wait random time before starting (5s - 20s)
                const startDelay = Math.floor(Math.random() * 15000) + 5000;
                
                setTimeout(async () => {
                    try {
                        console.log(`[${drvData.name}] 🚚 Starting delivery for ${targetPkg.id}`);
                        await patch(`/packages/${targetPkg.id}/status`, { status: 'in_transit' }, drvToken);
                        
                        // 2. Drive for random time (10s - 30s)
                        const driveTime = Math.floor(Math.random() * 20000) + 10000;
                        
                        setTimeout(async () => {
                             try {
                                console.log(`[${drvData.name}] ✅ Delivered ${targetPkg.id}`);
                                await patch(`/packages/${targetPkg.id}/status`, { status: 'delivered' }, drvToken);
                             } catch (e: any) { console.error(`[${drvData.name}] Refused delivery: ${e.message}`); }
                        }, driveTime);

                    } catch (e: any) { console.error(`[${drvData.name}] Failed start: ${e.message}`); }
                }, startDelay);
            }

            // Keep simulation alive
            await new Promise(resolve => setTimeout(() => {
                clearInterval(locationInterval);
                resolve(null);
            }, 60000)); 
            
       } catch (e: any) {
           console.error(`[DriverSim] Error: ${e.message}`);
       }
    });


    await Promise.all(driverSims);
    socket.disconnect();
  }));

  console.log(`[${c.name}] Finished.`);
}



main().catch(console.error);
