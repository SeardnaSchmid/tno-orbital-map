/* Macht aus dem Rohbestand unter data/raw/ die Vorauswahl des Blatts.
 * Netzfrei und deterministisch: dieselben Rohdaten ergeben dieselbe Datei.
 * Hier wird entschieden, WIE VIEL vom Sonnensystem auf dem Tisch liegt —
 * geholt ist längst alles.
 *
 *   node scripts/build-seed.mjs
 *   node scripts/build-seed.mjs --guertel=9 --tno=alle   # weiter aufgemacht
 *   node scripts/build-seed.mjs --zaehlen                # nur die Bilanz
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const ROH = join(HIER, "..", "data", "raw");
const ZIEL = join(HIER, "..", "src", "lib", "catalog.generated.js");

const argv = process.argv.slice(2);
const wert = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const NUR_ZAEHLEN = argv.includes("--zaehlen");

/* Die Stellschrauben. H ist zwischen den Gruppen nicht vergleichbar — ein TNO
 * mit H 7 ist ein paar hundert Kilometer groß, ein Gürtelkörper mit H 7 rund
 * hundert; Kometen tragen überhaupt kein H. Darum schneidet jede Gruppe
 * anders ab: innen nach Helligkeit, außen nach Namen. Wer benannt ist, ist am
 * Tisch nennbar. */
const AUSWAHL = {
  guertel: Number(wert("guertel") ?? 8),     // H-Grenze für MBA/IMB/OMB/MCA
  trojaner: Number(wert("trojaner") ?? 9),   // H-Grenze für die Jupiter-Trojaner
  erdnah: Number(wert("erdnah") ?? 16),      // H-Grenze für NEO (AMO/APO/ATE)
  tno: wert("tno") ?? "benannt",             // "benannt" | "alle" | H-Grenze
  zentauren: wert("zentauren") ?? "benannt",
  kometen: Number(wert("kometen") ?? 100)    // periodische Kometen bis 100P
};

const AU = 149597870.7;
const NEPTUN_A = 30.069923;
/* Sol steht in keiner der drei Quellen mit Radius; die Karte braucht ihn
 * trotzdem, weil die Markergröße aus dem Radius kommt. */
const SONNE_RADIUS_KM = 695700;
const QUELLEN = {
  science: "https://science.nasa.gov/solar-system/",
  planets: "https://ssd.jpl.nasa.gov/planets/phys_par.html",
  horizons: "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
  sbdb: "https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html"
};

/* ---- Der handgesetzte Kern -----------------------------------------------
 * Die acht Planeten kommen weiter von JPL SSD "Approximate Positions of the
 * Planets"; sie stehen in keiner Kleinkörper-Datenbank. Die IDs der schon
 * vorhandenen Körper bleiben, was sie sind — gespeicherte Ansichten und der
 * Stand im Browser hängen daran. */
const PLANETEN = [
  ["sun", "Sol", "star", 0, 0, 0, 0, "inneres-system", null, { color: "#d4841c", tags: ["G2V", "Zentralstern"] }],
  ["mercury", "Merkur", "planet", .387099, .205636, 87.969, 174.793, "inneres-system"],
  ["venus", "Venus", "planet", .723336, .006777, 224.701, 50.377, "inneres-system"],
  ["earth", "Erde", "planet", 1.000003, .016711, 365.256, 357.527, "inneres-system"],
  ["mars", "Mars", "planet", 1.523710, .093394, 686.980, 19.390, "inneres-system"],
  ["jupiter", "Jupiter", "planet", 5.202887, .048386, 4332.589, 19.668, "jupiter"],
  ["saturn", "Saturn", "planet", 9.536676, .053862, 10759.22, 317.355, "saturn"],
  ["uranus", "Uranus", "planet", 19.189165, .047257, 30688.5, 142.284, "aeusseres-system"],
  ["neptune", "Neptun", "planet", 30.069923, .008590, 60182, 259.915, "aeusseres-system"]
];

/* Physische Kerndaten aus JPL SSD "Planetary Physical Parameters". Werte aus
 * der Tabelle bleiben Zahlen; die deutsche Darstellung entsteht erst beim
 * Bau der Spielerzeilen. Negative Rotationsperioden bedeuten retrograd. */
