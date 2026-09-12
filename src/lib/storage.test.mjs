import assert from "node:assert/strict";
import test from "node:test";
import { forget, foundryMode, initialPublishedSnapshot, load, normalize, persist, publishSnapshot } from "./storage.js";
import { bodyDisplayName, bodyPlayerLore, bodyPlayerStats, bodyPlayerTags } from "./presentation.js";

const bodies = [
  { id: "sun", name: "Sol", kind: "star", sector: "inneres-system", tags: ["Stern"] },
  { id: "earth", name: "Erde", kind: "planet", sector: "inneres-system", parent_id: "sun", semi_major_axis_au: 1, orbital_period_days: 365.25, tags: ["Planet"] }
];

test("Kampagneninformationen erweitern geschuetzte Koerper", () => {
  const doc = normalize({
    bodies,
    active_sector: "inneres-system",
    body_overrides: { earth: { alias: "Terra", tags: ["Heimat"], lore: "Bekannter Raum.", stats: [{ label: "Fraktion", value: "UN" }], gm_notes: "Geheim" } }
  });
  const earth = doc.bodies.find((body) => body.id === "earth");
  assert.equal(bodyDisplayName(doc, earth), "Terra");
  assert.deepEqual(bodyPlayerTags(doc, earth), ["Planet", "Heimat"]);
  assert.equal(bodyPlayerLore(doc, earth), "Bekannter Raum.");
  assert.deepEqual(bodyPlayerStats(doc, earth)[0], { label: "Fraktion", value: "UN" });
  assert.ok(bodyPlayerStats(doc, earth).some((item) => item.label === "Durchmesser"));
  assert.equal(earth.semi_major_axis_au, 1);
});

test("Wissenschaftliche Basisdaten und GM-Zeilen werden gemeinsam praesentiert", () => {
  const doc = normalize({
    version: 4,
    bodies: [bodies[0], { ...bodies[1], description: "Ozeanwelt.", color: "#5f9ec4", color_note: "blau", source: "JPL", stats: [{ label: "Durchmesser", value: "12.742 km" }] }],
    active_sector: "inneres-system",
    body_overrides: { earth: { stats: [{ label: "Fraktion", value: "UN" }] } }
  });
  const earth = doc.bodies.find((body) => body.id === "earth");
  assert.equal(earth.description, "Ozeanwelt.");
  assert.equal(earth.color_note, "blau");
  assert.equal(earth.source, "JPL");
  assert.deepEqual(bodyPlayerStats(doc, earth), [
    { label: "Fraktion", value: "UN" },
    { label: "Durchmesser", value: "12.742 km" }
  ]);
});

test("Eigene Koerper erhalten immer eine Beschreibung ihrer Darstellung", () => {
  const doc = normalize({
    version: 4,
    active_sector: "inneres-system",
    bodies: [{ id: "station", name: "Station", kind: "custom", is_custom: true, sector: "inneres-system", color: "#d4841c" }]
  });
  assert.equal(doc.bodies[0].color_note, "orange · vom GM festgelegt");
});

test("fehlende Gürtel werden ergänzt, bleiben aber aus Kampagnenrouten heraus", () => {
  const doc = normalize({
    version: 4,
    bodies,
    active_sector: "asteroidenguertel",
    group: { location_body_id: "asteroid-belt", destination_body_id: "kuiper-belt", status: "in-transit" },
    saved_views: [{
      id: "belt-view", name: "Gürtel", campaign_date: "2026-09-10", sector: "asteroidenguertel",
      selected_ids: ["sun", "asteroid-belt"], active_body_id: "asteroid-belt"
    }]
  });
  assert.equal(doc.bodies.find((body) => body.id === "asteroid-belt")?.kind, "belt");
  assert.equal(doc.bodies.find((body) => body.id === "kuiper-belt")?.kind, "belt");
  assert.deepEqual(doc.saved_views[0].selected_ids, ["sun", "asteroid-belt"]);
  assert.equal(doc.saved_views[0].active_body_id, "asteroid-belt");
  assert.equal(doc.group.location_body_id, null);
  assert.equal(doc.group.destination_body_id, null);
});

