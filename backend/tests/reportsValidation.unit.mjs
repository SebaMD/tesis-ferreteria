import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://postgres@127.0.0.1:55442/postgres";

const {
  validateDailyReportQuery,
  validateSalesReportQuery,
} = await import("../dist/modules/reports/reports.validation.js");

const now = new Date(2026, 9, 4, 18, 30);

test("daily reports accept today and past dates but reject future dates", () => {
  assert.equal(validateDailyReportQuery({ date: "2026-10-04" }, now).success, true);
  assert.equal(validateDailyReportQuery({ date: "2026-10-03" }, now).success, true);

  const future = validateDailyReportQuery({ date: "2026-10-05" }, now);
  assert.equal(future.success, false);
  assert.equal(future.error, "La fecha no puede ser futura");

  assert.equal(validateDailyReportQuery({ date: "04-10-2026" }, now).success, false);
});

test("sales report ranges reject inverted, invalid and future dates", () => {
  assert.equal(validateSalesReportQuery(
    { from: "2026-10-03", to: "2026-10-04" },
    now,
  ).success, true);

  const futureEnd = validateSalesReportQuery(
    { from: "2026-10-04", to: "2026-10-05" },
    now,
  );
  assert.equal(futureEnd.success, false);
  assert.equal(futureEnd.error, "La fecha hasta no puede ser futura");

  const futureRange = validateSalesReportQuery(
    { from: "2026-10-05", to: "2026-10-05" },
    now,
  );
  assert.equal(futureRange.success, false);
  assert.equal(futureRange.error, "La fecha desde no puede ser futura");

  assert.equal(validateSalesReportQuery(
    { from: "2026-10-04", to: "2026-10-03" },
    now,
  ).success, false);
  assert.equal(validateSalesReportQuery(
    { from: "not-a-date", to: "2026-10-04" },
    now,
  ).success, false);
});
