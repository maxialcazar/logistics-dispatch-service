import express from "express";
import driversRoutes from "./routes/drivers.routes";

const app = express();
app.use(express.json());

app.use("/api/drivers", driversRoutes);

app.listen(3001, () => {
  console.log("API running on http://localhost:3001");
});