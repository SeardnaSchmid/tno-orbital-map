import assert from "node:assert/strict";
import test from "node:test";
import { forget, foundryMode, initialPublishedSnapshot, load, normalize, persist, publishSnapshot } from "./storage.js";
import { bodyDisplayName, bodyPlayerLore, bodyPlayerStats, bodyPlayerTags } from "./presentation.js";
import { BODIES } from "./seed.js";

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

test("ein gespeicherter Teilbestand wird wieder um den ganzen Katalog ergänzt", () => {
  const doc = normalize({
    version: 6,
    bodies,
    active_sector: "inneres-system",
    body_overrides: { earth: { alias: "Terra", lore: "Nicht verlieren." } }
  });
  assert.equal(doc.bodies.length, BODIES.length);
  assert.ok(doc.bodies.some((body) => body.id === "pluto"), "Pluto fehlt aus dem ergänzten Katalog");
  assert.equal(doc.body_overrides.earth.alias, "Terra");
  assert.equal(doc.body_overrides.earth.lore, "Nicht verlieren.");
});

test("ein leer gespeicherter Bestand lädt den vollständigen Katalog", () => {
  const doc = normalize({ version: 6, bodies: [], active_sector: "inneres-system" });
  assert.equal(doc.bodies.length, BODIES.length);
});

test("eigene Körper bleiben zusätzlich zum ergänzten Katalog erhalten", () => {
  const station = {
    id: "station", name: "Station", kind: "custom", is_custom: true,
    sector: "inneres-system", parent_id: "earth", semi_major_axis_au: .0001
  };
  const doc = normalize({ version: 6, bodies: [bodies[0], station], active_sector: "inneres-system" });
  assert.equal(doc.bodies.length, BODIES.length + 1);
  assert.equal(doc.bodies.find((body) => body.id === "station")?.parent_id, "earth");
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
  assert.equal(doc.bodies.find((body) => body.id === "station")?.color_note, "orange · vom GM festgelegt");
});

test("fehlende Gürtel werden ergänzt, bleiben aber aus Missionen heraus", () => {
  const doc = normalize({
    version: 4,
    bodies,
    active_sector: "asteroidenguertel",
    route: { source_body_id: "asteroid-belt", destination_body_id: "kuiper-belt", calculation: "direct" },
    missions: [{ id: "belt-targets", target_ids: ["asteroid-belt", "kuiper-belt"] }],
    saved_views: [{
      id: "belt-view", name: "Gürtel", campaign_date: "2026-09-10", sector: "asteroidenguertel",
      selected_ids: ["sun", "asteroid-belt"], active_body_id: "asteroid-belt"
    }]
  });
  assert.equal(doc.bodies.find((body) => body.id === "asteroid-belt")?.kind, "belt");
  assert.equal(doc.bodies.find((body) => body.id === "kuiper-belt")?.kind, "belt");
  assert.deepEqual(doc.saved_views[0].selected_ids, ["sun", "asteroid-belt"]);
  assert.equal(doc.saved_views[0].active_body_id, "asteroid-belt");
  assert.deepEqual(doc.route, { source_body_id: null, destination_body_id: null, calculation: "direct" });
  assert.deepEqual(doc.missions, [{ id: "belt-targets", objective: "", target_ids: [] }]);
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
  assert.equal(doc.version, 6);
  assert.equal(bodyPlayerLore(doc, earth), "Alte Spielernotiz.");
  assert.ok(earth.description);
  assert.ok(earth.stats.some((item) => item.label === "Durchmesser"));
  assert.ok(bodyPlayerStats(doc, earth).some((item) => item.label === "Fraktion"));
});

test("alte Kampagnenroute wird in Route und Missionsziel aufgeteilt", () => {
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
  assert.deepEqual(doc.route, { source_body_id: "earth", destination_body_id: "sun", calculation: "direct" });
  assert.deepEqual(doc.missions, [{ id: "mission-1", objective: "Kurs auf Sol halten.", target_ids: ["sun"] }]);
  assert.equal(doc.active_mission_id, "mission-1");
  assert.equal("group" in doc, false);
  assert.equal(doc.saved_views[0].active_body_id, "earth");
  assert.deepEqual(doc.saved_views[0].camera, { focus: "sun", auPerScreen: 4, zoom: 2, panX: 35, panY: -12 });
  assert.equal(doc.saved_views[0].campaign_date, "10000-01-01");
  assert.equal(doc.last_view_id, "view-1");
});

