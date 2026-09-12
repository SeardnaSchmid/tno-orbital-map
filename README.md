# Prototyp 2.0 · Orbitalkarte

Eine lokale, einzelne GM-Konsole für die Kampagne: flache Kepler-Bahnen,
kuratierte Sektoransichten und eigene Orte auf derselben `Body`-Datenform wie
die echten Himmelskörper. Sie ist kein Bestandteil des Foundry-Systems.

Die Karte bleibt strikt 2D. Inklination wird gespeichert und angezeigt, hat
aber keinen Einfluss auf die Bildschirmposition. Das Seed verwendet J2000 als
Referenzepoche; die planetaren Bahnelemente und Anomalien sind auf die
[JPL SSD Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html)
zurückgeführt. Die Karte ist eine Spielhilfe, keine Ephemeride.

## Bedienung

- Sektorreiter wählen einen Ausschnitt und einen passenden Körperbestand. Der
  Sektor und das Kampagnendatum werden direkt lokal gespeichert.
- **Anzeige** verbindet Suche und Sichtbarkeit: ein Baum aus Sektor, Gruppe,
  Körper und Mond. Jede Ebene schaltet ihren ganzen Ast, die Zahl rechts sagt,
  wie viel davon liegt. Lange oder vollständig ausgeblendete Gruppen starten
  zugeklappt — Jupiter und die Kleinplaneten sind sonst eine Wand.
  Das Suchfeld greift über alle Sektoren hinweg auf Namen *und* Tags: `Plutoid`
  findet die vier, `Zentaur` die siebenundvierzig. Ein Treffer bringt seinen
  Primärkörper als Ast mit, sonst hinge der Mond in der Luft. Die Karte zeigt
  die Bahnen der Auswahl und rahmt sie automatisch ein; Elternkörper bleiben
  nur als räumlicher Kontext sichtbar. Der Stern ist davon ausgenommen: Sol
  lässt sich abwählen wie jeder andere Körper, und dann rahmt die Karte allein,
  was noch liegt — etwa Erde und Luna. Die Checkbox schaltet Sichtbarkeit, ein
  Klick auf den Namen wechselt Sektor und Fokus und schließt den Picker.
  **+ Neuer Körper** startet direkt die einfache Anlage.
- Ein Klick auf einen Marker pinnt sein Spieler-Dossier. Die kompakte Karte
  zeigt Standortsdaten und ein wissenschaftliches Kurzprofil oder den
  Kampagnentext. Das visuelle Erscheinungsbild mit Farbmuster bleibt dabei
  immer sichtbar. **Dossier** zeigt Wissenschaft und Kampagnentext zusammen
  und klappt Messwerte sowie frei gepflegte Angaben auf. Der Fokus folgt nicht
  dem Mauszeiger.
- Auf der Karte zoomt das Mausrad um den Zeiger, mit gedrückter Umschalttaste
  in größeren Schritten; Ziehen verschiebt den Ausschnitt. Die `−`/`+`-Tasten
  zoomen auf den aktiven Körper, solange er im Bild steht — er bleibt dabei an
  seinem Pixel stehen, bis seine Monde einzeln daneben liegen. **Auto** rahmt
  die aktuelle Auswahl wieder ein. Sobald die Karte tatsächlich gezogen wurde,
  bleiben Fokus und Maßstab auch bei laufender Simulation fix; **Auto** löst
  diese manuelle Ansicht wieder. Der Zoom reicht bis zum Millionenfachen des
  eingerahmten Ausschnitts; Gitter und Beschriftungen wechseln unterwegs von
  AE auf Kilometer.
- Fallen Marker auf dem Bildschirm zusammen, fasst die Karte ihre
  Beschriftungen zusammen, statt sie übereinander zu legen: ein gestrichelter
  Ring, der Name des wichtigsten Körpers und `+N`. Die Marker bleiben exakt an
  ihrem Ort. Ein Klick auf die Sammelbeschriftung übernimmt diesen Körper und
  zoomt so weit hinein, dass die Gruppe aufgeht.
