import { createServer } from "http";
import app from "./app.js";
import { createInitialUsers } from "./config/initDb.js";
import { PORT } from "./config/configEnv.js";
import { reconcileDueOnlinePaymentsService } from "./modules/onlineOrders/onlineOrders.service.js";

const httpServer = createServer(app);

try {
  await createInitialUsers();

  httpServer.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
  });

  let reconciliationRunning = false;
  const reconcilePayments = async () => {
    if (reconciliationRunning) return;
    reconciliationRunning = true;
    try {
      await reconcileDueOnlinePaymentsService();
    } catch (error) {
      console.error("No se pudieron conciliar pagos Webpay pendientes:", error);
    } finally {
      reconciliationRunning = false;
    }
  };

  void reconcilePayments();
  setInterval(reconcilePayments, 60_000).unref();
} catch (error) {
  console.error("Error al iniciar el servidor: ", error);
  process.exit(1);
}
