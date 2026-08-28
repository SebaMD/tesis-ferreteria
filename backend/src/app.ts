import express from "express";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import routes from "./modules/index.js";
import { UPLOADS_ROOT } from "./config/configEnv.js";

const app = express();

morgan.token("safe-url", (req) => String(req.url || "").split("?")[0]);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan(":method :safe-url :status :response-time ms - :res[content-length]"));
app.use(
  "/uploads/products",
  express.static(path.join(UPLOADS_ROOT, "products"), {
    dotfiles: "deny",
    maxAge: "7d",
  }),
);

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