const PLANET_PHYSIK = {
  mercury: { mean_radius_km: 2439.4, mass_kg: .330103e24, density_g_cm3: 5.4289, rotation_days: 58.6462, albedo: .106, gravity_ms2: 3.70, escape_kms: 4.25 },
  venus: { mean_radius_km: 6051.8, mass_kg: 4.86731e24, density_g_cm3: 5.243, rotation_days: -243.018, albedo: .65, gravity_ms2: 8.87, escape_kms: 10.36 },
  earth: { mean_radius_km: 6371.0084, mass_kg: 5.97217e24, density_g_cm3: 5.5134, rotation_days: .99726968, albedo: .367, gravity_ms2: 9.80, escape_kms: 11.19 },
  mars: { mean_radius_km: 3389.50, mass_kg: .641691e24, density_g_cm3: 3.9340, rotation_days: 1.02595676, albedo: .150, gravity_ms2: 3.71, escape_kms: 5.03 },
  jupiter: { mean_radius_km: 69911, mass_kg: 1898.125e24, density_g_cm3: 1.3262, rotation_days: .41354, albedo: .52, gravity_ms2: 24.79, escape_kms: 60.20 },
  saturn: { mean_radius_km: 58232, mass_kg: 568.317e24, density_g_cm3: .6871, rotation_days: .44401, albedo: .47, gravity_ms2: 10.44, escape_kms: 36.09 },
  uranus: { mean_radius_km: 25362, mass_kg: 86.8099e24, density_g_cm3: 1.270, rotation_days: -.71833, albedo: .51, gravity_ms2: 8.87, escape_kms: 21.38 },
  neptune: { mean_radius_km: 24622, mass_kg: 102.4092e24, density_g_cm3: 1.638, rotation_days: .67125, albedo: .41, gravity_ms2: 11.15, escape_kms: 23.56 },
  ceres: { mean_radius_km: 469.7, mass_kg: 938.416e18, density_g_cm3: 2.162, rotation_days: .37809042, albedo: .090, gravity_ms2: .27, escape_kms: .51 },
  pluto: { mean_radius_km: 1188.3, mass_kg: 13024.6e18, density_g_cm3: 1.853, rotation_days: -6.3872, albedo: .3, gravity_ms2: .62, escape_kms: 1.21 },
  eris: { mean_radius_km: 1200, mass_kg: 16600e18, density_g_cm3: 2.3, rotation_days: 1.079, albedo: .84, gravity_ms2: .77, escape_kms: 1.36 },
  makemake: { mean_radius_km: 714, mass_kg: 3100e18, density_g_cm3: 2.1, rotation_days: .937, albedo: .81, gravity_ms2: .40, escape_kms: .76 },
  haumea: { mean_radius_km: 715, mass_kg: 4006e18, density_g_cm3: 2.6, rotation_days: .1631, albedo: .72, gravity_ms2: .35, escape_kms: .78 }
};

const KERNFAKTEN = {
  sun: "Gelber Hauptreihenstern und dynamisches Zentrum des Sonnensystems.",
  mercury: "Sonnennächster und kleinster Planet; sein Jahr dauert nur knapp 88 Erdtage.",
  venus: "Trotz größerer Sonnenferne ist Venus der heißeste Planet; sie rotiert retrograd.",
  earth: "Einziger bekannter Himmelskörper mit dauerhaft flüssigem Oberflächenwasser und Leben.",
  mars: "Kalter Wüstenplanet mit Olympus Mons, dem größten bekannten Vulkan des Sonnensystems.",
  jupiter: "Größter Planet des Sonnensystems; der Große Rote Fleck ist ein langlebiger Sturm.",
  saturn: "Gasriese mit dem auffälligsten Ringsystem und einer mittleren Dichte unter der von Wasser.",
  uranus: "Eisriese, dessen Rotationsachse fast in seiner Bahnebene liegt.",
  neptune: "Äußerster Planet und Schauplatz der schnellsten gemessenen planetaren Winde.",
  luna: "Gebunden rotierender Begleiter der Erde; seine Gravitation prägt die irdischen Gezeiten.",
  phobos: "Der größere Marsmond sinkt langsam ab und könnte künftig zerbrechen oder auf Mars stürzen.",
  deimos: "Kleiner, dunkler Marsmond auf einer nahezu kreisförmigen äußeren Bahn.",
  io: "Vulkanisch aktivster Körper des Sonnensystems, angetrieben durch Gezeitenheizung.",
  europa: "Eismond mit starken Hinweisen auf einen globalen Salzwasserozean unter der Oberfläche.",
  ganymede: "Größter Mond des Sonnensystems und der einzige bekannte Mond mit eigenem Magnetfeld.",
  callisto: "Stark verkraterter Eismond; seine alte Oberfläche bewahrt frühe Einschlagsgeschichte.",
  titan: "Einziger Mond mit dichter Atmosphäre; Methan und Ethan bilden Seen und Meere an der Oberfläche.",
  enceladus: "Eismond mit einem unterirdischen Ozean, der Wasserdampf-Fontänen ins All speist.",
  triton: "Großer Neptunmond auf retrograder Bahn, wahrscheinlich ein eingefangener Kuipergürtelkörper.",
  charon: "Plutos größter Mond ist im Verhältnis zu seinem Primärkörper ungewöhnlich groß.",
  ceres: "Größter Körper des Asteroidengürtels und erster Zwergplanet, den eine Raumsonde umkreiste.",
  pluto: "Eisige Welt mit einer herzförmigen Stickstoffebene; New Horizons passierte sie 2015.",
  haumea: "Sehr schnell rotierender, langgestreckter Zwergplanet mit einem Ringsystem.",
  makemake: "Methaneisreicher Zwergplanet und eines der hellsten Objekte des Kuipergürtels.",
  eris: "Die Entdeckung dieser massereichen fernen Welt trug zur Planetendefinition von 2006 bei.",
  vesta: "Differenzierter Protoplanet mit Kruste, Mantel und Kern; Dawn umkreiste ihn 2011–2012.",
  psyche: "Großer, metallreicher Asteroid; seine genaue Zusammensetzung ist Ziel der NASA-Mission Psyche.",
  sedna: "Extrem fernes Objekt auf einer stark exzentrischen, jahrtausendelangen Bahn.",
  arrokoth: "Kontaktbinärer Kuipergürtelkörper und bislang fernstes von einer Sonde besuchtes Objekt.",
  "1p-halley": "Berühmter kurzperiodischer Komet; seine Wiederkehr ist seit der Antike dokumentiert."
};

