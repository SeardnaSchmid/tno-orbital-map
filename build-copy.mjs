/* Legt das Ergebnis des Builds dorthin, wo die Einzeldatei bisher lag —
   tools/navigationstisch.html bleibt damit der Doppelklick-Einstieg. */

import { copyFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const hier = dirname(fileURLToPath(import.meta.url));
const quelle = join(hier, "dist", "index.html");
const ziel = join(hier, "..", "navigationstisch.html");

copyFileSync(quelle, ziel);
console.log(`navigationstisch.html geschrieben (${(statSync(ziel).size / 1024).toFixed(0)} KB)`);
