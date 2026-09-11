# Wildnisreise — Adventure Tracker

Ein Foundry-VTT-Modul für Reisen durch die Wildnis in **D&D 5e**.

Ein Fenster, das SL und Spieler offen halten können. Es zeigt den aktuellen
Reisetag, die Mondphase und die Aufgabenverteilung für diesen Tag. Zu Tagesbeginn
übernimmt jeder Charakter eine Aufgabe, es wird gewürfelt, und daraus ergibt sich,
wie weit die Gruppe kommt.

- **Foundry VTT** v13
- **System** dnd5e 5.3
- Keine harten Abhängigkeiten, keine Bezahlmodule, keine externen Schriftarten

---

## Inhalt

- [Installation](#installation)
- [Erste Schritte](#erste-schritte)
- [Was das Modul tut](#was-das-modul-tut)
- [Weltoptionen](#weltoptionen)
- [Eigene Aufgaben (JSON)](#eigene-aufgaben-json)
- [API](#api)
- [Rechte und Synchronisierung](#rechte-und-synchronisierung)
- [Was das Modul *nicht* tut](#was-das-modul-nicht-tut)
- [Entwicklung](#entwicklung)

---

## Installation

### Über die Manifest-URL

1. In Foundry **Add-on Modules → Install Module** öffnen.
2. Als *Manifest URL* eintragen:

   ```
   https://github.com/Domiknonf/toa-adventure-tracker/releases/latest/download/module.json
   ```

3. **Install** klicken, danach das Modul in der Welt unter
   **Game Settings → Manage Modules** aktivieren.

### Manuell

1. Das `module.zip` der gewünschten Version herunterladen.
2. Nach `Data/modules/toa-adventure-tracker/` entpacken — der Ordnername muss
   exakt `toa-adventure-tracker` lauten.
3. Foundry neu starten und das Modul in der Welt aktivieren.

---

## Erste Schritte

1. Modul aktivieren.
2. Das Fenster öffnen — auf drei Wegen:
   - über den Knopf **Wildnisreise** in den Scene Controls, unter den
     *Journal Notes* (Symbol: Wanderer);
   - über das Beispielmakro im mitgelieferten Kompendium
     **Wildnisreise: Makros**;
   - über die API: `game.modules.get("toa-adventure-tracker").api.open()`.
3. Unter **Game Settings → Configure Settings → Wildnisreise** prüfen, woher die
   Reisenden kommen sollen (Vorgabe: alle Charaktere mit Spielerbesitz).
4. Reisetempo wählen, jeder Charakter übernimmt eine Aufgabe, würfeln,
   **Tag abschließen**.

Das Fenster darf jeder offen haben. Spieler sehen dieselben Zahlen wie die SL,
können aber nur ihre eigenen Charaktere bedienen.

---

## Was das Modul tut

### Tageszähler

Ganzzahliger Zähler ab 1. Die SL kann hoch- und runterzählen oder den Wert direkt
eintragen (Eingabe wird mit *Enter* oder beim Verlassen des Feldes übernommen).

**Tag abschließen** schreibt einen Logbucheintrag, löscht die Würfe des Tages und
den Regen-Schalter und zählt den Tag hoch. Die Aufgabenverteilung bleibt bestehen —
wer gestern navigiert hat, navigiert in aller Regel auch heute.

### Mondphase

Wird **allein aus dem Tageszähler** abgeleitet, ohne Weltzeit und ohne
Kalendermodul. Wer den Tag auf 47 setzt, sieht den Mond von Tag 47 — eine
Synchronisation kann es damit gar nicht erst geben.

Die Beleuchtung folgt der Kosinusformel `(1 + cos θ) / 2`, nicht einer linearen
Rampe: Der echte Mond steht länger nahe voll und nahe neu als nahe den Vierteln.
Dieselbe Formel treibt auch die Zeichnung, Zahl und Bild können also nicht
auseinanderlaufen.

Dargestellt als SVG-Scheibe. Der Terminator ist eine **Ellipse** mit der
horizontalen Halbachse `|cos θ| · r` — an den Vierteln wird daraus automatisch
eine Gerade. Es ist keine Bilderserie, weil die Zykluslänge einstellbar ist und es
daher gar keinen festen Satz Bilder geben kann.

> **Hinweis zur Zykluslänge.** Bei der Vorgabe (Zyklus 30 Tage, Vollmond an Tag 1)
> liegt der exakte Neumond auf **Tag 16**, nicht auf Tag 15 — ein halber Zyklus
> von 30 Tagen sind nun einmal 15 Tage *nach* Tag 1. Tag 15 ist mit 1 %
> Beleuchtung optisch bereits Neumond. Wer den Neumond exakt auf Tag 15 haben
> will, stellt die Zykluslänge auf **28**.

### Aufgaben

Jeder Aktor kann pro Tag genau **eine** Aufgabe übernehmen — das erzwingt die
Datenstruktur selbst, zwei Aufgaben sind gar nicht darstellbar. Umgekehrt darf
dieselbe Aufgabe von mehreren Charakteren übernommen werden; die Erträge addieren
sich dann.

Standardliste:

| Aufgabe        | Probe          | SG | Ertrag bei Erfolg   |
|----------------|----------------|----|---------------------|
| Navigation     | Überleben      | 15 | bestimmt die Strecke |
| Wassersuche    | Überleben      | 10 | 1W6 + WEI Gallonen  |
| Nahrungssuche  | Überleben      | 10 | 1W6 + WEI Pfund     |
| Vorhut         | Wahrnehmung    | 12 | —                   |
| Nachhut        | Heimlichkeit   | 12 | —                   |

**Modifikatoren werden nicht gepflegt, sondern gelesen** — aus
`actor.system.skills.<key>.total` bzw. `actor.system.abilities.<key>.mod`. Darin
stecken Übungsbonus, Expertise, Alleskönner und jeder aktive Effekt bereits drin.
Fertigkeitsschlüssel werden über `CONFIG.DND5E.skills` aufgelöst, nichts ist fest
verdrahtet.

### Würfe

Gewürfelt wird über die **dnd5e-API** (`actor.rollSkill()` bzw.
`actor.rollAbilityCheck()` in der 5.3-Signatur), damit Boni, Vorteil,
Glückswerte, Zuverlässiges Talent, Erschöpfung und andere Module greifen. Das
Modul baut keine eigene W20-Formel. Das Ergebnis geht als normale Chatnachricht
raus und wird zusätzlich im Fenster angezeigt.

Der Wurf passiert immer auf dem Client der Person, die klickt — dort liegen ihre
Würfel, ihre Module und ihre Vorteils-Tastenkürzel. Nur das fertige Ergebnis
reist zur SL.

**Neu würfeln** überschreibt das Ergebnis des Tages. Wer die Aufgabe wechselt,
verliert seinen Wurf — er gehörte zur anderen Aufgabe.

### Reisetempo und Strecke

Drei Tempi mit je Meilen pro Tag und Modifikator auf den **Navigationswurf**:

| Tempo   | Meilen/Tag | Modifikator |
|---------|-----------|-------------|
| Langsam | 9         | +5          |
| Normal  | 10        | 0           |
| Schnell | 15        | −5          |

- Navigationswurf **bestanden** → volle Strecke.
- Navigationswurf **misslungen** → halbe Strecke, abgerundet, plus Hinweis
  „verlaufen“.
- **Kein** Navigationswurf → volle Strecke, mit dem Hinweis, dass noch nicht
  gewürfelt wurde. Nicht gewürfelt ist kein Misserfolg.

Angezeigt wird in Meilen, darunter umgerechnet in Hexfelder.

Zusätzlich und unabhängig davon kann das Tempo an dnd5e weitergereicht werden
(Option *Tempo-Regeln des Systems anwenden*), sodass dessen eigene Regeln greifen
— Vorteil auf Heimlichkeit bei langsamem, Nachteil auf Wahrnehmung bei schnellem
Tempo. Der Zahlenmodifikator oben ist die Hausregel auf Navigation, die
System-Regel gilt für alle Aufgaben.

### Vorräte

Wasserbedarf = *Reisende* × *Bedarf pro Kopf*. Sind **Regen heute** und
**Regensammler vorhanden** beide an, ist der Bedarf automatisch gedeckt und
gefundenes Wasser ist ein Zusatz.

Ist der Bedarf nicht gedeckt, blendet das Fenster einen Hinweis auf den fälligen
KON-Rettungswurf ein — **der Wurf wird nicht automatisch ausgelöst**. Das ist
Absicht: Wer aussetzt, wer Vorräte dabei hat und wer einfach Pech hat, entscheidet
die SL.

### Logbuch

Pro abgeschlossenem Tag ein Eintrag mit Tag, Tempo, Meilen, verlaufen ja/nein,
Wasser und Nahrung. Es werden die **letzten 30 Einträge** behalten, dazu die Summe
der zurückgelegten Meilen.

Ein Eintrag ist ein **eingefrorenes Protokoll**: Wer nächste Woche die Meilen pro
Tempo umstellt, ändert damit nicht rückwirkend die Strecken der letzten Woche.

**Als Journal exportieren** schreibt das Logbuch als Journal-Eintrag. Jeder Export
legt einen neuen Eintrag an — genau so behält eine lange Kampagne ihre älteren
Tage trotz der 30er-Grenze.

---

## Weltoptionen

Alle unter **Game Settings → Configure Settings → Wildnisreise**. Bis auf die
letzte sind alle weltweit (`scope: "world"`), damit alle am Tisch dieselben Zahlen
sehen.

### Mond

| Option | Vorgabe | Bedeutung |
|---|---|---|
| **Länge des Mondzyklus** | 30 | Wie viele Tage ein voller Zyklus dauert. |
| **Tag des ersten Vollmonds** | 1 | Der Reisetag, an dem Vollmond ist. Alle anderen Phasen ergeben sich daraus. Darf größer als der aktuelle Tag sein. |

### Reisetempo

| Option | Vorgabe |
|---|---|
| **Langsam: Meilen pro Tag** / **Modifikator** | 9 / +5 |
| **Normal: Meilen pro Tag** / **Modifikator** | 10 / 0 |
| **Schnell: Meilen pro Tag** / **Modifikator** | 15 / −5 |
| **Tempo-Regeln des Systems anwenden** | an |
| **Hexfeldgröße in Meilen** | 10 |

Der Modifikator wirkt **nur** auf den Navigationswurf.

### Reisende

| Option | Vorgabe | Bedeutung |
|---|---|---|
| **Quelle der Reisenden** | Alle Charaktere mit Spielerbesitz | Alternativ: ein Gruppen-Aktor (dnd5e `group`). |
| **Gruppen-Aktor** | — | Name, ID oder UUID. Nur relevant, wenn oben „Ein Gruppen-Aktor“ gewählt ist. Wird er nicht gefunden, greift automatisch die Spielercharakter-Liste. |
| **Anzahl der Reisenden** | 0 | `0` heißt: so viele, wie in der Quelle stehen. Jeder andere Wert gilt wörtlich — nützlich für NSC-Begleiter, Träger und Lasttiere. |

### Vorräte

| Option | Vorgabe |
|---|---|
| **Wasserbedarf pro Kopf und Tag** (Gallonen) | 2 |
| **Regensammler vorhanden** | aus |
| **SG des KON-Rettungswurfs** | 15 |

### Aufgaben

| Option | Vorgabe |
|---|---|
| **Eigene Aufgaben (JSON)** | leer |

### Pro Person

| Option | Vorgabe | Bedeutung |
|---|---|---|
| **Würfeldialog überspringen** | aus | Würfelt sofort, ohne den Konfigurationsdialog von dnd5e. Gilt nur für dich und ändert nichts am gespeicherten Ergebnis. |

---

## Eigene Aufgaben (JSON)

Die Option **Eigene Aufgaben (JSON)** nimmt ein JSON-Array, das über die `id`
**auf die Standardliste aufgerechnet** wird:

- Eine `id`, die einer Standardaufgabe entspricht, **überschreibt** diese —
  Feld für Feld, nicht als Ganzes. „Mach Navigation einfach SG 13“ ist also ein
  Objekt mit zwei Schlüsseln.
- Eine unbekannte `id` wird **angehängt**.
- `"hidden": true` **entfernt** eine Standardaufgabe.

Die Reihenfolge folgt der Standardliste, neue Einträge kommen dahinter — das
Fenster sortiert sich also nicht um, wenn jemand einen SG anpasst.

Ungültiges JSON kostet eine Warnung (genau eine, nicht eine pro Render) und die
Standardliste, nie das Fenster.

### Felder

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Stabiler Schlüssel. Wird gespeichert und zum Überschreiben benutzt, nie angezeigt. |
| `skill` | eins von beiden | Fertigkeit: Systemschlüssel (`"sur"`), `fullKey` (`"survival"`) oder englisches Label. |
| `ability` | eins von beiden | Attribut: `"wis"`, `"wisdom"` … Wird nur benutzt, wenn kein `skill` gesetzt ist. |
| `dc` | nein | Schwierigkeitsgrad. Ohne `dc` gibt es kein Erfolg/Misserfolg-Urteil, nur das Ergebnis. |
| `yield` | nein | `{ "formula": "...", "unit": "..." }`. Wird **nur bei Erfolg** gewürfelt. |
| `label` | nein | Anzeigename. Wörtlicher Text oder ein i18n-Schlüssel — beides funktioniert. Ohne Angabe wird `toa-adventure-tracker.task.<id>.label` benutzt. |
| `hint` | nein | Beschreibung, gleiche Regel wie `label`. |
| `icon` | nein | Font-Awesome-Klasse, z. B. `"fa-solid fa-fish"`. Foundry liefert FA mit, es wird nichts nachgeladen. |
| `hidden` | nein | `true` entfernt die Aufgabe. |

In `yield.formula` steht `@mod` für **denselben Modifikator, den auch die Probe
benutzt hat** — das ist die Bedeutung von „1W6 + WEI“. Zusätzlich stehen die
kompletten Würfeldaten des Aktors zur Verfügung, also etwa `@abilities.wis.mod`
oder `@prof`.

`yield.unit` wird über `toa-adventure-tracker.unit.<unit>` übersetzt; `gallons`
und `pounds` sind mitgeliefert. Unbekannte Einheiten werden wörtlich angezeigt —
`"unit": "Bündel"` funktioniert also einfach.

> **Achtung:** Nur die Aufgaben-`id`s `navigation`, `water` und `food` haben eine
> Sonderbedeutung. `navigation` bestimmt die Tagesstrecke und bekommt als einzige
> den Tempo-Modifikator; `water` und `food` speisen die Vorratsanzeige. Wer sie
> entfernt, verliert die zugehörige Auswertung — die Aufgabe selbst funktioniert
> weiter.

### Beispiel

```json
[
  { "id": "navigation", "dc": 13 },
  { "id": "rearguard", "hidden": true },
  {
    "id": "hunt",
    "label": "Jagen",
    "hint": "Bei Erfolg 2W6 Pfund Fleisch.",
    "skill": "sur",
    "dc": 14,
    "yield": { "formula": "2d6", "unit": "pounds" },
    "icon": "fa-solid fa-bow-arrow"
  },
  {
    "id": "medic",
    "label": "Feldscher",
    "skill": "med",
    "dc": 12
  },
  {
    "id": "carry",
    "label": "Lasten schleppen",
    "ability": "str",
    "dc": 10
  }
]
```

Das ergibt: Navigation auf SG 13, keine Nachhut mehr, und drei neue Aufgaben —
eine mit Ertrag, eine auf eine andere Fertigkeit, eine auf ein reines Attribut.

---

## API

```js
const api = game.modules.get("toa-adventure-tracker").api;
```

| Aufruf | Rechte | Bedeutung |
|---|---|---|
| `api.open()` | alle | Fenster öffnen bzw. in den Vordergrund holen. |
| `api.app` | alle | Die Instanz der Anwendung. |
| `api.setDay(n)` | SL | Reisetag setzen. |
| `api.adjustDay(delta)` | SL | Reisetag verschieben. |
| `api.completeDay()` | SL | Tag protokollieren, Würfe löschen, hochzählen. |
| `api.setPace("slow" \| "normal" \| "fast")` | SL | Reisetempo. |
| `api.setRain(true \| false)` | SL | Regen-Schalter. |
| `api.getState()` | alle | Der komplette Zustand. |
| `api.summarise()` | alle | Strecke, Wasser, Nahrung — dieselbe Rechnung wie das Fenster. |
| `api.getTasks()` | alle | Die effektive Aufgabenliste. |
| `api.partyActors()` | alle | Die Aktoren, die als reisend gelten. |
| `api.modifierFor(actor, task)` | alle | Der Modifikator eines Aktors für eine Aufgabe. |
| `api.moonFor(day)` | alle | Die Mondphase eines beliebigen Tages, ohne etwas zu ändern. |
| `api.refresh()` | alle | Offene Fenster neu zeichnen. Selten nötig — Zustandsänderungen tun das selbst. |
| `api.AdventureTracker` | alle | Die Klasse, zum Ableiten oder für `instanceof`. |

Die schreibenden Aufrufe sind auf SL-Ebene abgesichert: Ein Spieler, der
`api.setDay()` aufruft, ändert nichts — dieselbe Antwort, die ihm auch die Knöpfe
geben.

Ein Beispielmakro liegt im Kompendium **Wildnisreise: Makros**.

---

## Rechte und Synchronisierung

- Der **gesamte Zustand** liegt in einer Weltoption (`game.settings`, scope
  `world`) — niemals im Client-Storage.
- **Nur die SL schreibt.** Spielerseitige Aktionen (Aufgabe wählen, eigenen Wurf
  auslösen) gehen über `game.socket` an die SL, die schreibt.
- Das Schreiben einer Weltoption wird von Foundry selbst an alle Clients
  verteilt — deshalb gibt es **keine** eigene „jetzt alle neu zeichnen“-Nachricht.
- Sind mehrere SL angemeldet, führt genau eine die Anfrage aus
  (`game.user.isActiveGM`).
- Die Rechteprüfung findet **auf der SL-Seite** noch einmal statt. Der sendende
  Client blendet aus, was er nicht darf, aber eine Socket-Nachricht sind nur
  Daten — maßgeblich ist die Prüfung beim Empfänger.
- Ist **keine SL verbunden**, sagt das Fenster das oben in einem Banner, statt
  Klicks ins Leere laufen zu lassen.
- **Kein socketlib** als Abhängigkeit.

---

## Was das Modul *nicht* tut

- Keine Hexcrawl-Karte, keine Bewegung von Tokens
- Keine Zufallsbegegnungstabellen
- Keine Erschöpfungsautomatik — nur Hinweise
- Kein automatischer KON-Rettungswurf
- Keine Abhängigkeit von Bezahlmodulen

---

## Entwicklung

```bash
npm install          # classic-level (Kompendien) + handlebars (Tests)
npm run verify       # statische Prüfungen
npm test             # Mondmathematik + Integrationstests
npm run check        # beides
npm run build:packs  # packs/_source/*.json -> LevelDB-Kompendium
```

`npm run verify` prüft, was `node --check` nicht sehen kann und was jeweils schon
einmal etwas kaputtgemacht hat: Import-Zyklen, Templates mit mehr oder weniger als
genau einem Wurzelelement, `data-action`s ohne Handler, i18n-Schlüssel, die
gleichzeitig Blatt und Zweig sind, Sprachdateien mit unterschiedlichen
Schlüsselmengen, fehlende Übersetzungen und Manifest-Pfade ins Leere.

`npm test` fährt einen minimalen Foundry-Ersatz hoch (`tools/test/foundry-shim.mjs`)
und prüft damit Zustandsübergänge, Würfelweitergabe an die dnd5e-API,
Rechtetrennung und das gerenderte Template.

Die Kompendien liegen als JSON unter `packs/_source/` und werden daraus gebaut;
das LevelDB-Verzeichnis ist binär und darf nicht von Hand bearbeitet werden.

### Aufbau

| Datei | Inhalt |
|---|---|
| `scripts/const.mjs` | Konstanten und Standardtabellen |
| `scripts/settings.mjs` | Registrierung und Lesen aller Weltoptionen |
| `scripts/state.mjs` | Der Weltzustand — einziger Schreibpfad |
| `scripts/moon.mjs` | Mondphase und SVG-Geometrie |
| `scripts/tasks.mjs` | Aufgabenliste, Reisende, Modifikatoren, Würfe |
| `scripts/socket.mjs` | Spieleraktionen → SL |
| `scripts/app.mjs` | Das Fenster (ApplicationV2) |
| `scripts/module.mjs` | Hooks, Scene Controls, API |

---

## Lizenz

Siehe [LICENSE](LICENSE).