const KERNFARBEN = {
  sun: ["#e1a743", "gelbweiß · Stern"], mercury: ["#aaa59b", "warmgrau · Gesteinswelt"],
  venus: ["#d8bd82", "cremegelb · Wolkendecke"], earth: ["#5f9ec4", "blau · Ozeanwelt"],
  mars: ["#bd7250", "rostrot · Eisenoxide"], jupiter: ["#c59b72", "ocker · Wolkenbänder"],
  saturn: ["#d5bd82", "blassgold · Wolkenbänder"], uranus: ["#83c1c4", "cyan · Methanatmosphäre"],
  neptune: ["#567fbd", "blau · Methanatmosphäre"], luna: ["#aeb2ad", "grau · Regolith"],
  io: ["#d1b84f", "gelb · Schwefelablagerungen"], europa: ["#c9b99d", "eisbeige · Liniengelände"],
  ganymede: ["#9c8774", "graubraun · Eis und Gestein"], callisto: ["#756f67", "dunkelgrau · Kraterlandschaft"],
  titan: ["#c78b43", "orange · Atmosphärendunst"], enceladus: ["#b8d5d8", "eisblau · Wassereis"],
  triton: ["#b7afb1", "blassrosa · Stickstoffeis"], pluto: ["#b99778", "beige · Eis und Tholine"],
  charon: ["#969493", "neutralgrau · Wassereis"], ceres: ["#858681", "dunkelgrau · hydratisierte Minerale"],
  haumea: ["#bdc4c2", "hellgrau · Wassereis"], makemake: ["#b08b79", "rötlich · Methaneis"],
  eris: ["#c4c1b7", "hellgrau · Methaneis"], sedna: ["#a56755", "dunkelrot · Tholine"],
  arrokoth: ["#9b5f50", "rötlich · organische Stoffe"]
};

/* Die fünf von der IAU anerkannten Zwergplaneten, über ihre SPK-ID. */
const ZWERGPLANETEN = new Set([2000001, 20000001, 2134340, 20134340, 2136108, 20136108, 2136472, 20136472, 2136199, 20136199]);
const ZWERG_NAMEN = new Set(["Ceres", "Pluto", "Haumea", "Makemake", "Eris"]);

/* Nur dort, wo das Deutsche eine eigene Form hat. Alles andere trägt den
 * internationalen Namen. */
const DEUTSCH = {
  Moon: "Luna", Ganymede: "Ganymed", Callisto: "Kallisto", Europa: "Europa",
  Rhea: "Rhea", Dione: "Dione", Tethys: "Tethys", Iapetus: "Iapetus",
  Ceres: "Ceres", Pallas: "Pallas", Vesta: "Vesta", Hygiea: "Hygiea",
  Psyche: "Psyche", Europa_ast: "Europa", Chiron: "Chiron", Pholus: "Pholus",
  Sedna: "Sedna", Quaoar: "Quaoar", Orcus: "Orcus", Gonggong: "Gonggong"
};

