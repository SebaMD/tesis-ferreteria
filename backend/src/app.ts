import express from "express";
import morgan from "morgan";
import cors from "cors";
import routes from "./modules/index.js";
import { UPLOADS_ROOT } from "./config/configEnv.js";

const app = express();

app.use(express.json());
app.use(morgan("dev"));
app.use("/uploads", express.static(UPLOADS_ROOT, { maxAge: "7d" }));

app.use(
  cors({
    credentials: true,
    origin: true,
  }),
);

app.get("/", (_req, res) => {
  res.send("Bienvenido al sistema de la ferreteria.");
});

app.use("/api", routes);

export default app;
