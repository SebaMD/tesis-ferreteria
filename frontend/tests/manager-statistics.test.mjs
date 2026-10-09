import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildDonutGradient,
  buildLineChart,
  getStatisticsPeriodRange,
} from "../src/helpers/managerStatistics.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("statistics period presets and lightweight charts remain deterministic", () => {
  const now = new Date(2026, 8, 24, 12);
  assert.deepEqual(getStatisticsPeriodRange("last7", now), { from: "2026-09-18", to: "2026-09-24" });
  assert.deepEqual(getStatisticsPeriodRange("last30", now), { from: "2026-08-26", to: "2026-09-24" });
  assert.deepEqual(getStatisticsPeriodRange("currentMonth", now), { from: "2026-09-01", to: "2026-09-24" });

  const chart = buildLineChart([
    { date: "2026-09-01", netSales: 0 },
    { date: "2026-09-02", netSales: 10000 },
  ]);
  assert.equal(chart.points.length, 2);
  assert.equal(chart.maxValue, 10000);
  assert.match(buildDonutGradient([{ amount: 30 }, { amount: 70 }], ["#111", "#222"]), /conic-gradient/);
});

test("statistics UI and authorization are MANAGER-only", async () => {
  const [app, roles, sidebar, page, service] = await Promise.all([
    read("src/App.jsx"),
    read("src/helpers/roles.js"),
    read("src/components/Sidebar.jsx"),
    read("src/pages/StatisticsPage.jsx"),
    read("src/services/reports.service.js"),
  ]);

  assert.match(app, /path="\/statistics"/);
  assert.match(app, /ROUTE_PERMISSIONS\.statistics/);
  assert.match(roles, /statistics: \["MANAGER"\]/);
  assert.match(sidebar, /Estadísticas/);
  assert.match(service, /\/reports\/manager-statistics/);
  for (const content of [
    "Monto neto vendido",
    "Distribución por canal",
    "Distribución por método de pago",
    "Productos más vendidos",
    "Stock bajo o en mínimo",
  ]) assert.match(page, new RegExp(content));
  assert.doesNotMatch(page, /predic|forecast|machine learning|inteligencia artificial/i);
});