/* IDs, die es vor dem Katalog schon gab. */
const ALT_IDS = {
  Ceres: "ceres", Pluto: "pluto", Haumea: "haumea", Makemake: "makemake", Eris: "eris",
  Moon: "luna", Phobos: "phobos", Deimos: "deimos", Io: "io", Europa: "europa",
  Ganymede: "ganymede", Callisto: "callisto", Titan: "titan", Enceladus: "enceladus",
  Triton: "triton", Charon: "charon"
};

/* ---- Werkzeug ------------------------------------------------------------ */

const zahl = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function slug(text) {
  return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "koerper";
}

function sektor(a) {
  if (a < 2) return "inneres-system";
  if (a < 3.3) return "asteroidenguertel";
  if (a < NEPTUN_A) return "aeusseres-system";
  return "kuiper";
}

const de = (wert, stellen = 3) => Number(wert).toLocaleString("de-DE", { maximumFractionDigits: stellen });
const kompakt = (wert, stellen = 5) => Math.abs(wert) > 0 && Math.abs(wert) < 10 ** -stellen
  ? Number(wert).toExponential(3).replace(".", ",")
  : de(wert, stellen);
const stat = (label, value) => ({ label, value: String(value) });
/* Der Radius geht als Zahl mit — die Karte skaliert Marker daraus, und aus
 * "116.464 km" im Statblock ließe sich das nur zurückparsen. Wer keinen
 * gemessenen Durchmesser hat, bekommt null und auf der Karte die
 * Ersatzgröße seiner Klasse. */
const halbiert = (durchmesser) => durchmesser == null ? null : durchmesser / 2;
const rundRadius = (km) => km == null ? null : Number(Number(km).toFixed(3));

function physikStats(physik = {}) {
  const result = [];
  if (physik.mean_radius_km != null) result.push(stat("Durchmesser", `${de(physik.mean_radius_km * 2, 2)} km`));
  if (physik.mass_kg != null) {
    const exponent = physik.mass_kg >= 1e23 ? 24 : 18;
    result.push(stat("Masse", `${de(physik.mass_kg / 10 ** exponent, 5)} × 10${exponent === 24 ? "²⁴" : "¹⁸"} kg`));
  }
  if (physik.density_g_cm3 != null) result.push(stat("Mittlere Dichte", `${de(physik.density_g_cm3, 4)} g/cm³`));
  if (physik.rotation_days != null) {
    const retrograd = physik.rotation_days < 0 ? " · retrograd" : "";
    result.push(stat("Rotation", `${de(Math.abs(physik.rotation_days), 5)} d${retrograd}`));
  } else if (physik.synchronous_rotation) result.push(stat("Rotation", "gebunden / synchron"));
  if (physik.albedo != null) result.push(stat("Geometrische Albedo", de(physik.albedo, 4)));
  if (physik.gravity_ms2 != null) result.push(stat("Schwerkraft", `${de(physik.gravity_ms2, 3)} m/s²`));
  if (physik.escape_kms != null) result.push(stat("Fluchtgeschwindigkeit", `${de(physik.escape_kms, 3)} km/s`));
  if (physik.gm_km3_s2 != null) result.push(stat("GM", `${kompakt(physik.gm_km3_s2)} km³/s²`));
  if (physik.visual_magnitude != null) result.push(stat("Helligkeit V(1,0)", `${de(physik.visual_magnitude, 3)} mag`));
  return result;
}

function sbdbStats(satz) {
  const result = [];
  const diameter = zahl(satz.diameter);
  const gm = zahl(satz.GM);
  const density = zahl(satz.density);
  const rotation = zahl(satz.rot_per);
  const albedo = zahl(satz.albedo);
  const H = zahl(satz.H);
  const bv = zahl(satz.BV);
  if (diameter != null) result.push(stat("Effektiver Durchmesser", `${de(diameter, 3)} km`));
  if (satz.extent) result.push(stat("Abmessungen", `${satz.extent} km`));
  if (density != null) result.push(stat("Mittlere Dichte", `${de(density, 4)} g/cm³`));
  if (rotation != null) result.push(stat("Rotation", `${de(rotation, 4)} h`));
  if (albedo != null) result.push(stat("Geometrische Albedo", de(albedo, 4)));
  if (gm != null) result.push(stat("GM", `${kompakt(gm)} km³/s²`));
  if (satz.spec_B || satz.spec_T) result.push(stat("Spektralklasse", [satz.spec_B, satz.spec_T].filter(Boolean).join(" / ")));
  if (H != null) result.push(stat("Absolute Helligkeit H", `${de(H, 3)} mag`));
  if (bv != null) result.push(stat("Farbindex B−V", de(bv, 3)));
  return result;
}

