import test from "node:test";
import assert from "node:assert/strict";
import { bodyRadiusKm, drawnRadius, isGiant, markerArt, symbolRadius } from "./marker.js";
import { RING_SYSTEMS } from "./seed.js";

const body = (extra) => ({ id: "x", kind: "planet", color: "#5f9ec4", radius_km: 6371, ...extra });
const AT = { x: 400, y: 300, sun: { x: 100, y: 300 }, scale: 200 };

test("die Größenrampe hält die Rangfolge über fünf Größenordnungen", () => {
  const sizes = [
    ["sun", 695700], ["jupiter", 69911], ["earth", 6371], ["mercury", 2439],
    ["luna", 1737], ["ceres", 469], ["halley", 5.5]
  ].map(([id, radius_km]) => [id, symbolRadius(body({ id, radius_km }))]);
  for (let i = 1; i < sizes.length; i += 1) {
    assert.ok(sizes[i - 1][1] > sizes[i][1], `${sizes[i - 1][0]} muss größer sein als ${sizes[i][0]}`);
  }
  assert.ok(sizes.at(-1)[1] >= 2.6, "auch der kleinste Kern bleibt anklickbar");
  assert.ok(sizes[0][1] <= 28, "Sol sprengt den Rahmen nicht");
});

test("ohne gemessenen Radius gilt die Ersatzgröße der Klasse", () => {
  assert.equal(bodyRadiusKm({ kind: "asteroid" }), 260);
  assert.equal(bodyRadiusKm({ kind: "asteroid", radius_km: 0 }), 260);
  assert.equal(bodyRadiusKm({ kind: "asteroid", radius_km: 470 }), 470);
  assert.ok(symbolRadius({ kind: "asteroid" }) < symbolRadius({ kind: "planet" }));
});

test("bei tiefem Zoom wird aus dem Zeichen die echte Scheibe", () => {
  const jupiter = body({ id: "jupiter", radius_km: 69911 });
  assert.equal(drawnRadius(jupiter, 1), symbolRadius(jupiter), "auf Übersichtszoom bleibt das Symbol");
  assert.ok(drawnRadius(jupiter, 1e6) > symbolRadius(jupiter), "eingezoomt wächst die Scheibe");
  assert.ok(drawnRadius(jupiter, 1e12) <= 900, "und bleibt gedeckelt");
});

test("der Terminator zeigt zur Sonne", () => {
  assert.equal(markerArt(body(), AT).lightDeg, 180);
  assert.equal(markerArt(body(), { ...AT, sun: { x: 400, y: 0 } }).lightDeg, -90);
});

test("ein Stern ist beleuchtet, nicht beschienen", () => {
  const art = markerArt(body({ kind: "star", radius_km: 695700 }), AT);
  assert.equal(art.lit, false);
  assert.equal(art.rim, null);
  assert.ok(art.glow > art.r);
});

test("kleine Körper bleiben schlichte Punkte", () => {
  const art = markerArt(body({ kind: "asteroid", radius_km: 3 }), { ...AT, scale: 1 });
  assert.equal(art.lit, false);
  assert.equal(art.rim, null);
  assert.deepEqual(art.bands, []);
});

test("Wolkenbänder nur für Riesen und nur, wenn sie zu sehen wären", () => {
  assert.ok(isGiant({ radius_km: 24622 }));
  assert.ok(!isGiant({ radius_km: 6371 }));
  const jupiter = body({ id: "jupiter", radius_km: 69911 });
  assert.ok(markerArt(jupiter, AT).bands.length > 0);
  assert.deepEqual(markerArt(body(), AT).bands, [], "die Erde hat keine Bänder");
});

test("Ringe hat nur, wer ein Ringsystem trägt", () => {
  const saturn = body({ id: "saturn", radius_km: 58232 });
  const rings = markerArt(saturn, { ...AT, ringSystem: RING_SYSTEMS.saturn }).rings;
  assert.ok(rings.mid > markerArt(saturn, AT).r, "der Ring liegt außerhalb der Scheibe");
  assert.ok(rings.division > 0, "Saturn trägt die Cassinische Teilung");
  assert.equal(markerArt(saturn, AT).rings, null, "ohne System kein Ring");
  assert.equal(markerArt(body({ id: "jupiter", radius_km: 69911 }), { ...AT, ringSystem: RING_SYSTEMS.jupiter }).rings.division, 0);
});

test("ein Komet zeigt seinen Schweif nur in Sonnennähe", () => {
  const comet = body({ kind: "comet", radius_km: 5.5 });
  assert.ok(markerArt(comet, { ...AT, distanceAu: 1.2 }).tail, "im Perihel");
  assert.equal(markerArt(comet, { ...AT, distanceAu: 18 }).tail, null, "im Aphel");
  assert.equal(markerArt(body(), { ...AT, distanceAu: 1 }).tail, null, "ein Planet nie");
});

test("das Fadenkreuz erscheint nur am aktiven Körper", () => {
  assert.equal(markerArt(body(), AT).brackets.length, 0);
  assert.equal(markerArt(body(), { ...AT, active: true }).brackets.length, 4);
});

test("eine fehlende oder unsinnige Farbe kippt die Darstellung nicht", () => {
  assert.match(markerArt(body({ color: null }), AT).fill, /^#[0-9a-f]{6}$/i);
  assert.match(markerArt(body({ color: "rot" }), AT).rimColor, /^#[0-9a-f]{6}$/i);
});
