# Wildnisreise — Adventure Tracker

Ein Foundry-VTT-Modul für Reisen durch die Wildnis in **D&D 5e**.

Jeder Spieler trägt sich in eine Rolle ein. Wie gut die Gruppe ihre Rollen
besetzt und würfelt, entscheidet, wie weit sie kommt und was ihr dabei zustößt.
Am Ende des Tages steht kein Zahlensalat, sondern ein **Bericht**: das Wetter,
was aus dem Dickicht kam, wie weit es die Gruppe getragen hat und was es sie
gekostet hat.

Eine Tagesstrecke kennt genau drei Antworten: **0, 1 oder 2 Hexfelder.**

- **Foundry VTT** v13
- **System** dnd5e 5.3
- Keine harten Abhängigkeiten, keine Bezahlmodule, keine externen Schriftarten

---

## Inhalt

- [Installation](#installation)
- [Der Ablauf eines Reisetags](#der-ablauf-eines-reisetags)
- [Die Rollen](#die-rollen)
- [Wie 0, 1 oder 2 Hexfelder entstehen](#wie-0-1-oder-2-hexfelder-entstehen)
- [Wetter](#wetter)
- [Vorräte, Durst und Hunger](#vorräte-durst-und-hunger)
- [Ereignisse](#ereignisse)
- [Folgen](#folgen)
- [Weltoptionen](#weltoptionen)
- [Eigene Rollen (JSON)](#eigene-rollen-json)
- [API](#api)
- [Rechte und Synchronisierung](#rechte-und-synchronisierung)
- [Was das Modul *nicht* tut](#was-das-modul-nicht-tut)
- [Entwicklung](#entwicklung)

---

## Installation

### Über die Manifest-URL

```
https://github.com/Domiknonf/toa-adventure-tracker/releases/latest/download/module.json
```

In Foundry unter **Add-on Modules → Install Module** eintragen, installieren,
in der Welt aktivieren.

> Das Repository muss dafür **öffentlich** sein — Foundry ruft die URL ohne
> Anmeldung ab und bekommt bei einem privaten Repo nur einen 404.

### Manuell

`module.zip` herunterladen, nach `Data/modules/toa-adventure-tracker/`
entpacken (der Ordnername muss exakt so lauten, `module.json` liegt direkt
darin), Foundry neu starten.

### Fenster öffnen

- **Scene Controls** → Journal-Notes-Gruppe → Wanderer-Symbol
- Kompendium **Wildnisreise: Makros** → „Wildnisreise öffnen“
- `game.modules.get("toa-adventure-tracker").api.open()`

---

## Der Ablauf eines Reisetags

**1. Rollen besetzen.** Jeder Charakter wählt im Fenster eine Rolle. Pro
Charakter genau eine — das erzwingt die Datenstruktur. Dieselbe Rolle darf
mehrfach besetzt werden, aber dann fehlt sie woanders.

Eine Gruppe von vier kann nicht acht Rollen füllen. **Welche Rollen ihr leer
lasst, ist die eigentliche Entscheidung dieses Fensters** — deshalb steht
unbesetzt direkt unter der Liste und nicht erst im Bericht.

**2. Würfeln.** Jeder würfelt seine Rolle selbst (oder die SL für alle, Knopf
„Alles würfeln“). Läuft über die dnd5e-Würfelmechanik, also greifen
Übungsbonus, Expertise, Vorteil, Segnen, Erschöpfung und andere Module.

**3. Tag auswerten** (SL). Jetzt würfelt das Modul: Wetter, ob euch etwas
findet, welches Ereignis, die Vorräte, die fälligen Rettungswürfe. Heraus
kommt der Tagesbericht.

**Auf die Charakterbögen wird dabei nichts geschrieben.** Deshalb ist
„Neu auswerten“ gefahrlos, wenn dir der Tag nicht gefällt.

**4. Vorlesen.** Der Bericht ist so geschrieben, dass man ihn vorlesen kann.

**5. Tag abschließen** (SL). *Jetzt* werden Schaden und Erschöpfung
eingetragen, der Tag geht in den Chat und ins Logbuch, der Zähler springt
weiter. Die Rollenverteilung bleibt bestehen.

---

## Die Rollen

| Rolle | Probe | SG | Wozu | Unbesetzt |
|---|---|---|---|---|
| **Navigator** | Überleben | 15 | Entscheidet, ob die Gruppe überhaupt vorankommt | **schlimmer** |
| **Vorhut** | Wahrnehmung | 12 | Entscheidet, ob ihr den Hinterhalt seht oder hineinlauft | **schlimmer** |
| **Nachhut** | Heimlichkeit | 12 | Verwischt die Spuren; sonst heftet sich etwas an eure Fersen | **schlimmer** |
| **Wasserträger** | Überleben | 12 | Findet Wasser — bei Erfolg 1W6 + WEI Gallonen | Misserfolg |
| **Sammler** | Überleben | 12 | Findet Nahrung — bei Erfolg 1W6 + WEI Pfund | Misserfolg |
| **Lagermeister** | Überleben | 12 | Ein schlechtes Lager ist eine Nacht, die nicht als Rast zählt | Misserfolg |
| **Feldscher** | Medizin | 12 | Die einzige Rolle, die Erschöpfung wieder **nimmt** | folgenlos |
| **Kartograph** | Nachforschungen | 12 | Findet nach einem Fehler zurück auf die Karte | folgenlos |

**„Unbesetzt“** sagt, was passiert, wenn niemand die Rolle übernimmt:

- *Misserfolg* — wie ein misslungener Wurf.
- *schlimmer* — wie ein misslungener Wurf, und die Strafe fällt härter aus.
  Niemand, der nach vorn sieht, ist eben nicht dasselbe wie ein unaufmerksamer
  Späher.
- *folgenlos* — die Rolle ist ein Bonus, ihr Fehlen kostet nichts.

Modifikatoren werden **nicht gepflegt, sondern gelesen**, aus
`actor.system.skills.<key>.total` bzw. `actor.system.abilities.<key>.mod`.
Fertigkeitsschlüssel löst das Modul über `CONFIG.DND5E.skills` auf — nichts ist
fest verdrahtet.

---

## Wie 0, 1 oder 2 Hexfelder entstehen

Grundwert ist **1 Hexfeld**. Darauf wirken, in dieser Reihenfolge:

| Was | Wirkung |
|---|---|
| Navigation misslungen, **kein** Kartograph | **0** — verlaufen, der Tag ist weg |
| Navigation misslungen, Kartograph erfolgreich | **1** — ein vertaner Tag statt eines verlorenen |
| Schnelles Tempo **und** Navigation um ≥ 3 übertroffen | **+1** → 2 Hexfelder |
| Ein blockierendes Ereignis (Sturm, Kampf, Flut) | **−1** |
| Erschöpfung Grad ≥ 3 in der Gruppe | höchstens **1** |
| Erschöpfung Grad ≥ 5 | **0** |

Das Ergebnis wird auf 0…2 begrenzt und auf die Obergrenze des Tempos.

Im Bericht steht **jeder dieser Schritte einzeln**. Eine Zahl ohne Begründung
ist eine Zahl, über die am Tisch gestritten wird.

### Die drei Tempi

| Tempo | Max. Hex | Navigation | Begegnungen |
|---|---|---|---|
| Langsam | 1 | **+5** | −10 % |
| Normal | 1 | 0 | — |
| Schnell | **2** | **−3** | +10 % |

Nur schnelles Tempo kann überhaupt 2 Hexfelder erreichen — und verliert dafür
deutlich mehr Tage ganz.

> **Warum −3 und nicht −5?** Die ursprüngliche Vorgabe war −5, aber die galt
> einem Meilen-Modell, in dem ein misslungener Navigationswurf die Strecke
> *halbierte*. Im Hex-Modell kostet er den **ganzen** Tag. Über 300 simulierte
> Tage kam schnelles Tempo mit −5 auf 0,40 Hexfelder gegenüber 0,69 bei
> normalem — das ist kein Risiko, das ist eine Falle. Mit −3 liegen beide bei
> etwa 0,65, aber schnell streut viel weiter: rund 20 % Zwei-Hex-Tage gegen
> 55 % verlorene. Beide Werte sind Weltoptionen.

Zum Vergleich, gleiche Gruppe, normales Tempo, **mit** Kartograph statt Vorhut:
0,83 Hexfelder pro Tag und nur 17 % verlorene Tage. Die Rollenwahl ist der
größte Hebel im ganzen System.

---

## Wetter

Wetter wird **gewürfelt, nie eingestellt.** Es gibt bewusst keinen Regenschalter:
Die ganze Vorratsrechnung ergibt nur dann etwas, wenn Trockenperioden der Gruppe
*zustoßen*. Eine SL, die jeden Morgen entscheiden müsste, ob es regnet, wird
sich — völlig zu Recht — für die Geschichte entscheiden, die sie ohnehin im Kopf
hat, und die Fässer laufen nie aus Versehen leer.

| Wetter | Vorgabe | Wasser | Wirkung |
|---|---|---|---|
| **Sturm** | 10 % | 6 Gallonen | Kostet den Tag |
| **Regen** | 55 % | 3 Gallonen | — |
| **Schwül** | ~17,5 % | — | — |
| **Klar und sengend** | ~17,5 % | — | Wasserbedarf **×1,5** |

Chult in der Regenzeit: zwei von drei Tagen sind nass. Beide Prozentwerte sind
Weltoptionen; was übrig bleibt, teilt sich auf schwül und klar auf.

Ein **Regensammler** bringt an Regentagen zusätzliches Wasser — und an trockenen
gar nichts. Genau das macht ihn in Port Nyanzaru kaufenswert und in einer
Dürre wertlos.

---

## Vorräte, Durst und Hunger

**Vorräte laufen über Tage weiter.** Das ist der Punkt: „ein paar Tage ohne
Regen und kein Wasser mehr“ ist nur dann ein Satz, der etwas bedeutet, wenn die
Fässer von gestern heute noch in den Büchern stehen.

Jeden Tag:

```
Wasser  +  Wetter  +  Fund des Wasserträgers  −  (Reisende × Bedarf × Hitze)
Nahrung +  Fund des Sammlers                  −  (Reisende × Bedarf)
```

- **Durst** kennt keine Karenz. Reicht das Wasser nicht, ist noch am selben Tag
  ein KON-Rettungswurf fällig; wer ihn nicht schafft, bekommt Erschöpfung.
- **Hunger** ist langsamer: erst nach einigen Karenztagen (Vorgabe 2) kostet er
  etwas.
- **Schlechtes Wasser** ist etwas anderes als gar keins. Wer suchen ging und
  misslang, hat etwas Fragwürdiges getrunken — mit eigenem Rettungswurf.

Die Vorräte lassen sich jederzeit von Hand setzen („Bearbeiten“), für den Fall,
dass die Gruppe in der Stadt Fässer gekauft hat.

---

## Ereignisse

**54 Ereignisse in 11 Kategorien.** Der Tagesbericht liefert Gründe, nicht nur
Zahlen: Der Tag, der ein Hexfeld gekostet hat, sagt *welches* Rudel Velociraptoren
es gekostet hat.

| Kategorie | Wodurch | Beispiele |
|---|---|---|
| **Hinterhalt** | Vorhut misslungen + Begegnung | Rudel Velociraptoren, Von Zombies überrannt, Pterafolk aus der Luft, Batiri-Hinterhalt, Girallon, Treibsand |
| **Rechtzeitig gesehen** | Vorhut erfolgreich + Begegnung | Frische T-Rex-Spuren, Prozession Untoter, Grung-Patrouille, Hadrosaurier-Herde, Tabaxi-Jägerin |
| **Verfolgung** | Nachhut misslungen | Augen im Rücken, Kamadan auf der Fährte, Trommeln in der Nacht |
| **Verlaufen** | Navigation misslungen | Im Kreis gelaufen, Der falsche Fluss, Schlucht ohne Übergang |
| **Umweg** | Navigation misslungen, Kartograph rettet | Zurück auf die Karte, Ein Felsen, der auf der Karte steht |
| **Schlechtes Wasser** | Wasserträger misslungen | Blutegel im Tümpel, Etwas liegt flussaufwärts |
| **Durst / Hunger** | Vorräte leer | Die Schläuche sind leer, Verdorbene Vorräte |
| **Lager** | Lagermeister misslungen | Ein Lager im Nassen, Ameisenstraße durchs Lager, Kein Feuer |
| **Sturm** | Wetter | Monsunregen, Hangrutsch, Blitzschlag, Der Fluss tritt über |
| **Glück** | Ein makelloser Tag, 25 % | Ein Chwinga folgt euch, Trockene Ruine, Klare Quelle |

Jedes Ereignis hat einen Namen, einen Absatz Prosa und seine Mechanik
(Schaden, Erschöpfung, Rettungswurf, kostet den Tag). Alle Texte liegen in
`lang/de.json` und `lang/en.json` — du kannst jede Zeile umschreiben, ohne
Code anzufassen.

**Ein misslungener Nebenrolle löst ihr Ereignis nicht garantiert aus**, sondern
mit einer Wahrscheinlichkeit (Verfolgung 35 / 45 %, Lager 30 / 35 %). Eine
Vierergruppe lässt zwangsläufig Rollen leer; würde jede davon jeden Tag feuern,
stünden jeden Morgen dieselben Absätze im Bericht und keiner davon hieße noch
etwas. So ist eine unbesetzte Rolle ein **Risiko**, das ihr tragt, statt einer
Steuer, die ihr zahlt. Navigation, Vorräte und Wetter sind davon ausgenommen —
das ist Arithmetik, kein Pech.

---

## Folgen

Beim Abschließen des Tages trägt das Modul ein:

- **Schaden** über `actor.applyDamage()` — also mit temporären TP, Resistenzen
  und Schadensreduktion, wie das System es vorsieht.
- **Erschöpfung** auf `system.attributes.exhaustion`, begrenzt auf die
  Obergrenze, die das System selbst kennt
  (`CONFIG.DND5E.conditionTypes.exhaustion.levels`).
- **Der Feldscher** nimmt Erschöpfung wieder weg.

Schaden wird **einmal pro Ereignis** gewürfelt und auf alle Betroffenen
angewandt. **Rettungswürfe** dagegen gehen pro Person durch das System — das ist
genau die Frage, die ein Charakter besteht und der nächste nicht, und darin
besteht die Textur einer schlechten Nacht. Ein bestandener Rettungswurf hebt das
Ereignis für diese Person ganz auf.

Beides lässt sich abschalten:
**„Folgen auf die Charakterbögen schreiben“** und
**„Rettungswürfe automatisch würfeln“**. Ausgeschaltet zeigt der Bericht
weiterhin genau an, was passiert *wäre*.

---

## Weltoptionen

Alle unter **Game Settings → Configure Settings → Wildnisreise**, weltweit
(`scope: "world"`), damit alle am Tisch dieselben Zahlen sehen. Ausnahme ist die
letzte.

### Mond
| Option | Vorgabe |
|---|---|
| Länge des Mondzyklus | 30 |
| Tag des ersten Vollmonds | 1 |

Der Mond ergibt sich **allein aus dem Tageszähler** — kein Kalendermodul nötig,
und er kann gar nicht erst aus dem Tritt geraten. Die Beleuchtung folgt
`(1 + cos θ)/2`, dieselbe Formel treibt auch die gezeichnete Scheibe, Zahl und
Bild können also nicht auseinanderlaufen.

> Bei Zyklus 30 mit Vollmond an Tag 1 liegt der exakte Neumond auf **Tag 16** —
> ein halber 30-Tage-Zyklus sind nun einmal 15 Tage *nach* Tag 1. Tag 15 ist mit
> 1 % optisch bereits Neumond. Wer ihn rechnerisch exakt auf Tag 15 will, stellt
> die Zykluslänge auf **28**.

### Tempo
| Option | Vorgabe |
|---|---|
| Langsam / Normal / Schnell: Modifikator | +5 / 0 / −3 |
| Tempo-Regeln des Systems anwenden | an |

Letzteres reicht das Tempo zusätzlich an dnd5e weiter, sodass dessen eigene
Regeln greifen (Vorteil auf Heimlichkeit bei langsamem Tempo und so weiter).
Unabhängig vom Zahlenmodifikator.

### Wetter und Begegnungen
| Option | Vorgabe |
|---|---|
| Sturmwahrscheinlichkeit | 10 % |
| Regenwahrscheinlichkeit | 55 % |
| Regensammler vorhanden | aus |
| Ertrag des Regensammlers | 4 |
| Begegnungswahrscheinlichkeit | 20 % |

### Reisende
| Option | Vorgabe |
|---|---|
| Quelle der Reisenden | Alle Charaktere mit Spielerbesitz |
| Gruppen-Aktor | — |
| Anzahl der Reisenden | 0 = Gruppengröße |

„Anzahl der Reisenden“ zählt die Mäuler, nicht die Würfelnden — setz eine Zahl,
wenn Träger, Lasttiere oder NSCs mittrinken.

### Vorräte
| Option | Vorgabe |
|---|---|
| Wasserbedarf pro Kopf und Tag | 2 Gallonen |
| Nahrungsbedarf pro Kopf und Tag | 1 Pfund |
| Karenztage bei Hunger | 2 |

### Folgen
| Option | Vorgabe |
|---|---|
| Folgen auf die Charakterbögen schreiben | an |
| Rettungswürfe automatisch würfeln | an |

### Eigene Rollen
| Option | Vorgabe |
|---|---|
| Eigene Rollen (JSON) | leer |

### Pro Person
| Option | Vorgabe |
|---|---|
| Würfeldialog überspringen | aus |

---

## Eigene Rollen (JSON)

Ein JSON-Array, das über die `id` **auf die Standardrollen aufgerechnet** wird:

- gleiche `id` **überschreibt** feldweise,
- neue `id` wird **angehängt**,
- `"hidden": true` **entfernt** eine Standardrolle.

Ungültiges JSON kostet eine Warnung (genau eine, nicht eine pro Render) und die
Standardliste — nie das Fenster.

### Felder

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Stabiler Schlüssel. Wird gespeichert, nie angezeigt. |
| `skill` | eins von beiden | `"sur"`, `"survival"` oder das Label. |
| `ability` | eins von beiden | `"wis"`, `"wisdom"` … Nur ohne `skill`. |
| `dc` | nein | Schwierigkeitsgrad. Ohne `dc` gibt es kein Urteil. |
| `yield` | nein | `{ "formula": "...", "unit": "..." }`, nur bei Erfolg gewürfelt. |
| `unfilled` | nein | `"fail"`, `"worse"` oder `"none"` (siehe [Die Rollen](#die-rollen)). |
| `label` / `hint` | nein | Text oder i18n-Schlüssel. Ohne Angabe aus `lang/*.json`. |
| `icon` | nein | Font-Awesome-Klasse. Foundry liefert FA mit. |
| `hidden` | nein | `true` entfernt die Rolle. |

In `yield.formula` steht `@mod` für **denselben Modifikator, den auch die Probe
benutzt hat**. Die kompletten Würfeldaten des Aktors stehen darunter zur
Verfügung, also etwa `@abilities.wis.mod` oder `@prof`.

### Beispiel

```json
[
  { "id": "navigator", "dc": 13 },
  { "id": "cartographer", "hidden": true },
  {
    "id": "hunter",
    "label": "Jäger",
    "hint": "Bei Erfolg 2W6 Pfund Fleisch.",
    "skill": "sur",
    "dc": 14,
    "unfilled": "none",
    "yield": { "formula": "2d6", "unit": "pounds" },
    "icon": "fa-solid fa-bow-arrow"
  },
  { "id": "interpreter", "label": "Dolmetscher", "ability": "cha", "dc": 12, "unfilled": "none" }
]
```

> **Achtung:** Die Rollen-`id`s `navigator`, `vanguard`, `rearguard`,
> `waterbearer`, `forager`, `quartermaster`, `medic` und `cartographer` haben
> Sonderbedeutung in der Auswertung. Eigene Rollen mit anderen `id`s werden
> gewürfelt und angezeigt, greifen aber nicht in die Tagesrechnung ein.

---

## API

```js
const api = game.modules.get("toa-adventure-tracker").api;
```

| Aufruf | Rechte | Bedeutung |
|---|---|---|
| `api.open()` | alle | Fenster öffnen. |
| `api.setDay(n)` / `api.adjustDay(d)` | SL | Reisetag. Verwirft die Auswertung. |
| `api.setPace("slow"\|"normal"\|"fast")` | SL | Reisetempo. |
| `api.setSupplies({ water, food })` | SL | Vorräte setzen. |
| `await api.resolveDay()` | SL | Tag auswerten. Schreibt **nichts** auf Bögen. |
| `api.clearReport()` | SL | Auswertung verwerfen. |
| `api.completeDay()` | SL | Protokollieren und weiterzählen. Wendet **keine** Folgen an — das tut der Knopf im Fenster. |
| `api.getState()` | alle | Der komplette Zustand. |
| `api.getRoles()` | alle | Die effektive Rollenliste. |
| `api.partyActors()` | alle | Wer als reisend gilt. |
| `api.modifierFor(actor, role)` | alle | Modifikator vom Bogen. |
| `api.worstExhaustion()` | alle | Höchster Erschöpfungsgrad in der Gruppe. |
| `api.moonFor(day)` | alle | Mondphase eines beliebigen Tages. |

Schreibende Aufrufe sind auf SL-Ebene abgesichert: Ein Spieler, der
`api.setDay()` aufruft, ändert nichts.

---

## Rechte und Synchronisierung

- Der **gesamte Zustand** liegt in einer Weltoption (`scope: "world"`) — niemals
  im Client-Storage.
- **Nur die SL schreibt.** Spieleraktionen (Rolle wählen, eigenen Wurf auslösen)
  gehen über `game.socket` an die SL.
- Das Schreiben einer Weltoption verteilt Foundry selbst an alle Clients —
  deshalb gibt es **keine** eigene „jetzt alle neu zeichnen“-Nachricht.
- Sind mehrere SL angemeldet, führt genau eine die Anfrage aus
  (`game.user.isActiveGM`).
- Die Rechteprüfung findet **auf der SL-Seite** noch einmal statt. Der sendende
  Client blendet aus, was er nicht darf, aber eine Socket-Nachricht sind nur
  Daten.
- Der **Würfelwurf passiert auf dem Client dessen, der klickt** — dort liegen
  seine Würfel, seine Module und seine Vorteils-Tastenkürzel. Nur das Ergebnis
  reist.
- Ist **keine SL verbunden**, sagt das Fenster das in einem Banner, statt Klicks
  ins Leere laufen zu lassen.
- **Kein socketlib** als Abhängigkeit.

---

## Was das Modul *nicht* tut

- Keine Hexcrawl-Karte, keine Bewegung von Tokens
- Keine Zufallsbegegnungstabellen im Sinne von Statblocks — die Ereignisse
  beschreiben, was passiert; **wer** dabei am Tisch steht, entscheidest du
- Kein Kampf. Ein Hinterhalt kostet TP und Zeit; ob daraus eine Kampfszene wird,
  ist deine Sache
- Keine Abhängigkeit von Bezahlmodulen

---

## Entwicklung

```bash
npm install          # classic-level (Kompendien) + handlebars (Tests)
npm run verify       # statische Prüfungen
npm test             # Mondmathematik + 270 Integrationstests
npm run check        # beides
npm run build:packs  # packs/_source/*.json -> LevelDB-Kompendium
```

`npm run verify` prüft, was `node --check` nicht sehen kann und was jeweils schon
einmal etwas kaputtgemacht hat: Import-Zyklen, Templates mit mehr oder weniger
als genau einem Wurzelelement, `data-action`s ohne Handler, i18n-Schlüssel, die
gleichzeitig Blatt und Zweig sind, Sprachdateien mit unterschiedlichen
Schlüsselmengen, Manifest-Pfade ins Leere — und, weil die Ereignistabelle der
eigentliche Inhalt dieses Moduls ist, **dass jedes Ereignis in jeder Sprache
einen Namen und einen Text hat** und keine verwaisten Texte herumliegen.

`npm test` fährt einen minimalen Foundry-Ersatz hoch
(`tools/test/foundry-shim.mjs`) und prüft damit Zustandsübergänge, die
Hex-Regeln, Wetter, Vorratsübertrag, Rechtetrennung und das gerenderte Template.

### Aufbau

| Datei | Inhalt |
|---|---|
| `scripts/const.mjs` | Rollen, Ereignisse, Wetter, Regeln — alle Tabellen |
| `scripts/settings.mjs` | Registrierung und Lesen aller Weltoptionen |
| `scripts/state.mjs` | Der Weltzustand — einziger Schreibpfad |
| `scripts/moon.mjs` | Mondphase und SVG-Geometrie |
| `scripts/weather.mjs` | Gewürfeltes Wetter |
| `scripts/roles.mjs` | Rollenliste, Reisende, Modifikatoren, Würfe |
| `scripts/events.mjs` | Auswahl aus der Ereignistabelle |
| `scripts/resolve.mjs` | **Die Tagesmaschine** — Wetter + Würfe → Hex, Ereignisse, Folgen |
| `scripts/consequences.mjs` | Schreibt Schaden und Erschöpfung auf die Bögen |
| `scripts/socket.mjs` | Spieleraktionen → SL |
| `scripts/app.mjs` | Das Fenster (ApplicationV2) |
| `scripts/module.mjs` | Hooks, Scene Controls, API |

`resolve.mjs` und `consequences.mjs` sind bewusst getrennt: Das eine würfelt und
baut einen Bericht, das andere ist der unumkehrbare Teil. Genau deshalb ist
„Neu auswerten“ gefahrlos.

---

## Lizenz

Siehe [LICENSE](LICENSE).
