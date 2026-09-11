import test from "node:test";
import assert from "node:assert/strict";
import { auDistanceLabel, distanceLabel, hohmannTransferPlan, hohmannTransferPoints, lightDelayLabel, localPosition, orbitTrack, positionsFor, solveKepler } from "./orbit.js";

test("Kepler solver satisfies the equation", () => {
  const M = 1.7, e = 0.42, E = solveKepler(M, e);
  assert.ok(Math.abs(E - e * Math.sin(E) - M) < 1e-9);
});

test("a circular static body stays at its stored anomaly", () => {
  const body = { semi_major_axis_au: 2, eccentricity: 0, orbital_period_days: 0, epoch_anomaly_deg: 90 };
  const p = localPosition(body, 9999);
  assert.ok(Math.abs(p.x) < 1e-9);
  assert.ok(Math.abs(p.y - 2) < 1e-9);
});

test("a moving body advances from a non-zero epoch anomaly", () => {
  const body = { semi_major_axis_au: 1, eccentricity: 0, orbital_period_days: 10, epoch_anomaly_deg: 90 };
  const start = localPosition(body, 0);
  const quarterOrbit = localPosition(body, 2.5);
  assert.ok(Math.abs(start.x) < 1e-9);
  assert.ok(Math.abs(start.y - 1) < 1e-9);
  assert.ok(Math.abs(quarterOrbit.x + 1) < 1e-9);
  assert.ok(Math.abs(quarterOrbit.y) < 1e-9);
});

test("a moon is offset from its resolved parent", () => {
  const bodies = [
    { id: "sun", name: "Sol", kind: "star", parent_id: null },
    { id: "planet", name: "Planet", kind: "planet", parent_id: "sun", semi_major_axis_au: 1, eccentricity: 0, orbital_period_days: 0, epoch_anomaly_deg: 0 },
    { id: "moon", name: "Mond", kind: "moon", parent_id: "planet", semi_major_axis_au: .1, eccentricity: 0, orbital_period_days: 0, epoch_anomaly_deg: 90 }
  ];
  const { positions } = positionsFor(bodies, "2000-01-01", "2000-01-01");
  assert.deepEqual(positions.get("planet").x, 1);
  assert.ok(Math.abs(positions.get("moon").y - .1) < 1e-9);
});

test("light delay turns orbital distance into a player-facing duration", () => {
  assert.equal(lightDelayLabel(1), "8,3 min");
  assert.equal(lightDelayLabel(0), "0 s");
});

test("route distances stay in AE", () => {
  assert.equal(auDistanceLabel(1.5), "1,5 AE");
  assert.equal(auDistanceLabel(0.002819), "0,002819 AE");
});

test("a Hohmann plan finds the next window and a half-ellipse", () => {
  const earth = { id: "earth", parent_id: null, semi_major_axis_au: 1, orbital_period_days: 365.256, epoch_anomaly_deg: 0 };
  const mars = { id: "mars", parent_id: null, semi_major_axis_au: 1.524, orbital_period_days: 686.98, epoch_anomaly_deg: 44.5 };
  const plan = hohmannTransferPlan(earth, mars, "2000-01-01", "2000-01-01");
  assert.ok(plan.waitDays < 1, "the supplied phase is already near the launch window");
  assert.ok(plan.windowCycleDays > 770 && plan.windowCycleDays < 790);
  assert.ok(plan.windowProgress > .99 && plan.windowProgress <= 1);
  assert.ok(plan.transferDays > 258 && plan.transferDays < 260);
  assert.ok(plan.deltaVKms > 5 && plan.deltaVKms < 6);
  const points = hohmannTransferPoints(plan);
  assert.equal(points.length, 65);
  assert.ok(Math.abs(Math.hypot(points[0].x, points[0].y) - 1) < 1e-9);
  assert.ok(Math.abs(Math.hypot(points.at(-1).x, points.at(-1).y) - 1.524) < 1e-9);
});

test("a Hohmann plan rejects bodies on different primaries", () => {
  const source = { parent_id: "earth", semi_major_axis_au: .002, orbital_period_days: 27 };
  const destination = { parent_id: null, semi_major_axis_au: 1.5, orbital_period_days: 687 };
  assert.equal(hohmannTransferPlan(source, destination, "2000-01-01", "2000-01-01"), null);
});

test("a moon distance is read in kilometres, not in fractions of an AU", () => {
  assert.equal(distanceLabel(1.5), "1,5 AE");
  assert.equal(distanceLabel(0.01), "0,01 AE");
  assert.equal(distanceLabel(0.002819), "421.716 km");
  assert.equal(distanceLabel(0.00000004), "5,98 km");
  assert.equal(distanceLabel(0), "0 AE");
});

test("the ring stays whole while the trail brightens towards the body", () => {
  const body = { semi_major_axis_au: 2, eccentricity: 0, orbital_period_days: 700 };
  const parent = { x: 900, y: 368 };
  const at = { x: 900, y: 368 - 200 };
  const { ring, trail } = orbitTrack(body, parent, 100, at, { w: 1840, h: 736 });
  assert.ok(ring.startsWith("M") && ring.split("a").length === 3, "the full ellipse is drawn as one closed path");
  const head = trail.at(-1);
  const [x, y] = head.d.match(/[-\d.]+/g).slice(-2).map(Number);
  assert.ok(Math.hypot(x - at.x, y - at.y) < 1, "the last segment ends at the body");
  assert.ok(head.o > trail[0].o, "the head is the brightest point of the trail");
  assert.ok(trail.every((segment, index) => index === 0 || segment.o >= trail[index - 1].o),
    "the opacity never rises towards the tail");
});

test("an ellipse too large for the frame keeps only the trail, cut to the frame", () => {
  const body = { semi_major_axis_au: 5.2, eccentricity: 0, orbital_period_days: 4332 };
  const parent = { x: 900, y: 368 };
  const at = { x: 900, y: 368 - 5.2 * 1e6 };
  const { ring, trail } = orbitTrack(body, parent, 1e6, at, { w: 1840, h: 736 });
  assert.equal(ring, "", "no closed ellipse is emitted past the arc limit");
  const [x, y] = trail.at(-1).d.match(/[-\d.]+/g).slice(-2).map(Number);
  assert.ok(Math.hypot(x - at.x, y - at.y) < 1, "the sampled arc runs through the body");
  const xs = trail.map((segment) => Number(segment.d.match(/[-\d.]+/g)[0]));
  assert.ok(Math.max(...xs) - Math.min(...xs) < 1840 * 3, "the trail is clipped to the frame");
  assert.ok(trail.at(-1).o - trail[0].o < .05, "a clipped arc keeps its brightness across the frame");
});
