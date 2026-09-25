import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("logistics QR handoff is WAREHOUSE-only and keeps the mobile delivery flow", async () => {
  const [app, roles, login, page, service, management, labelButton] = await Promise.all([
    read("src/App.jsx"),
    read("src/helpers/roles.js"),
    read("src/pages/LoginPage.jsx"),
    read("src/pages/LogisticsScanPage.jsx"),
    read("src/services/orderLogistics.service.js"),
    read("src/pages/OnlineOrdersManagementPage.jsx"),
    read("src/components/orders/DownloadLogisticsLabelButton.jsx"),
  ]);

  assert.match(app, /path="\/logistics\/scan"/);
  assert.match(app, /ROUTE_PERMISSIONS\.logisticsScan/);
  assert.match(roles, /logisticsScan: \["WAREHOUSE"\]/);
  assert.match(login, /role === "WAREHOUSE"/);
  assert.match(login, /requestedPath\?\.startsWith\("\/logistics\/scan\?token="\)/);
  assert.match(login, /getAuthenticatedDestination\(session\.user, requestedPath\)/);
  assert.match(service, /\/order-logistics\/scan/);
  assert.match(service, /scan\/start-delivery/);
  assert.match(page, /Tomar reparto/);
  assert.match(page, /Datos autorizados de entrega/);
  assert.match(page, /DeliveryEvidenceForm/);
  assert.match(page, /tel:/);
  assert.match(page, /buildDeliveryRouteUrl/);
  assert.doesNotMatch(management, /DISPATCH_LABEL|getDispatchLabelRequest/);
  assert.doesNotMatch(labelButton, /despacho|DISPATCH_LABEL/);
});
