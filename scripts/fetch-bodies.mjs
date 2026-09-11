/* Holt den Rohbestand des Sonnensystems von JPL in den Cache unter data/raw/.
 * Das ist ein Werkzeug für die Werkbank, nicht für den Spieltisch: es läuft
 * einmal mit Netz, schreibt JSON auf die Platte und rührt den Build nicht an.
 * Welche dieser Körper später im Blatt landen, entscheidet build-seed.mjs.
 *
 *   node scripts/fetch-bodies.mjs            # H < 15, der übliche Bestand
 *   node scripts/fetch-bodies.mjs --hmax=20  # weiter aufgemacht
 *   node scripts/fetch-bodies.mjs --all      # wirklich alles, ~1,6 Mio, ~200 MB
 *   node scripts/fetch-bodies.mjs --force    # Cache verwerfen und neu holen
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const ROH = join(HIER, "..", "data", "raw");

const argv = process.argv.slice(2);
const flagge = (name) => argv.some((a) => a === `--${name}`);
const wert = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const FORCE = flagge("force");
const ALLES = flagge("all");
const HMAX = Number(wert("hmax") ?? 15);

/* SBDB liefert Bahnelemente in genau der Form, die das Blatt braucht:
 * a in AU, e dimensionslos, per in Tagen, ma in Grad zur Epoche. */
const SBDB_FELDER = [
  "spkid", "pdes", "name", "full_name", "kind", "class",
  "a", "e", "i", "om", "w", "per", "ma", "epoch",
  "H", "diameter", "extent", "GM", "density", "albedo", "rot_per",
  "BV", "UB", "IR", "spec_T", "spec_B"
];

const AU_KM = 149597870.7;
const J2000 = 2451545.0;

const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

async function hole(url, { text = false } = {}) {
  for (let versuch = 1; versuch <= 4; versuch++) {
    try {
      const antwort = await fetch(url, { headers: { "User-Agent": "navigationstisch/1.0" } });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
      return text ? await antwort.text() : await antwort.json();
    } catch (fehler) {
      if (versuch === 4) throw fehler;
      await schlaf(versuch * 1500);
    }
  }
}

function cache(name, bauen) {
  const pfad = join(ROH, name);
  if (!FORCE && existsSync(pfad)) {
    const kb = (statSync(pfad).size / 1024).toFixed(0);
    console.log(`· ${name} liegt schon im Cache (${kb} KB)`);
    return JSON.parse(readFileSync(pfad, "utf8"));
  }
  return bauen().then((daten) => {
    writeFileSync(pfad, JSON.stringify(daten));
    const kb = (statSync(pfad).size / 1024).toFixed(0);
    console.log(`✓ ${name} geschrieben (${kb} KB)`);
    return daten;
  });
}

/* ---- Kleinkörper: ein einziger Aufruf, die API paginiert nicht ------------ */

async function kleinkoerper() {
  const url = new URL("https://ssd-api.jpl.nasa.gov/sbdb_query.api");
  url.searchParams.set("fields", SBDB_FELDER.join(","));
  if (!ALLES) url.searchParams.set("sb-cdata", JSON.stringify({ AND: [`H|LT|${HMAX}`] }));
  console.log(ALLES ? "→ SBDB: alle Kleinkörper …" : `→ SBDB: alle Kleinkörper mit H < ${HMAX} …`);

  const roh = await hole(url);
  const schluessel = roh.fields;
  const zeilen = roh.data.map((zeile) => Object.fromEntries(schluessel.map((k, i) => [k, zeile[i]])));

  /* Kometen tragen keine Helligkeitsgrenze mit sich; sie werden immer voll
   * geholt, sonst fehlt genau der Rand des Euler-Diagramms. */
  if (!ALLES) {
    const kometen = new URL("https://ssd-api.jpl.nasa.gov/sbdb_query.api");
    kometen.searchParams.set("fields", SBDB_FELDER.join(","));
    kometen.searchParams.set("sb-kind", "c");
    console.log("→ SBDB: alle Kometen …");
    const rohK = await hole(kometen);
    const bekannt = new Set(zeilen.map((z) => z.spkid));
    for (const zeile of rohK.data) {
      const satz = Object.fromEntries(rohK.fields.map((k, i) => [k, zeile[i]]));
      if (!bekannt.has(satz.spkid)) zeilen.push(satz);
    }
  }
  return zeilen;
}

/* ---- Monde: Horizons kennt sie über die Major-Body-Liste ------------------ */

const PLANETEN = { 1: "mercury", 2: "venus", 3: "earth", 4: "mars", 5: "jupiter", 6: "saturn", 7: "uranus", 8: "neptune", 9: "pluto" };