const KLASSENPROFIL = {
  MBA: "Kleinplanet des Hauptgürtels zwischen Mars und Jupiter.",
  IMB: "Kleinplanet im inneren Bereich des Asteroidengürtels.",
  OMB: "Kleinplanet im äußeren Bereich des Asteroidengürtels.",
  MCA: "Marsbahnkreuzender Kleinplanet.",
  AMO: "Erdnaher Amor-Kleinplanet; seine Bahn kreuzt die Erdbahn nicht.",
  APO: "Erdnaher Apollo-Kleinplanet mit erdbahnkreuzender Bahn.",
  ATE: "Erdnaher Aten-Kleinplanet mit einer Bahn überwiegend innerhalb der Erdbahn.",
  TJN: "Jupiter-Trojaner, der die Sonnenbahn des Riesenplaneten teilt.",
  TNO: "Transneptunisches Objekt jenseits der mittleren Neptunbahn.",
  CEN: "Zentaur auf einer instabilen Bahn zwischen den Riesenplaneten.",
  CTc: "Aktiver Zentaur mit zugleich asteroidalen und kometaren Eigenschaften.",
  JFc: "Komet der Jupiterfamilie, dessen Bahn stark vom Riesenplaneten geprägt wird.",
  JFC: "Komet der Jupiterfamilie, dessen Bahn stark vom Riesenplaneten geprägt wird.",
  HTC: "Halley-Typ-Komet mit einer Umlaufzeit von weniger als zwei Jahrhunderten.",
  ETc: "Encke-Typ-Komet auf einer vollständig innerhalb der Jupiterbahn liegenden Bahn.",
  COM: "Komet auf einer langperiodischen oder nicht weiter eingeordneten Bahn.",
  PAR: "Komet auf einer nahezu parabolischen Bahn aus den Außenbereichen des Sonnensystems."
};

function bahnHinweis(e, i) {
  const teile = [];
  if (e >= .6) teile.push("sehr stark exzentrisch");
  else if (e >= .25) teile.push("deutlich exzentrisch");
  else if (e <= .03) teile.push("nahezu kreisförmig");
  if (Math.abs(i) >= 40) teile.push("stark gegen die Ekliptik geneigt");
  else if (Math.abs(i) >= 15) teile.push("merklich gegen die Ekliptik geneigt");
  return teile.length ? ` Seine Bahn ist ${teile.join(" und ")}.` : "";
}

function beschreibung({ id, kind, parentName, klasse, e, i, period }) {
  if (KERNFAKTEN[id]) return KERNFAKTEN[id];
  if (kind === "moon") {
    const umlauf = period < 1 ? `${de(period * 24, 2)} Stunden` : `${de(period, 2)} Tage`;
    return `Natürlicher Satellit von ${parentName}; ein Umlauf dauert etwa ${umlauf}.${bahnHinweis(e, i)}`;
  }
  const basis = KLASSENPROFIL[klasse]
    ?? (kind === "comet" ? "Komet auf einer Bahn um die Sonne." : "Kleinplanet auf einer Bahn um die Sonne.");
  return `${basis}${bahnHinweis(e, i)}`;
}

const SPEKTRALFARBEN = {
  C: ["#777c78", "dunkelgrau · C-Spektrum"], B: ["#838b89", "blaugrau · B-Spektrum"],
  F: ["#858984", "neutralgrau · F-Spektrum"], G: ["#777c75", "dunkelgrau · G-Spektrum"],
  S: ["#b1846d", "warmbraun · S-Spektrum"], Q: ["#b89179", "warmgrau · Q-Spektrum"],
  V: ["#a79a91", "basaltgrau · V-Spektrum"], A: ["#b58c75", "rötlich · A-Spektrum"],
  R: ["#ad7968", "rötlich · R-Spektrum"], D: ["#956a5a", "dunkelrot · D-Spektrum"],
  P: ["#77685d", "dunkelbraun · P-Spektrum"], T: ["#987462", "rötlich · T-Spektrum"],
  X: ["#928678", "neutralbraun · X-Spektrum"], M: ["#a18f78", "metallisch · M-Spektrum"],
  E: ["#b8b2a3", "hellgrau · E-Spektrum"]
};

