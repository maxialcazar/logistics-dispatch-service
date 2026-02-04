import express from "express";
import driversRoutes from "./routes/drivers.routes";
import zonesRoutes from "./routes/zones.routes";
import packagesRoutes from "./routes/packages.routes";

const app = express();
app.use(express.json());

app.use("/api/drivers", driversRoutes);
app.use("/api/zones", zonesRoutes);
app.use("/api/packages", packagesRoutes);

app.listen(3001, () => {
  console.log("API running on http://localhost:3001");
});