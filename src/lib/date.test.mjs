import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarStep, daysBetween, parseCalendarDate, replaceCalendarPart, todayCalendarDate } from "./date.js";

test("das heutige Datum verwendet den lokalen Kalendertag", () => {
  assert.equal(todayCalendarDate(new Date(2026, 8, 10, 23, 30)), "2026-09-10");
});

test("fuenfstellige Jahre bleiben lesbar und berechenbar", () => {
  assert.deepEqual(parseCalendarDate("10000-01-01"), { year: 10000, month: 1, day: 1 });
  assert.equal(addCalendarStep("9999-12-31", 1, "day"), "10000-01-01");
  assert.equal(daysBetween("9999-12-31", "10000-01-01"), 1);
});

test("Monats- und Jahresschritte begrenzen den Tag sauber", () => {
  assert.equal(addCalendarStep("2025-01-31", 1, "month"), "2025-02-28");
  assert.equal(addCalendarStep("2024-02-29", 1, "year"), "2025-02-28");
  assert.equal(addCalendarStep("2024-02-29", -1, "year"), "2023-02-28");
});

test("einzelne Datumsfelder werden normalisiert", () => {
  assert.equal(replaceCalendarPart("2026-09-09", "year", "10000"), "10000-09-09");
  assert.equal(replaceCalendarPart("2024-01-31", "month", "2"), "2024-02-29");
  assert.equal(replaceCalendarPart("2026-04-12", "day", "99"), "2026-04-30");
});