function farbprofil({ id, kind, klasse, spektrum, bv }) {
  if (KERNFARBEN[id]) return KERNFARBEN[id];
  const spektral = SPEKTRALFARBEN[String(spektrum ?? "").trim().charAt(0).toUpperCase()];
  if (spektral) return spektral;
  const farbindex = zahl(bv);
  if (farbindex != null) {
    if (farbindex < .65) return ["#9aa9ad", `blaugrau · Farbindex B−V ${de(farbindex, 2)}`];
    if (farbindex < .78) return ["#a9a398", `neutralgrau · Farbindex B−V ${de(farbindex, 2)}`];
    if (farbindex < .92) return ["#ad927c", `warmgrau · Farbindex B−V ${de(farbindex, 2)}`];
    return ["#aa7968", `rötlich · Farbindex B−V ${de(farbindex, 2)}`];
  }
  if (kind === "comet") return ["#85a7aa", "eisblaues Leuchten · schematischer Komet"];
  if (kind === "moon") return ["#929b9b", "neutralgrau · schematischer natürlicher Satellit"];
  if (klasse === "TNO") return ["#a47866", "rötlichbraun · schematisches transneptunisches Objekt"];
  if (klasse === "CEN" || klasse === "CTc") return ["#9a8268", "ockerbraun · schematischer Zentaur"];
  if (klasse === "TJN") return ["#9d896a", "warmgrau · schematischer Jupiter-Trojaner"];
  return ["#928c82", "steingrau · schematischer Kleinplanet"];
}

function mitQuelle(stats, colorNote, source) {
  return [...stats, stat("Darstellung", colorNote), stat("Datenquelle", source)];
}

/* Die Mengen aus dem Euler-Diagramm überlappen: Pluto ist Zwergplanet UND
 * Kleinplanet UND TNO UND Plutoid, Chiron ist Zentaur UND Komet, Ceres ist
 * Zwergplanet und ausdrücklich KEIN Kleinkörper. Ein einzelnes `kind` kann das
 * nicht tragen — `kind` bleibt die Anzeigeform, die Zugehörigkeit steht in den
 * Tags. */
function mengen(satz, { istZwerg, auchKomet }) {
  const tags = [];
  const istKomet = String(satz.kind).startsWith("c");
  const istKleinplanet = String(satz.kind).startsWith("a");
  const a = zahl(satz.a) ?? 0;

  if (istZwerg) tags.push("Zwergplanet");
  if (istKleinplanet) tags.push("Kleinplanet");
  if (satz.class === "TNO") tags.push("Transneptunisches Objekt");
  if (istZwerg && a > NEPTUN_A) tags.push("Plutoid");
  if (satz.class === "CEN" || satz.class === "CTc") tags.push("Zentaur");
  if (istKomet || auchKomet) tags.push("Komet");
  if ((istKleinplanet || istKomet) && !istZwerg) tags.push("Kleinkörper");
  return tags;
}

/* ---- Rohbestand einlesen -------------------------------------------------- */

const kleine = JSON.parse(readFileSync(join(ROH, "sbdb.json"), "utf8"));
const satelliten = JSON.parse(readFileSync(join(ROH, "satellites.json"), "utf8"));

function gruppe(satz) {
  if (String(satz.kind).startsWith("c")) return "kometen";
  switch (satz.class) {
    case "TNO": return "tno";
    case "CEN": return "zentauren";
    case "TJN": return "trojaner";
    case "MBA": case "IMB": case "OMB": case "MCA": return "guertel";
    case "AMO": case "APO": case "ATE": return "erdnah";
    default: return "sonstige";
  }
}

function nimmt(satz, gruppenName) {
  const H = zahl(satz.H);
  const regel = AUSWAHL[gruppenName];
  if (gruppenName === "kometen") {
    if (satz.class === "CTc") return true;
    const nummer = String(satz.pdes ?? "").match(/^(\d+)P/);
    return nummer ? Number(nummer[1]) <= AUSWAHL.kometen : false;
  }
  if (regel === "alle") return true;
  if (regel === "benannt") return Boolean(satz.name);
  if (typeof regel === "number") return H != null && H < regel;
  return false;
}

/* Der gestrichelte Kasten im Diagramm sind die Zentauren, die einen Schweif
 * zeigen. Aktivität steht in keiner Datenbank; JPL führt aber die
 * Chiron-Typ-Kometen (CTc) als eigene Klasse, und das ist genau diese
 * Überschneidung. Chiron und Echeclus selbst stehen bei JPL nur als
 * Asteroiden — ihre alten Kometenbezeichnungen 95P und 174P sind dort nicht
 * mehr geführt, also kommen die beiden von Hand dazu. */
const AKTIVE_ZENTAUREN = new Set(["2060", "60558"]);