test("ein gespeicherter Gürtel folgt dem Seed und nicht seiner eigenen alten Kopie", () => {
  const doc = normalize({
    version: 4,
    active_sector: "asteroidenguertel",
    bodies: [...bodies, {
      id: "asteroid-belt", name: "Asteroidengürtel", kind: "belt",
      parent_id: "sun", sector: "inneres-system", semi_major_axis_au: 2.7
    }]
  });
  const belt = doc.bodies.filter((body) => body.id === "asteroid-belt");
  assert.equal(belt.length, 1, "der Gürtel steht genau einmal im Dokument");
  assert.equal(belt[0].parent_id, null, "der Gürtel hängt nicht mehr unter dem Stern");
  assert.equal(belt[0].sector, "asteroidenguertel", "der Gürtel liegt in seinem eigenen Sektor");
});

test("Version 3 behaelt Kampagnentext und erhaelt neue Katalogdaten", () => {
  const doc = normalize({
    version: 3,
    bodies: [bodies[0], { ...bodies[1], lore: "Alte Spielernotiz.", stats: [{ label: "Fraktion", value: "UN" }] }],
    active_sector: "inneres-system"
  });
  const earth = doc.bodies.find((body) => body.id === "earth");
  assert.equal(doc.version, 4);
  assert.equal(bodyPlayerLore(doc, earth), "Alte Spielernotiz.");
  assert.ok(earth.description);
  assert.ok(earth.stats.some((item) => item.label === "Durchmesser"));
  assert.ok(bodyPlayerStats(doc, earth).some((item) => item.label === "Fraktion"));
});

test("Gruppenposition und vollstaendige Ansicht werden normalisiert", () => {
  const doc = normalize({
    bodies,
    active_sector: "inneres-system",
    group: { name: "Hermes", objective: "  Kurs auf Sol halten.  ", show_transfer: false, location_body_id: "earth", destination_body_id: "sun", status: "in-transit" },
    last_view_id: "view-1",
    saved_views: [{
      id: "view-1", name: "Heimkehr", campaign_date: "10000-01-01", sector: "inneres-system",
      selected_ids: ["sun", "earth"], active_body_id: "earth",
      camera: { focus: "sun", auPerScreen: 4, zoom: 2, panX: 35, panY: -12 }
    }]
  });
  assert.deepEqual(doc.group, { name: "Hermes", objective: "Kurs auf Sol halten.", show_transfer: false, location_body_id: "earth", destination_body_id: "sun", status: "in-transit" });
  assert.equal(doc.saved_views[0].active_body_id, "earth");
  assert.deepEqual(doc.saved_views[0].camera, { focus: "sun", auPerScreen: 4, zoom: 2, panX: 35, panY: -12 });
  assert.equal(doc.saved_views[0].campaign_date, "10000-01-01");
  assert.equal(doc.last_view_id, "view-1");
});

test("eine nicht mehr vorhandene letzte Szene wird verworfen", () => {
  const doc = normalize({ bodies, active_sector: "inneres-system", last_view_id: "fehlt", saved_views: [] });
  assert.equal(doc.last_view_id, null);
});

test("die Foundry-Brücke liefert Arbeitsstand, Snapshot und Persistenz", async () => {
  const calls = [];
  globalThis.htmlAsScene = {
    mode: "gm",
    snapshot: { campaign_date: "2030-01-01" },
    storage: {
      load: () => ({ bodies, active_sector: "inneres-system", campaign_date: "2029-02-03" }),
      save: (value) => { calls.push(["save", value.campaign_date]); return Promise.resolve(); },
      clear: () => { calls.push(["clear"]); return Promise.resolve(); }
    },
    publish: (value) => { calls.push(["publish", value.campaign_date]); return Promise.resolve(); }
  };

  try {
    assert.equal(foundryMode(), "gm");
    assert.equal(load().campaign_date, "2029-02-03");
    assert.equal(initialPublishedSnapshot().campaign_date, "2030-01-01");
    persist({ campaign_date: "2031-04-05" });
    forget();
    await publishSnapshot({ campaign_date: "2032-06-07" });
    assert.deepEqual(calls, [["save", "2031-04-05"], ["clear"], ["publish", "2032-06-07"]]);
  } finally {
    delete globalThis.htmlAsScene;
  }
});
