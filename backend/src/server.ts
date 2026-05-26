import { createServer } from "http";
import app from "./app.js";
import { createInitialUsers } from "./config/initDb.js";
import { PORT } from "./config/configEnv.js";

const httpServer = createServer(app);

try {
  await createInitialUsers();

  httpServer.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
  });
} catch (error) {
  console.error("Error al iniciar el servidor: ", error);
  process.exit(1);
}