/* ---- Bauen ---------------------------------------------------------------- */

const koerper = [];
const vergeben = new Set();
const nummerVon = new Map();

const eindeutig = (basis) => {
  let id = basis, n = 2;
  while (vergeben.has(id)) id = `${basis}-${n++}`;
  vergeben.add(id);
  return id;
};

for (const [id, name, kind, a, e, period, anomaly, sekt, parent = null, extra = {}] of PLANETEN) {
  vergeben.add(id);
  const [color, colorNote] = farbprofil({ id, kind });
  const source = id === "sun" ? "NASA Science" : "NASA/JPL Planetary Physical Parameters";
  const sourceUrl = id === "sun" ? QUELLEN.science : QUELLEN.planets;
  koerper.push({
    id, name, kind, is_custom: false,
    semi_major_axis_au: a, eccentricity: e, orbital_period_days: period,
    epoch_anomaly_deg: anomaly, parent_id: parent, inclination_deg: 0,
    radius_km: id === "sun" ? SONNE_RADIUS_KM : rundRadius(PLANET_PHYSIK[id]?.mean_radius_km),
    tags: extra.tags ?? (kind === "planet" ? ["Planet"] : []),
    description: beschreibung({ id, kind, e, i: 0, period }),
    lore: "", stats: mitQuelle(physikStats(PLANET_PHYSIK[id]), colorNote, source),
    sector: sekt, color: extra.color ?? color, color_note: colorNote, source, source_url: sourceUrl
  });
}

/* Monde zuerst: sie behalten die schlichte ID. Es gibt (52) Europa ebenso wie
 * Jupiters Europa — zeigte eine gespeicherte Ansicht nach dem Neubau plötzlich
 * auf den Asteroiden, wäre der Fehler von außen nicht zu sehen. */
const bilanz = {};

const MOND_SEKTOR = { jupiter: "jupiter", saturn: "saturn" };
for (const mond of satelliten) {
  const name = DEUTSCH[mond.name] ?? mond.name;
  const id = eindeutig(ALT_IDS[mond.name] ?? slug(name));
  const [color, colorNote] = farbprofil({ id, kind: "moon" });
  const parentName = PLANETEN.find(([planetId]) => planetId === mond.parent)?.[1] ?? mond.parent;
  const source = "NASA/JPL Horizons";
  bilanz.monde = (bilanz.monde ?? 0) + 1;
  koerper.push({
    id,
    name, kind: "moon", is_custom: false,
    semi_major_axis_au: Number(mond.semi_major_axis_au.toFixed(9)),
    eccentricity: Number(mond.eccentricity.toFixed(6)),
    orbital_period_days: Number(mond.orbital_period_days.toFixed(4)),
    epoch_anomaly_deg: Number(mond.epoch_anomaly_deg.toFixed(3)),
    parent_id: mond.parent,
    inclination_deg: Number(mond.inclination_deg.toFixed(3)),
    radius_km: rundRadius(mond.physical?.mean_radius_km),
    tags: ["Mond", "Natürlicher Satellit"],
    description: beschreibung({ id, kind: "moon", parentName, e: mond.eccentricity, i: mond.inclination_deg, period: mond.orbital_period_days }),
    lore: "", stats: mitQuelle(physikStats(mond.physical), colorNote, source),
    sector: MOND_SEKTOR[mond.parent] ?? "aeusseres-system",
    color, color_note: colorNote, source, source_url: QUELLEN.horizons
  });
}

