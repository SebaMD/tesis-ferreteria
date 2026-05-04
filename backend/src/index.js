import express from "express";
import morgan from "morgan";
import cors from "cors";
import { connectDb } from "./config/configDb.js";
import { createInitialUsers } from "./config/initDb.js";
import { createServer } from "http";
import { PORT } from "./config/configEnv.js";

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(morgan("dev"));

app.use(
    cors({
        credentials: true,
        origin: true,
    })
);

app.get("/", (req, res) => {
    res.send("Bienvenido al sistema de la ferreteria.");
});

connectDb()
    .then(async () => {

        await createInitialUsers();

        httpServer.listen(PORT, () => {
            console.log(`Servidor iniciado en http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.log("Error al conectar con la base de datos: ", error);
        process.exit(1);
    })