async function mondListe() {
  const text = await hole("https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND=%27MB%27", { text: true });
  const monde = [];
  for (const zeile of text.split("\n")) {
    const treffer = zeile.match(/^\s{2,}(\d{3})\s\s+(\S.*?)\s{2,}/);
    if (!treffer) continue;
    const id = Number(treffer[1]);
    if (id % 100 === 99 || !PLANETEN[Math.floor(id / 100)]) continue;
    monde.push({ horizons_id: id, name: treffer[2].trim(), parent: PLANETEN[Math.floor(id / 100)] });
  }
  return monde;
}

function elementeAusText(text) {
  const block = text.split("$$SOE")[1]?.split("$$EOE")[0];
  if (!block) return null;
  const zahl = (name) => {
    /* Ohne die Grenze davor verschluckt `A` den Wert von `MA` — Horizons
     * schreibt beide in denselben Block. */
    const treffer = block.match(new RegExp(`(?<![A-Za-z])${name}\\s*=\\s*(-?[\\d.]+E?[+-]?\\d*)`));
    return treffer ? Number(treffer[1]) : null;
  };
  const a = zahl("A"), pr = zahl("PR");
  if (a == null || pr == null) return null;
  return {
    semi_major_axis_au: a / AU_KM,
    eccentricity: zahl("EC"),
    inclination_deg: zahl("IN"),
    orbital_period_days: pr / 86400,
    epoch_anomaly_deg: zahl("MA")
  };
}

/* Horizons schreibt die Geophysik seiner Major Bodies nicht als Tabelle,
 * sondern in den Kopf des Klartexts. Die Benennungen unterscheiden sich von
 * Mond zu Mond; deshalb lesen wir nur die wenigen stabilen Schlüssel und
 * lassen nicht vorhandene Messungen ausdrücklich weg. */
function physikAusText(text) {
  const kopf = text.split("$$SOE")[0] ?? "";
  const wert = (...muster) => {
    for (const name of muster) {
      const treffer = kopf.match(new RegExp(`${name}\\s*=\\s*([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:E[+-]?\\d+)?)`, "i"));
      if (treffer) return Number(treffer[1]);
    }
    return null;
  };
  const synchron = /Rotational period\s*=\s*synchronous/i.test(kopf);
  const physik = {
    mean_radius_km: wert("Vol\\. mean radius, km", "Mean radius \\(km\\)", "Radius \\(km, IAU\\d+\\)", "Radius \\(km\\)"),
    density_g_cm3: wert("Density \\(g cm\\^-3\\)", "Density, g/cm\\^3"),
    gm_km3_s2: wert("GM \\(km\\^3/s\\^2\\)", "GM, km\\^3/s\\^2"),
    albedo: wert("Geometric Albedo"),
    visual_magnitude: wert("V\\(1,0\\)"),
    synchronous_rotation: synchron || null
  };
  return Object.fromEntries(Object.entries(physik).filter(([, v]) => v != null));
}

async function monde() {
  const liste = await mondListe();
  console.log(`→ Horizons: ${liste.length} Monde, Bahnelemente zur Epoche J2000 …`);
  const fertig = [];
  for (const [index, mond] of liste.entries()) {
    const zentrum = `500@${Math.floor(mond.horizons_id / 100) * 100 + 99}`;
    const url = new URL("https://ssd.jpl.nasa.gov/api/horizons.api");
    for (const [k, v] of Object.entries({
      format: "text", COMMAND: `'${mond.horizons_id}'`, OBJ_DATA: "YES",
      MAKE_EPHEM: "YES", EPHEM_TYPE: "ELEMENTS", CENTER: `'${zentrum}'`,
      OUT_UNITS: "KM-S", TLIST: String(J2000)
    })) url.searchParams.set(k, v);

    try {
      const text = await hole(url, { text: true });
      const elemente = elementeAusText(text);
      if (elemente) fertig.push({ ...mond, ...elemente, physical: physikAusText(text) });
    } catch { /* Ein Mond ohne Ephemeride fehlt einfach; das Blatt lebt weiter. */ }
    if ((index + 1) % 25 === 0) console.log(`  … ${index + 1}/${liste.length}`);
    await schlaf(120);
  }
  return fertig;
}

/* ---- Lauf ---------------------------------------------------------------- */

mkdirSync(ROH, { recursive: true });
const kleine = await cache("sbdb.json", kleinkoerper);
const satelliten = await cache("satellites.json", monde);

const klassen = {};
for (const koerper of kleine) klassen[koerper.class] = (klassen[koerper.class] ?? 0) + 1;
console.log(`\nRohbestand: ${kleine.length} Kleinkörper, ${satelliten.length} Monde`);
console.log(Object.entries(klassen).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join("  "));