- Asteroiden- und Kuipergürtel sind eigene auswählbare Kartenobjekte. Ihre
  flächigen Partikelfelder zeigen die jeweilige radiale Zone; Klick, Fokus,
  Sichtbarkeit, Szenenspeicherung und Dossier funktionieren wie bei Körpern.
  Als Standort oder Ziel stehen Gürtel nicht zur Wahl, weil sie keinen
  eindeutigen Navigationspunkt bezeichnen.
- **Szenen** speichert Datum, Auswahl, fokussierten Körper, Gruppenposition und
  den exakten Kartenausschnitt unter einem Namen. Die zuletzt geladene Szene
  ist die Startansicht; geänderte Szenen können in derselben Zeile aktualisiert
  werden.
- Das Datum hat getrennte Felder für Tag, Monat und ein bis zu sechsstelliges
  Jahr. Die Transportsteuerung springt oder läuft automatisch in wählbaren
  Schritten von einem Tag, sieben Tagen, einem Monat oder einem Jahr. Im
  automatischen Lauf folgt alle 0,25 Sekunden ein Schritt. **Heute** springt
  auf das lokale Kalenderdatum des Rechners.
- **Dossier** ergänzt Alias, Spielerinformation, Kampagnen-Tags und freie Daten
  für jeden Körper, ohne die astronomischen Seed-Daten zu verändern. Dossier
  und Körperdaten liegen in getrennten Editor-Reitern; ungespeicherte Änderungen
  werden beim Schließen nicht still verworfen.
- **Route** pflegt Gruppenname, aktuelle Aufgabe, Standort, Ziel und Status unabhängig vom
  Körpereditor und zeigt bei gesetztem Standort und Ziel ihre aktuelle Distanz
  in AE. Der aktive Körper kann außerdem direkt im Dossier als Standort
  oder Ziel gesetzt werden. Die Entfernung steht direkt auf der Verbindungslinie.
  Bei zwei Körpern mit demselben Primärkörper ergänzt die Karte eine vereinfachte
  Hohmann-Transferbahn mit nächstem Startfenster, Flugzeit, Ankunft und Δv. Die
  Transferbahn lässt sich im Routenfenster ausblenden; ihre Zeitachse markiert
  Heute und das Startfenster, gliedert den Zyklus und zeigt Resttage sowie
  Fortschritt bis zum nächsten Startzeitpunkt. Die aktuelle Aufgabe erscheint als
  eigenes Infofeld über der Karte.
- Eigene Körper brauchen zunächst nur Name, Art, Primärkörper, Distanz und
  Sektor. Ihr visuelles Erscheinungsbild steht direkt im einfachen Formular;
  Exzentrizität, Umlaufzeit, Anomalie, Inklination und Farbe liegen im Abschnitt
  **Erweiterte Orbitdaten**. Eine Umlaufzeit von `0` macht einen Körper statisch.
- **Präsentieren** öffnet nach Möglichkeit den Vollbildmodus und wird zur
  vergrößerten Spieleransicht: Karte, Dossier, Route und Aufgabe bleiben
  sichtbar, Kamera und GM-Autorenwerkzeuge sind gesperrt. Die Statusleiste
  behält dieselbe Höhe wie die GM-Steuerleiste, damit der eingefrorene
  Kartenausschnitt auf beiden Ansichten pixelgleich liegt. Sichtbare Körper
  lassen sich weiterhin auswählen und ihr Dossier kann aufgeklappt werden. Der
  Rückweg zur GM-Konsole muss bestätigt werden.
- In einer von **HTML as Scene** bereitgestellten Foundry-Ansicht lädt die
  GM-Konsole ihren Arbeitsstand aus Foundrys Browser-`localStorage`. **Spieler
  einfrieren** veröffentlicht eine Kopie der aktuellen Auswahl, Kamera, Route
  und des Missionsdatums am Foundry-Scene-Dokument. Spieler starten automatisch
  im nicht interaktiven Präsentationsmodus und folgen nur dieser veröffentlichten
  Kopie; weiteres Erkunden durch den GM verändert ihre Ansicht nicht.
- Das Menü **Datenverwaltung** importiert und exportiert den ganzen orbitalen
  Stand als JSON. Import wird erst nach einer Zusammenfassung übernommen und
  gespeichert; Zurücksetzen verlangt eine Bestätigung.

