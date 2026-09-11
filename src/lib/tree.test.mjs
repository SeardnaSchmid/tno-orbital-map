import assert from "node:assert/strict";
import test from "node:test";
import { buildTree, sichtbareIds, trifftSuche } from "./tree.js";
import { BODIES, SECTORS } from "./seed.js";

const alleKnoten = (baum) => baum.flatMap((sektor) => sektor.gruppen.flatMap(function tief(gruppeOderKnoten) {
  const knoten = gruppeOderKnoten.knoten ?? [gruppeOderKnoten];
  return knoten.flatMap((k) => [k, ...k.kinder.flatMap((kind) => tief(kind))]);
}));

test("jeder Körper steht genau einmal im Baum", () => {
  const baum = buildTree(BODIES, SECTORS);
  const gezeigt = alleKnoten(baum).map((knoten) => knoten.koerper.id);
  assert.equal(gezeigt.length, new Set(gezeigt).size, "ein Körper erscheint doppelt");
  assert.equal(new Set(gezeigt).size, BODIES.length, "ein Körper fehlt im Baum");
});

test("ein Mond hängt unter seinem Primärkörper, nicht daneben", () => {
  const baum = buildTree(BODIES, SECTORS);
  const knoten = new Map(alleKnoten(baum).map((k) => [k.koerper.id, k]));
  const luna = knoten.get("luna");
  assert.ok(luna, "Luna fehlt");
  const erde = knoten.get("earth");
  assert.ok(erde.kinder.some((kind) => kind.koerper.id === "luna"), "Luna hängt nicht unter der Erde");
  assert.ok(knoten.get("jupiter").kinder.some((k) => k.koerper.id === "io"), "Io hängt nicht unter Jupiter");
});

test("beide Gürtel sind eigenständige auswählbare Körper", () => {
  const baum = buildTree(BODIES, SECTORS);
  const knoten = new Map(alleKnoten(baum).map((k) => [k.koerper.id, k]));
  assert.equal(knoten.get("asteroid-belt")?.koerper.kind, "belt");
  assert.equal(knoten.get("kuiper-belt")?.koerper.kind, "belt");
  assert.ok(baum.flatMap((sektor) => sektor.gruppen).some((gruppe) => gruppe.id === "belt"));
});

test("Sol steht in der Bilanz wie jeder andere Körper — er lässt sich abwählen", () => {
  const baum = buildTree(BODIES, SECTORS);
  const inneres = baum.find((sektor) => sektor.id === "inneres-system");
  assert.ok(inneres.ids.includes("sun"), "Sol fehlt in der Bilanz seines Sektors");
});

test("die Bilanz eines Sektors deckt sich mit seinem Bestand", () => {
  const baum = buildTree(BODIES, SECTORS);
  for (const sektor of baum) {
    const erwartet = BODIES.filter((k) => k.sector === sektor.id).length;
    assert.equal(sektor.ids.length, erwartet, `${sektor.name} zählt falsch`);
    assert.equal(sektor.ids.length, new Set(sektor.ids).size, `${sektor.name} zählt doppelt`);
  }
});

test("die Suche greift auf Namen und auf Tags", () => {
  assert.ok(trifftSuche({ name: "Ganymed", tags: [] }, "gany"));
  assert.ok(trifftSuche({ name: "Pluto", tags: ["Plutoid"] }, "plutoid"));
  assert.ok(!trifftSuche({ name: "Pluto", tags: [] }, "komet"));
});

test("ein Treffer zieht seine Primärkörper mit in den Baum", () => {
  const ids = sichtbareIds(BODIES, "charon");
  assert.ok(ids.has("charon"), "Charon fehlt");
  assert.ok(ids.has("pluto"), "Pluto fehlt als Ast über Charon");
});

test("eine Suche nach einem Tag findet die ganze Menge", () => {
  const baum = buildTree(BODIES, SECTORS, "plutoid");
  const namen = alleKnoten(baum).filter((k) => k.treffer).map((k) => k.koerper.name).sort();
  assert.deepEqual(namen, ["Eris", "Haumea", "Makemake", "Pluto"]);
});

test("eine Suche ohne Treffer liefert einen leeren Baum", () => {
  assert.deepEqual(buildTree(BODIES, SECTORS, "gibtesnicht"), []);
});

test("ein eigener Koerper erscheint unabhaengig von seiner Marker-Art nur einmal", () => {
  const custom = { id: "station", name: "Station", kind: "asteroid", is_custom: true, sector: "inneres-system", parent_id: "sun" };
  const baum = buildTree([...BODIES, custom], SECTORS);
  const treffer = alleKnoten(baum).filter((knoten) => knoten.koerper.id === custom.id);
  assert.equal(treffer.length, 1);
});
