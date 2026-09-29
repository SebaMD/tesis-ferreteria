import express, { type ErrorRequestHandler } from "express";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import routes from "./modules/index.js";
import { UPLOADS_ROOT } from "./config/configEnv.js";
import { handleErrorClient, handleErrorServer } from "./utils/helpers.js";

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
  "/uploads/customer-notices",
  express.static(path.join(UPLOADS_ROOT, "customer-notices"), {
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

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = typeof error === "object" && error !== null && "status" in error
    ? Number(error.status)
    : 500;
  if (error instanceof SyntaxError && status === 400) {
    handleErrorClient(res, 400, "El cuerpo de la solicitud no contiene JSON valido");
    return;
  }

  handleErrorServer(res, 500, "Error no controlado en la solicitud", error);
};

app.use(errorHandler);

export default app;