test("alte Missionen behalten Aufgaben und Ziele, die aktive Route wird getrennt", () => {
  const doc = normalize({
    version: 5,
    bodies,
    active_sector: "inneres-system",
    missions: [
      { id: "hinflug", objective: "Zum Mars.", source_body_id: "earth", destination_body_id: "sun", calculation: "hohmann" },
      { id: "rueckflug", objective: "Zurück.", source_body_id: "sun", destination_body_id: "earth", calculation: "direct" }
    ],
    active_mission_id: "rueckflug"
  });
  assert.equal(doc.missions.length, 2);
  assert.deepEqual(doc.missions[0], { id: "hinflug", objective: "Zum Mars.", target_ids: ["sun"] });
  assert.deepEqual(doc.missions[1], { id: "rueckflug", objective: "Zurück.", target_ids: ["earth"] });
  assert.deepEqual(doc.route, { source_body_id: "sun", destination_body_id: "earth", calculation: "direct" });
  assert.equal(doc.active_mission_id, "rueckflug");
});

test("eine Mission bewahrt mehrere eindeutige Ziele", () => {
  const doc = normalize({
    version: 6,
    bodies,
    active_sector: "inneres-system",
    route: { source_body_id: "sun", destination_body_id: "earth", calculation: "hohmann" },
    missions: [{ id: "erkundung", objective: "Beide prüfen.", target_ids: ["earth", "sun", "earth", "asteroid-belt"] }]
  });
  assert.deepEqual(doc.missions, [{ id: "erkundung", objective: "Beide prüfen.", target_ids: ["earth", "sun"] }]);
  assert.deepEqual(doc.route, { source_body_id: "sun", destination_body_id: "earth", calculation: "hohmann" });
});

test("eine Mission darf ohne Ziel gespeichert werden", () => {
  const doc = normalize({
    version: 6,
    bodies,
    active_sector: "inneres-system",
    missions: [{ id: "leer", objective: "Ohne Ziel", target_ids: [] }],
    active_mission_id: "leer"
  });
  assert.deepEqual(doc.missions, [{ id: "leer", objective: "Ohne Ziel", target_ids: [] }]);
  assert.equal(doc.active_mission_id, "leer");
});

test("höchstens drei Missionen werden aktiv gehalten", () => {
  const doc = normalize({
    version: 6,
    bodies,
    active_sector: "inneres-system",
    missions: [
      { id: "eins", target_ids: [] },
      { id: "zwei", target_ids: ["earth"] },
      { id: "drei", target_ids: ["sun"] },
      { id: "vier", target_ids: ["earth"] }
    ],
    active_mission_id: "vier"
  });
  assert.deepEqual(doc.missions.map((mission) => mission.id), ["eins", "zwei", "drei"]);
  assert.equal(doc.active_mission_id, "eins");
});

test("eine Szene kann bewusst keine Mission enthalten", () => {
  const doc = normalize({
    version: 6,
    bodies,
    active_sector: "inneres-system",
    missions: [{ id: "aktuell", objective: "Aktuell", target_ids: ["earth"] }],
    active_mission_id: "aktuell",
    saved_views: [{ id: "ohne", name: "Ohne Mission", sector: "inneres-system", missions: [], active_mission_id: null }]
  });
  assert.deepEqual(doc.saved_views[0].missions, []);
  assert.equal(doc.saved_views[0].active_mission_id, null);
});

test("doppelte Missions-IDs werden beim Import eindeutig", () => {
  const doc = normalize({
    version: 6,
    bodies,
    active_sector: "inneres-system",
    missions: [
      { id: "mission-2", objective: "A", target_ids: ["earth"] },
      { id: "mission-2", objective: "B", target_ids: ["sun"] }
    ]
  });
  assert.equal(new Set(doc.missions.map((mission) => mission.id)).size, 2);
  assert.equal(doc.active_mission_id, doc.missions[0].id);
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
    await forget();
    await publishSnapshot({ campaign_date: "2032-06-07" });
    assert.deepEqual(calls, [["save", "2031-04-05"], ["clear"], ["publish", "2032-06-07"]]);
  } finally {
    delete globalThis.htmlAsScene;
  }
});