Der Browser speichert Kampagnendatum, Sektor, Dossiers, Route, aktuelle Aufgabe, eigene Körper und
Szenen unter `navigationstisch.orbit.v1`. Auswahl und Kamera werden dauerhaft,
wenn sie als Szene gespeichert oder in der aktiven Szene aktualisiert werden.
Der Vorgänger-Schlüssel `navigationstisch.v1` wird bewusst nicht angetastet.

## Der Bestand

Die Körper stehen in [`src/lib/catalog.generated.js`](src/lib/catalog.generated.js)
und werden erzeugt, nicht von Hand gepflegt. Zwei Schritte, sauber getrennt:

```bash
npm run fetch:bodies   # einmal mit Netz: JPL → data/raw/ (~24 MB)
npm run build:seed     # netzfrei: data/raw/ → catalog.generated.js
```

`fetch:bodies` holt den vollständigen Rohbestand: alle Kleinkörper heller als
H 15, alle Kometen, und Bahn- sowie verfügbare physische Daten aller 187 Monde,
die Horizons führt. Für Kleinkörper werden unter anderem Durchmesser,
Abmessungen, Dichte, Rotation, Albedo, Farbindex und Spektralklasse übernommen,
wenn JPL dafür einen Messwert führt. Der Zuschnitt fällt erst im zweiten
Schritt — der Rohbestand bleibt vollständig liegen und wartet auf eine andere
Entscheidung. Ein fehlender Messwert bleibt leer und wird nicht geschätzt.

`build:seed` entscheidet, wie viel davon auf dem Tisch liegt. Die Stellschrauben
stehen als `AUSWAHL` in [`scripts/build-seed.mjs`](scripts/build-seed.mjs) und
lassen sich einzeln aufmachen:

```bash
npm run build:seed -- --guertel=9 --tno=alle --zaehlen
```

Jede Gruppe schneidet anders ab, weil H zwischen ihnen nicht vergleichbar ist:
ein TNO mit H 7 ist mehrere hundert Kilometer groß, ein Gürtelkörper mit H 7
rund hundert, und Kometen tragen überhaupt kein H. Innen entscheidet darum die
Helligkeit, außen der Name — es gibt nur 49 benannte TNO und 25 benannte
Zentauren, und wer benannt ist, ist am Tisch nennbar.

Die Mengen des Euler-Diagramms überlappen: Pluto ist Zwergplanet, Kleinplanet,
transneptunisches Objekt und Plutoid zugleich, Chiron ist Zentaur und Komet,
Ceres ist Zwergplanet und ausdrücklich kein Kleinkörper. Ein einzelnes `kind`
kann das nicht tragen. `kind` ist deshalb die Anzeigeform, die Zugehörigkeit
steht in den Tags.

Der gebaute Katalog ergänzt jeden ausgewählten Körper um ein kurzes
wissenschaftliches Profil, den Radius als Zahl, eine gut unterscheidbare
Markierungsfarbe und eine lesbare Farbbeschreibung. Aus dem Radius kommt die
Markergröße; wer keinen gemessenen Durchmesser hat, wird in der Ersatzgröße
seiner Klasse gezeichnet. Farben bekannter Welten sind kuratiert; bei
Kleinkörpern folgt die Farbe zuerst der Spektralklasse, dann dem gemessenen
B−V-Farbindex und zuletzt einer ausdrücklich als schematisch bezeichneten
Klassenfarbe. Diese Markerfarben sind eine Kartenkodierung, keine kalibrierte
fotografische Wiedergabe.

Quellen: [JPL SSD Approximate Positions](https://ssd.jpl.nasa.gov/planets/approx_pos.html)
für die Planeten, die [SBDB Query API](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html)
für die Kleinkörper, [Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
für die Monde. Alle drei ohne Schlüssel.

## Entwickeln

```bash
npm run test:orbit
npm run build
```

`build` bündelt alles nach `dist/index.html` und erzeugt zusätzlich
`navigationstisch.html` im Repo-Root. Diese Datei funktioniert per Doppelklick,
ohne Server oder Netz; Änderungen gehören nach `src/`, nicht in die
Build-Ergebnisse.
