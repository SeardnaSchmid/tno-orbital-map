/* Der Bestand kommt aus catalog.generated.js und wird von
 * scripts/build-seed.mjs aus data/raw/ erzeugt — dort steht auch, nach welchen
 * Grenzen zugeschnitten wurde. Von Hand gepflegt bleibt nur, was eine
 * Entscheidung ist und keine Messung: die Sektoren, die Gürtel und die
 * Kernauswahl.
 *
 * Planetare Bahnelemente stammen aus JPL SSD "Approximate Positions of the
 * Planets", Kleinkörper aus der SBDB, Monde aus Horizons. Der Bildschirm
 * lässt Inklination und jeden 3D-Term bewusst weg. */

import { CATALOG } from "./catalog.generated.js";

export const SECTORS = [
  { id: "inneres-system", name: "Inneres Sonnensystem", camera: { focus: "sun", auPerScreen: 3.4 } },
  { id: "asteroidenguertel", name: "Asteroidengürtel", camera: { focus: "sun", auPerScreen: 6 } },
  { id: "jupiter", name: "Jupiter", camera: { focus: "jupiter", auPerScreen: .04 } },
  { id: "saturn", name: "Saturn", camera: { focus: "saturn", auPerScreen: .03 } },
  { id: "aeusseres-system", name: "Äußeres Sonnensystem", camera: { focus: "sun", auPerScreen: 36 } },
  { id: "kuiper", name: "Kuipergürtel", camera: { focus: "sun", auPerScreen: 90 } }
];

export const BELTS = [
  {
    id: "asteroid-belt", name: "Asteroidengürtel", kind: "belt", is_custom: false,
    inner: 2.1, outer: 3.3, semi_major_axis_au: 2.7, eccentricity: 0,
    orbital_period_days: 0, epoch_anomaly_deg: 0, parent_id: null, inclination_deg: 0,
    radius_km: null, sector: "asteroidenguertel", color: "#b99356",
    color_note: "ockerfarbenes Trümmerfeld · schematische Dichte",
    tags: ["Region", "Kleinkörper", "Hauptgürtel"],
    description: "Ringförmige Region aus Millionen Kleinkörpern zwischen den Bahnen von Mars und Jupiter. Die Karte zeigt ihre Hauptzone schematisch, nicht einzelne Brocken maßstabsgetreu.",
    lore: "", stats: [
      { label: "Radiale Zone", value: "2,1–3,3 AE" },
      { label: "Breite", value: "1,2 AE" }
    ], source: "Kuratiertes Kartenmodell", source_url: ""
  },
  {
    id: "kuiper-belt", name: "Kuipergürtel", kind: "belt", is_custom: false,
    inner: 30, outer: 50, semi_major_axis_au: 40, eccentricity: 0,
    orbital_period_days: 0, epoch_anomaly_deg: 0, parent_id: null, inclination_deg: 0,
    radius_km: null, sector: "kuiper", color: "#779bac",
    color_note: "blaugraues Eisfeld · schematische Dichte",
    tags: ["Region", "Kleinkörper", "Transneptunisch"],
    description: "Weiträumige Population eisreicher Kleinkörper jenseits der Neptunbahn. Die Karte fasst die klassische Gürtelzone schematisch zusammen.",
    lore: "", stats: [
      { label: "Radiale Zone", value: "30–50 AE" },
      { label: "Breite", value: "20 AE" }
    ], source: "Kuratiertes Kartenmodell", source_url: ""
  }
];

/* Ringsysteme sind eine Setzung wie die Gürtel — keine der drei Quellen führt
 * ein Ring-Merkmal. `inner` und `outer` sind Vielfache des Körperradius, die
 * Deckkraft trennt Saturn von den drei Systemen, die man am Tisch nur ahnt.
 * Aus der Aufsicht ist ein Ring ein Kreisring; `division` ist bei Saturn die
 * Cassinische Teilung. */
export const RING_SYSTEMS = {
  jupiter: { inner: 1.72, outer: 1.85, opacity: .3 },
  saturn: { inner: 1.24, outer: 2.35, division: 2.06, opacity: .95 },
  uranus: { inner: 1.64, outer: 2.01, opacity: .45 },
  neptune: { inner: 1.69, outer: 2.55, opacity: .35 }
};

/* Was beim Öffnen eines Sektors schon liegt. Der Katalog trägt rund
 * sechshundert Körper; alle gleichzeitig zu zeichnen wäre kein Kartenbild,
 * sondern ein Knäuel. Die Auswahl ist eine Setzung — der Rest steht über
 * **Körper** vollständig zur Verfügung und ist einen Klick entfernt. */
export const KERNAUSWAHL = [
  "sun",
  "mercury", "venus", "earth", "mars", "luna", "phobos", "deimos",
  "asteroid-belt", "ceres", "vesta", "pallas", "hygiea", "juno", "psyche",
  "jupiter", "io", "europa", "ganymede", "callisto", "amalthea",
  "saturn", "titan", "enceladus", "mimas", "rhea", "dione", "tethys", "iapetus",
  "uranus", "titania", "oberon", "miranda", "ariel", "umbriel",
  "neptune", "triton", "nereid", "proteus",
  "chiron", "1p-halley",
  "kuiper-belt", "pluto", "charon", "haumea", "makemake", "eris",
  "quaoar", "sedna", "orcus", "gonggong", "arrokoth"
];

export const BODIES = [...CATALOG, ...BELTS];

export const SEED = {
  version: 4,
  reference_epoch: "2000-01-01",
  campaign_date: "2026-09-09",
  bodies: BODIES,
  body_overrides: {},
  group: { name: "GRUPPE", objective: "", show_transfer: true, location_body_id: null, destination_body_id: null, status: "unknown" },
  saved_views: [],
  active_sector: "inneres-system"
};