for (const satz of kleine) {
  const g = gruppe(satz);
  const istZwerg = ZWERGPLANETEN.has(satz.spkid) || (satz.name && ZWERG_NAMEN.has(satz.name));
  if (!istZwerg && !nimmt(satz, g)) continue;

  const a = zahl(satz.a), e = zahl(satz.e), per = zahl(satz.per), ma = zahl(satz.ma);
  if (a == null || e == null || per == null || ma == null) continue;

  const roh = satz.name || String(satz.full_name).trim().replace(/\s*\(.*\)$/, "");
  /* Kometen heißen am Tisch nach ihrer Bezeichnung: "Tempel" gibt es dreimal,
   * "10P/Tempel" nur einmal. */
  /* Wer keinen Namen hat, behält seine vollständige Bezeichnung: "4953" allein
   * sagt am Tisch nichts, "4953 (1990 MU)" ist wenigstens auffindbar. */
  const name = String(satz.kind).startsWith("c") || !satz.name
    ? String(satz.full_name).trim()
    : (DEUTSCH[roh] ?? roh);
  const auchKomet = AKTIVE_ZENTAUREN.has(String(satz.pdes));

  bilanz[g] = (bilanz[g] ?? 0) + 1;
  const id = eindeutig(ALT_IDS[roh] ?? slug(name));
  const kind = istZwerg ? "dwarf_planet" : String(satz.kind).startsWith("c") ? "comet" : "asteroid";
  const [color, colorNote] = farbprofil({ id, kind, klasse: satz.class, spektrum: satz.spec_B || satz.spec_T, bv: satz.BV });
  const source = PLANET_PHYSIK[id] ? "NASA/JPL Planetary Physical Parameters + SBDB" : "NASA/JPL SBDB Query API";
  const sourceUrl = PLANET_PHYSIK[id] ? QUELLEN.planets : QUELLEN.sbdb;
  const basisStats = PLANET_PHYSIK[id]
    ? [...physikStats(PLANET_PHYSIK[id]), ...sbdbStats(satz).filter((item) => !["Effektiver Durchmesser", "Mittlere Dichte", "Rotation", "Geometrische Albedo"].includes(item.label))]
    : sbdbStats(satz);
  if (/^\d+$/.test(String(satz.pdes))) nummerVon.set(id, String(satz.pdes));
  koerper.push({
    id,
    name,
    kind,
    is_custom: false,
    semi_major_axis_au: Number(a.toFixed(6)),
    eccentricity: Number(e.toFixed(6)),
    orbital_period_days: Number(per.toFixed(3)),
    epoch_anomaly_deg: Number(ma.toFixed(3)),
    parent_id: null,
    inclination_deg: Number((zahl(satz.i) ?? 0).toFixed(3)),
    radius_km: rundRadius(PLANET_PHYSIK[id]?.mean_radius_km ?? halbiert(zahl(satz.diameter))),
    tags: mengen(satz, { istZwerg, auchKomet }),
    description: beschreibung({ id, kind, klasse: satz.class, e, i: zahl(satz.i) ?? 0, period: per }),
    lore: "", stats: mitQuelle(basisStats, colorNote, source),
    sector: sektor(a),
    color, color_note: colorNote, source, source_url: sourceUrl
  });
}

/* Ein Mond gehört in den Sektor seines Primärkörpers. Das lässt sich erst
 * sagen, wenn alle Körper stehen — Pluto etwa entsteht erst nach seinen
 * Monden, und ohne diesen Nachlauf säßen Charon und die vier kleinen im
 * äußeren System statt im Kuipergürtel. */
const sektorVon = new Map(koerper.map((k) => [k.id, k]));
for (const k of koerper) {
  if (!k.parent_id) continue;
  const eltern = sektorVon.get(k.parent_id);
  if (eltern) k.sector = MOND_SEKTOR[eltern.id] ?? eltern.sector;
}

/* Namen kollidieren in der Astronomie wirklich: (9) Metis und Jupiters Metis,
 * (52) Europa und Jupiters Europa. Der Mond behält den bloßen Namen, der
 * Kleinplanet bekommt seine Nummer davor — so, wie er auch sonst zitiert wird. */
const haeufigkeit = {};
for (const k of koerper) haeufigkeit[k.name] = (haeufigkeit[k.name] ?? 0) + 1;
for (const k of koerper) {
  if (haeufigkeit[k.name] < 2 || k.kind !== "asteroid") continue;
  const nummer = nummerVon.get(k.id);
  if (nummer) k.name = `(${nummer}) ${k.name}`;
}

console.log(`Planeten 9  ${Object.entries(bilanz).map(([k, n]) => `${k} ${n}`).join("  ")}`);
console.log(`Summe: ${koerper.length} Körper`);
if (NUR_ZAEHLEN) process.exit(0);

const kopf = `/* Erzeugt von scripts/build-seed.mjs — nicht von Hand ändern.
 * Quellen: JPL SSD Approximate Positions (Planeten), JPL SBDB Query API
 * (Kleinkörper), JPL Horizons (Monde, oskulierende Elemente zur Epoche J2000).
 * Der Zuschnitt steckt in AUSWAHL in build-seed.mjs; der Rohbestand unter
 * data/raw/ ist vollständig und wartet dort auf eine andere Entscheidung.
 * Stand: ${new Date().toISOString().slice(0, 10)} · ${koerper.length} Körper */

export const CATALOG = ${JSON.stringify(koerper, null, 0).replace(/\},\{/g, "},\n{")};
`;

writeFileSync(ZIEL, kopf);
console.log(`✓ ${ZIEL.split("/").slice(-3).join("/")} geschrieben`);
