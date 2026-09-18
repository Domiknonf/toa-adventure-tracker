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
- [Reisearten: zu Fuß, Reittier, Kanu, Schiff](#reisearten-zu-fuß-reittier-kanu-schiff)
- [Wie die Tagesstrecke entsteht](#wie-die-tagesstrecke-entsteht)
- [Würfel und Tempo am Tisch](#würfel-und-tempo-am-tisch)
- [Wetter](#wetter)
- [Ereignisse](#ereignisse)
- [Erschöpfung, wenn es keine langen Rasten gibt](#erschöpfung-wenn-es-keine-langen-rasten-gibt)
- [Folgen](#folgen)
- [Kampfgrößen für schwer und tödlich](#kampfgrößen-für-schwer-und-tödlich)
- [Was die Spieler sehen](#was-die-spieler-sehen)
- [Bereit für morgen](#bereit-für-morgen)
- [Was der Tag jedem einzelnen gekostet hat](#was-der-tag-jedem-einzelnen-gekostet-hat)
- [Die Grung und euer Grung](#die-grung-und-euer-grung)
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

- **Eigener Knopf in der linken Werkzeugleiste** — das Wanderer-Symbol, unter
  den Kartenwerkzeugen. Ein Klick auf die Gruppe öffnet das Fenster sofort; in
  der Leiste daneben liegen „Wildnisreise öffnen“ und (nur SL) „Tag laufen
  lassen“.
- Kompendium **Wildnisreise: Makros** → „Wildnisreise öffnen“
- `game.modules.get("toa-adventure-tracker").api.open()`

Der Knopf ist eine **eigene Kategorie**, keine Schaltfläche in einer fremden
Gruppe: Ein Reisetag ist keine Notizverwaltung, und ein Knopf, den niemand
findet, ist ein Knopf, den niemand drückt. Er steuert bewusst *keine*
Leinwandebene — er öffnet ein Fenster. Spieler sehen ihn ebenfalls, denn ihre
Ansicht ist inzwischen mehr als ein Schaufenster (siehe unten).

### Sprache

**Das Modul spricht Deutsch, egal was in Foundry eingestellt ist.** Es liefert
eine einzige Sprachdatei (`lang/de.json`) und meldet sie auch als Tabelle für
`en` an — das ist die Sprache, auf die Foundry zurückfällt, wenn es für die
eingestellte keine findet. Ohne diesen Eintrag würde jeder Tisch, der Foundry
nicht auf Deutsch stellt, rohe Schlüsselpfade wie
`toa-adventure-tracker.app.day` zu sehen bekommen — und zwar unsichtbar für
jeden, der auf Deutsch testet. `verify.mjs` prüft genau das.

Fest verdrahtete Texte gibt es trotzdem keine: Wer übersetzen will, legt
`lang/xx.json` an und trägt sie in `module.json` ein.

---

## Der Ablauf eines Reisetags

**1. Rollen besetzen.** Du weist jedem Charakter im Fenster eine Rolle zu
(oder die Spieler tun es selbst, siehe [Was die Spieler sehen](#was-die-spieler-sehen)). Pro
Charakter genau eine — das erzwingt die Datenstruktur. Dieselbe Rolle darf
mehrfach besetzt werden, aber dann fehlt sie woanders.

Eine Gruppe von vier kann nicht acht Rollen füllen. **Welche Rollen ihr leer
lasst, ist die eigentliche Entscheidung dieses Fensters** — deshalb steht
unbesetzt direkt unter der Liste und nicht erst im Bericht.

**2. „Tag würfeln & auswerten"** — ein Knopf. Er würfelt jede noch offene
Rolle und wertet den Tag anschließend aus: Wetter, ob euch etwas findet, welches
Ereignis, die fälligen Rettungswürfe. Heraus kommt der Tagesbericht
mit Ergebnis **und Begründung**.

Ein Wurf, der schon auf dem Tisch liegt, wird respektiert und nicht
überschrieben — du kannst also eine einzelne Zeile von Hand würfeln und den Rest
dem Knopf überlassen. Die getrennten Knöpfe „Alles würfeln" und „Tag auswerten"
bleiben genau dafür erhalten.

Gewürfelt wird über die dnd5e-Mechanik, also greifen Übungsbonus, Expertise,
Vorteil, Segnen, Erschöpfung und andere Module. Mit der Weltoption **„Spieler
dürfen selbst würfeln"** übernehmen die Spieler ihre eigenen Charaktere.

**Auf die Charakterbögen wird dabei nichts geschrieben.** Deshalb ist „Neu
auswerten" gefahrlos, wenn dir der Tag nicht gefällt.

**3. Vorlesen.** Der Bericht ist so geschrieben, dass man ihn vorlesen kann.

**4. „Folgen anwenden"** — der Knopf unter der Folgenliste. *Jetzt* werden
Schaden und Erschöpfung auf die jeweiligen Charakterbögen geschrieben. Danach
steht dort „Folgen angewendet" statt des Knopfs.

Das ist eine eigene Entscheidung, getrennt vom Tagesabschluss: Der Dschungel hat
schon zugebissen, aber die Gruppe legt sich vielleicht noch nicht schlafen. Der
Merker liegt im **gespeicherten Bericht** — ein zweiter Druck kann dieselben
Trefferpunkte also nicht ein zweites Mal abziehen, auch nicht nach einem
Neuladen oder von einem anderen Rechner aus.

**5. Tag abschließen** (SL). Der Tag geht in den Chat und ins Logbuch, der
Zähler springt weiter. Wurden die Folgen noch nicht angewendet, holt dieser
Schritt das nach — wurden sie es schon, rührt er sie nicht an. Die
Rollenverteilung bleibt bestehen.

> Willst du einen bereits angewendeten Tag neu auswerten, warnt der Dialog
> ausdrücklich: Neu auswerten würfelt den Tag neu, **nimmt den bereits
> angerichteten Schaden aber nicht zurück.**

---

## Die Rollen

| Rolle | Probe | SG | Was sie mechanisch tut | Unbesetzt |
|---|---|:--:|---|---|
| **Navigator** | Überleben | 13 | Bestimmt die Tagesstrecke. Ein knapper Fehlschlag (bis 2 unter dem SG) kostet nur den halben Tag, ein echter den ganzen — außer der Kartograph fängt ihn auf. | **schlimmer** |
| **Vorhut** | Wahrnehmung | 12 | Entscheidet, ob eine Begegnung ein Hinterhalt oder eine rechtzeitige Sichtung wird. Misslungen kostet TP. | **schlimmer** |
| **Nachhut** | Heimlichkeit | 12 | Verwischt die Spuren. Misslungen hebt die Begegnungschance um 15 Punkte und kann eine Verfolgung auslösen. | **schlimmer** |
| **Lagermeister** | Überleben | 12 | Gelungen: nimmt dem am stärksten Erschöpften **einen Grad Erschöpfung ab**. Misslungen: eine Nacht, die nicht als Rast zählt. | Misserfolg |
| **Feldscher** | Medizin | 12 | Nimmt bei Erfolg dem am stärksten erschöpften Reisenden einen Grad Erschöpfung ab. | folgenlos |
| **Kartograph** | Nachforschungen | 12 | Fängt einen misslungenen Navigationswurf auf: halbe Strecke statt null, mindestens ein Hexfeld. | folgenlos |

Dieselbe Tabelle steht **im Fenster selbst** — die
[Rollentafel](#die-rollentafel), die auch die Spieler sehen: wer die Rolle
gerade hat, welchen Modifikator er darauf bringt, was das gewählte Tempo auf
die Probe legt, und was du selbst darauf hättest.

> **Der Feldscher tat lange nichts.** Seine Beschreibung versprach, er nehme
> Erschöpfung wieder ab — die Engine hatte nie von ihm gehört. Aufgefallen ist
> das erst beim Schreiben dieser Übersicht, weil die Spalte „Was sie mechanisch
> tut" leer blieb. Jetzt prüft `verify`, dass **jede** Standardrolle vom
> Resolver gelesen wird *und* eine Wirkungsbeschreibung hat.

### Ein knapper Fehlschlag kostet nicht den ganzen Tag

Am Kurs um eins vorbei ist nicht dasselbe wie im Kreis laufen — und darf nicht
denselben Tag kosten. Verfehlt die Navigation ihren SG um **höchstens 2**, geht
der Vormittag an ein falsches Tal und die Gruppe kommt trotzdem **ein
Hexfeld** weit. Alles darüber ist der verlorene Tag, der es immer war.

Das war die größte Einzelursache dafür, dass sich das Modul gegen die Spieler
anfühlte: Über 3000 gemessene Tage endete **die Hälfte aller Reisetage bei null
Hexfeldern** — einen ganzen Tag marschieren und nirgendwo ankommen, jeden
zweiten Tag. Jetzt ist es rund ein Drittel, mit Kartograph ein Fünftel.

Zwei Dinge bleiben bewusst hart:

- Eine **unbesetzte** Navigation hat keinen Vorsprung, knapp daneben zu sein.
  Niemanden auf die wichtigste Rolle zu setzen ist weiterhin die Katastrophe,
  die es immer war.
- Der **Kartograph** rettet *jeden* Fehlschlag, nicht nur den knappen, und in
  den schnelleren Reisearten rettet er mehr als ein Hexfeld. Eine Rolle muss
  mehr wert sein als die Regel, die greift, wenn sie niemand besetzt.

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

## Reisearten: zu Fuß, Reittier, Kanu, Schiff

Das Tempo sagt, wie sehr ihr euch anstrengt. Die **Reiseart** sagt, womit — und
das macht den größeren Unterschied. Ein Tag unter Segeln bringt euch weiter als
ein Tag Macheten im Dickicht, und das gehört nicht in die Tempo-Tabelle, sonst
müsste „schnell" zwei verschiedene Dinge gleichzeitig heißen.

| Reiseart | langsam | normal | schnell | Ereignisse aus | Besonderheit |
|---|:--:|:--:|:--:|---|---|
| **Zu Fuß** | 1 | 1 | 2 | Land | Die ursprüngliche Regel: 0, 1 oder 2 und nichts sonst |
| **Reittiere** | 1 | 2 | 3 | Land + Reittier | Eigene Pannen: lahmende Tiere, Durchgehen, erschöpfte Pferde |
| **Kanu** | 1 | 2 | 3 | Land + Fluss | Krokodile, Stromschnellen, Flusspferde — gelagert wird am Ufer |
| **Schiff** | 2 | 3 | 5 | See | Piraten, Sahuagin, Flaute. **Keine Nachhut** — es gibt keine Spuren |

Gemessen über je 2000 simulierte Tage mit der Referenzgruppe (siehe unten),
Hexfelder pro Tag:

| | langsam | normal | schnell |
|---|:--:|:--:|:--:|
| Zu Fuß | 0,67 | 0,85 | 0,99 |
| Reittiere | 0,69 | 1,48 | 1,66 |
| Kanu | 0,70 | 1,57 | 1,63 |
| Schiff | 1,37 | 2,10 | 2,75 |

**Die Ereignispools sind getrennt.** Velociraptoren tauchen nie auf offener See
auf, Sahuagin nie im Dschungel. Was überall passiert — ein verpeilter Kurs,
ein Blitzschlag — ist als solches markiert und immer im Spiel. Von 81
Ereignissen sind 44 Land, 10 überall, 10 Fluss, 14 See und 3 nur beritten.

**Die Rollen folgen der Reiseart.** Auf einem Schiff gibt es keine Nachhut, weil
es keine Spuren zu verwischen gibt — die Rolle verschwindet aus der Auswahl und
zählt auch nicht als unbesetzt. Wer beim Umsteigen eine Rolle hielt, die es in
der neuen Reiseart nicht gibt, verliert sie; alle anderen behalten ihre.

Ein Wechsel der Reiseart **verwirft die Auswertung und die Würfe des Tages**.
Ein Navigationswurf zu Fuß ist nicht der Wurf, den man am Ruder gemacht hätte,
und die bereits gezogenen Ereignisse gibt es in der neuen Reiseart womöglich gar
nicht — Velociraptoren im Bericht, nachdem ihr an Bord gegangen seid, wären
schlimmer als ein neuer Wurf.

---

## Wie die Tagesstrecke entsteht

Grundwert ist die **Obergrenze der Reiseart beim gewählten Tempo** (siehe
Tabelle oben). Darauf wirken, in dieser Reihenfolge:

| Was | Wirkung |
|---|---|
| Navigation misslungen, **kein** Kartograph | **0** — verlaufen, der Tag ist weg (in jeder Reiseart) |
| Navigation misslungen, Kartograph erfolgreich | die **Hälfte** der Obergrenze, mindestens 1 |
| Normales Tempo, Navigation um ≥ 8 übertroffen | **+1** über der Obergrenze |
| Schnelles Tempo, Navigation um **weniger als 3** übertroffen | zurück auf die Normal-Obergrenze |
| Ein blockierendes Ereignis (Sturm, Kampf, Flaute, Riff) | **−1** je Ereignis |
| Erschöpfung Grad ≥ 3 in der Gruppe | höchstens **1** |
| Erschöpfung Grad ≥ 5 | **0** |

Im Bericht steht **jeder dieser Schritte einzeln**. Eine Zahl ohne Begründung
ist eine Zahl, über die am Tisch gestritten wird.

### Die drei Tempi

| Tempo | Navigation | Vorhut | Nachhut | Begegnungen | Obergrenze |
|---|:--:|:--:|:--:|:--:|---|
| Langsam | +1 | — | **+5** | −10 % | fest |
| Normal | 0 | — | — | — | **+1 bei Vorsprung ≥ 8** |
| Schnell | 0 | **−5** | **−5** | +10 % | höher, ab Vorsprung ≥ 3 |

Gemessen über je 2000 Tage zu Fuß mit der **Referenzgruppe** (fünf Charaktere
auf Stufe 6; Navigation +5, Vorhut +4, Nachhut +9, Lager +1, Medizin +3 — die
sechste Rolle bleibt zwangsläufig leer):

| Tempo | Hexfelder/Tag | Nulltage | Schaden/Tag |
|---|:--:|:--:|:--:|
| Langsam | 0,67 | 33 % | 3,0 |
| Normal | 0,85 | 35 % | 3,7 |
| Schnell | **0,99** | 34 % | **7,2** |

Schnell kommt am weitesten **und** kostet doppelt so viel Blut. Das ist der
Handel.

### Wofür normales Tempo überhaupt gut ist

Zu Fuß haben langsam und normal **dieselbe Obergrenze von einem Hexfeld**. Auf
der Karte im Fenster sah langsam damit strikt besser aus: drei Vorteile, gleiche
Strecke. Die Regel, die das umdreht, stand nur in dieser Datei.

**Nur normales Tempo kann seine eigene Obergrenze überbieten:** Liegt die
Navigation **8 oder mehr** über dem SG, gibt es ein Hexfeld extra. Langsam
erreicht das nie — „Obergrenze fest" heißt genau das. Und schnell bekommt die
höhere Zahl auf seiner Karte *nur* bei einem Vorsprung von 3; sonst fällt es auf
das Normalmaß zurück und hat die zusätzlichen Begegnungen schon bezahlt.

Alle drei Sätze stehen jetzt **auf den Tempo-Karten im Fenster**. Eine
Obergrenze ist ein Versprechen, und alle drei haben ein Sternchen.

> **Zwei Fehler, die hier drinsteckten — beide gefunden, indem gerechnet statt
> geraten wurde.**
>
> **Erstens war normales Tempo sinnlos.** Zu Fuß sind langsam und normal beide
> bei einem Hexfeld gedeckelt. Mit +5 auf Navigation verlor ein langsamer Tag
> nur in 28 % der Fälle den Weg gegenüber 44 % bei normalem — bei *gleicher
> Strecke und weniger Begegnungen*. Langsam war damit immer die richtige
> Antwort. Behoben durch einen kleineren Bonus (+1) und dadurch, dass
> **normales Tempo als einziges bei einem Vorsprung von 8 ein Hexfeld über
> seiner Obergrenze herausholt**. Langsam erreicht das nie.
>
> **Zweitens war schnelles Tempo langsamer als normales** — 0,70 gegen 0,77
> Hexfelder pro Tag. Ursache: Ich hatte schnellem Tempo einen Malus auf die
> *Navigation* gegeben, und weil ein misslungener Navigationswurf den **ganzen**
> Tag kostet, fraßen die verlorenen Tage die Zwei-Hex-Tage auf. Ein Tempo, das
> weniger Strecke macht *und* mehr Ärger einsammelt, ist kein Risiko, sondern
> ein Fehler.
>
> 5e berechnet schnelles Reisen ohnehin nicht über die Navigation, sondern über
> **Wahrnehmung (−5 passiv) und fehlende Heimlichkeit** — also genau über Vorhut
> und Nachhut. Dorthin verschoben stimmt beides: Schnell kommt am weitesten und
> bezahlt es damit, in Dinge hineinzulaufen. Eine misslungene Vorhut ist ein
> Hinterhalt statt einer Sichtung, eine misslungene Nachhut heftet euch etwas an
> die Fersen.

Schnelles Tempo hebt die Obergrenze — aber nur, wenn die Navigation den SG um
mindestens 3 übertrifft. Sonst kommt ihr auf das Normalmaß, habt die
zusätzlichen Begegnungen aber schon bezahlt.

**Die Rollenwahl ist der größte Hebel im ganzen System.** Dieselbe Gruppe, zu
Fuß, normales Tempo — nur die fünfte Rolle getauscht:

| Fünfte Rolle | Hexfelder/Tag | Nulltage |
|---|:--:|:--:|
| Feldscher | 0,87 | 34 % |
| **Kartograph** | **1,01** | **21 %** |

Der Kartograph ist die Versicherung gegen den verlorenen Tag. Wer ihn nicht
besetzt, zahlt das mit einem Drittel aller Reisetage.

---

## Wetter

Wetter wird **gewürfelt, nie eingestellt.** Es gibt bewusst keinen Regenschalter:
Ein Sturm bedeutet nur dann etwas, wenn er der Gruppe *zustößt*. Eine SL, die
jeden Morgen entscheiden müsste, ob es regnet, wird sich — völlig zu Recht —
für die Geschichte entscheiden, die sie ohnehin im Kopf hat, und der Dschungel
wäre nie unangenehmer, als es gerade passt.

| Wetter | Vorgabe | Wirkung |
|---|---|---|
| **Sturm** | 10 % | Kostet den Tag |
| **Regen** | 55 % | — |
| **Schwül** | ~17,5 % | — |
| **Klar und sengend** | ~17,5 % | — |

Chult in der Regenzeit: zwei von drei Tagen sind nass. Beide Prozentwerte sind
Weltoptionen; was übrig bleibt, teilt sich auf schwül und klar auf.

---

---

## Ereignisse

**81 Ereignisse in 11 Kategorien, verteilt auf vier Reisearten.** Der Tagesbericht liefert Gründe, nicht nur
Zahlen: Der Tag, der ein Hexfeld gekostet hat, sagt *welches* Rudel Velociraptoren
es gekostet hat.

| Kategorie | Wodurch | Beispiele |
|---|---|---|
| **Hinterhalt** | Vorhut misslungen + Begegnung | Rudel Velociraptoren, Von Zombies überrannt, Pterafolk aus der Luft, Batiri-Hinterhalt, Girallon, Treibsand |
| **Rechtzeitig gesehen** | Vorhut erfolgreich + Begegnung | Frische T-Rex-Spuren, Prozession Untoter, Grung-Patrouille, Hadrosaurier-Herde, Tabaxi-Jägerin |
| **Verfolgung** | Nachhut misslungen | Augen im Rücken, Kamadan auf der Fährte, Trommeln in der Nacht |
| **Verlaufen** | Navigation misslungen | Im Kreis gelaufen, Der falsche Fluss, Schlucht ohne Übergang |
| **Umweg** | Navigation misslungen, Kartograph rettet | Zurück auf die Karte, Ein Felsen, der auf der Karte steht |
| **Lager** | Lagermeister misslungen | Ein Lager im Nassen, Ameisenstraße durchs Lager, Kein Feuer |
| **Sturm** | Wetter | Monsunregen, Hangrutsch, Blitzschlag, Sturm auf See, Flaute, Stromschnellen |
| **Glück** | Kein Unheil gezogen und der Kurs gehalten, 30 % | Ein Chwinga folgt euch, Trockene Ruine, Klare Quelle |

Jedes Ereignis hat einen Namen, einen Absatz Prosa und seine Mechanik
(Schaden, Erschöpfung, Rettungswurf, kostet den Tag). Alle Texte liegen in
`lang/de.json` — du kannst jede Zeile umschreiben, ohne Code anzufassen.

> **Gute Tage gab es praktisch nie.** Die Bedingung für ein Glücksereignis war
> früher, dass **jede** Rolle gelungen ist — was eine Gruppe von fünf nie
> erfüllen kann, weil es sechs Rollen gibt und eine unbesetzte als misslungen
> zählt. Gemessen: Glück trat an 3 % der Tage ein, die Oberseite war Deko.
> Jetzt hängt es an den zwei Dingen, die die Gruppe tatsächlich in der Hand
> hat — es kam nichts, und der Kurs stimmte —, und liegt bei 8–15 %.

> **Schaden war zu selten, nicht zu klein.** Er lag fast vollständig im
> **Hinterhalt**-Pool (18 von 18 Einträgen), und ein Hinterhalt braucht eine
> Begegnung *und* eine patzende Vorhut — zusammen rund 7 % der Tage. Gemessen:
> an **87 % aller Reisetage** bekam niemand einen Kratzer. Jetzt kostet auch ein
> verlorener Tag im Dornengestrüpp, ein schlechtes Lager und eine rechtzeitig
> gesichtete Begegnung etwas — in kleinen Bissen mit Rettungswurf statt in einer
> Spitze. Tage mit Schaden: **13 % → 34 %**, je Charakter über 40 Tage
> **16 → 28 TP**. Die Begegnungschance steht jetzt auf 28 % statt 20 %.
>
> Die Vorhut bleibt trotzdem die Rolle, die Blut spart: Eine Sichtung kostet im
> Schnitt einen Bruchteil eines Hinterhalts, die meisten Sichtungen kosten
> weiterhin gar nichts, und jede, die etwas kostet, bietet einen Rettungswurf.
> Ein Test prüft genau diesen Vergleich statt einer Null.

**Ein misslungener Nebenrolle löst ihr Ereignis nicht garantiert aus**, sondern
mit einer Wahrscheinlichkeit (Verfolgung 30 / 35 %, Lager 25 / 30 %). Eine
Vierergruppe lässt zwangsläufig Rollen leer; würde jede davon jeden Tag feuern,
stünden jeden Morgen dieselben Absätze im Bericht und keiner davon hieße noch
etwas. So ist eine unbesetzte Rolle ein **Risiko**, das ihr tragt, statt einer
Steuer, die ihr zahlt. Navigation und Wetter sind davon ausgenommen —
das ist Arithmetik, kein Pech.

---

## Erschöpfung, wenn es keine langen Rasten gibt

Viele Tische in Chult spielen mit der Hausregel, dass **lange Rasten nur an
gesicherten Orten** möglich sind — nicht im Dschungel. Damit hat Erschöpfung
keinen Rückweg mehr, und ein Reisemodul, das sie großzügig verteilt, wird zur
Ratsche.

Das ist gemessen, nicht geschätzt. Über 200 simulierte Treks (vier Charaktere,
Stufe 6, kompetent besetzt, **ohne** lange Rasten):

| | vorher | jetzt |
|---|:--:|:--:|
| Erschöpfung netto pro Tag | 0,48 | **0,23** |
| Erste Stufe 3 (Strecke gedeckelt) | nach ~21 Tagen | nach ~23 Tagen, und nur in 25 von 200 Läufen |
| Stufe 6 erreicht (tot) | **68 von 200** | **0 von 200** |
| 40 Tage überlebt | 132 von 200 | **200 von 200** |

Zwei Regeln sorgen dafür:

**Jede Erschöpfung ist abwendbar.** Vorher verteilten drei Ereignisse einen Grad
ganz ohne Rettungswurf — eine Strafe ohne Spiel darin. Jetzt bietet jedes
Ereignis, das Erschöpfung kostet, einen Rettungswurf. Zwei weitere treffen
außerdem nur noch einen Reisenden statt die ganze Gruppe: eine schlechte Nacht
ist nicht automatisch jedermanns schlechte Nacht.

**Ein gutes Lager ist die Erholung.** Gelingt dem Lagermeister seine Probe,
nimmt er dem am stärksten erschöpften Reisenden einen Grad ab — genau der
Hebel, den eine lange Rast sonst wäre. Der Feldscher tut dasselbe, und sind
beide besetzt, kümmern sie sich um **zwei verschiedene** Leute.

Damit wird die Rollenwahl zum eigentlichen Überlebensfaktor:

| Aufstellung | Erschöpfung/Tag | Stufe 3 | Tot in 40 Tagen |
|---|:--:|:--:|:--:|
| **mit** Lagermeister | 0,25 | 25/200 | **0/200** |
| **ohne** | 0,49 | 193/200 | 111/200 |

Wer im Dschungel niemanden das Lager aufschlagen lässt, wird zermahlen. Das ist
Absicht — und es steht in der Rollentafel im Fenster, bevor der erste Wurf
fällt.

> Spielt ihr mit normalen langen Rasten, ändert das nichts zum Schlechteren:
> Erschöpfung wird dann ohnehin zurückgesetzt, und die Erholung durch das Lager
> ist einfach ein zusätzlicher Puffer.

### Und die Trefferpunkte?

Kurze Rasten ändern an der Erschöpfungsrechnung oben **nichts** — in 5e nimmt
nur eine lange Rast Erschöpfung ab. „Nur kurze Rasten" ist für Erschöpfung
also genau der Fall, der oben gemessen wurde.

Für Trefferpunkte sind kurze Rasten dagegen die einzige Quelle: Trefferwürfel.
Und die kommen ihrerseits nur bei einer langen Rast zurück — mit der Hausregel
hat die Gruppe für den ganzen Trek **einen** Vorrat und danach gar nichts. Also
auch das gemessen, gleicher Aufbau, 150–200 Treks über 40 Tage:

Rund **28 Trefferpunkte in sechs Wochen**, gemessen bei 55 % Rettungswurf-Chance
— etwa zwei Drittel eines Pools auf Stufe 6, bevor überhaupt ein Trefferwürfel
ausgegeben wurde. Mit der Hausregel habt ihr für den ganzen Trek **einen** Satz
Trefferwürfel und danach nichts mehr, also ist das eine echte Rechnung und
keine Randnotiz mehr — dazu kommen ja noch die Kämpfe, die ihr aus den
Begegnungen macht, und die zählt dieses Modul nicht mit.

> Wenn euch das zu viel oder zu wenig ist: **Weltoption „Schadensstärke"**, in
> Prozent. 100 lässt jede Würfelformel so, wie sie geschrieben ist; 75 nimmt ein
> Viertel weg, 150 legt die Hälfte drauf. Die eine Stellschraube, die keine
> Messung von mir entscheiden kann — wie blutig ein Reisetag sein soll, ist
> Geschmackssache am Tisch.

> **Und das Tagesende?** Früher hing der Automatismus an einer langen Rast mit
> „neuer Tag", die es bei euch im Dschungel nie gibt. Deshalb gibt es jetzt den
> Knopf **„Bereit"** in jedem Spielerfenster — siehe
> [Bereit für morgen](#bereit-für-morgen).

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

## Kampfgrößen für schwer und tödlich

Das Ereignis sagt, dass ein Rudel Velociraptoren aufgetaucht ist. Wie viele
davon einen echten Kampf ergeben, steht direkt darunter — damit du manche
Begegnungen einfach ausspielen kannst, statt sie nur zu erzählen.

```
Rudel Velociraptoren                    [kostet den Tag] [2W6 Schaden]
Sie kommen aus drei Richtungen gleichzeitig, lautlos bis zum letzten Sprung …
⚔ Velociraptor  HG 1/4   Schwer: 12×   Tödlich: 12×+
```

**Die Gruppenstufe trägst du ein** — oben im Tagesbericht (ein Feld, gilt
sofort) oder in den Weltoptionen. `0` heißt: aus den Charakterbögen errechnen,
gemittelt über die Reisenden. Trag eine feste Stufe ein, wenn die Bögen nicht
den Tisch abbilden.

Gerechnet wird mit den XP-Budgets des **DMG von 2014** — der Edition, für die
Tomb of Annihilation geschrieben wurde — inklusive des Gruppenmultiplikators
(zwei Gegner zählen ×1,5, drei bis sechs ×2, und so weiter). Das Budget zählt
die **Charaktere**, nicht die Reisenden: Träger und Lasttiere trinken mit,
halten aber keine Linie.

Drei Fälle, die das Fenster unterscheidet:

| Anzeige | Bedeutung |
|---|---|
| `Schwer: 7× · Tödlich: 10×` | Der Normalfall. |
| `Tödlich: 1×` (ohne „Schwer") | Schon ein einzelner ist mehr als ein schwerer Kampf — eine „Schwer"-Zahl gäbe es hier nicht ehrlich. |
| `Schon einzeln jenseits von tödlich` | Ein Tyrannosaurus gegen eine Stufe-6-Gruppe. Lauft. |

Ein `+` hinter der Zahl heißt: Es ginge noch mehr, aber bei zwölf hört die
Empfehlung auf. Vierzig Stirges sind rechnerisch tödlich und praktisch ein
Nachmittag voll Initiativewürfe.

**Nicht jedes Ereignis bekommt eine Zahl.** Treibsand ist kein Gegner, und die
Tabaxi-Jägerin will nur wissen, wohin ihr wollt. Ereignisse ohne Gegner zeigen
keine Kampfgröße — sonst würde das Modul einen Kampf erfinden, den das Ereignis
gar nicht beschreibt.

Es bleibt eine **Empfehlung**: Das Modul stellt keine Tokens auf, würfelt keine
Initiative und rührt den Kampf-Tracker nicht an. Es ist Arithmetik, angeboten
der Person, die entscheidet.

---

## Was die Spieler sehen

**Die Auswertung gehört der Spielleitung — die Rollentafel gehört allen.**

Ein Spieler sieht:

- den **Reisetag**
- die **Mondphase** samt gezeichneter Scheibe
- **wie** die Gruppe unterwegs ist (Reiseart und Tempo, als eine Zeile Text)
- das **Wetter von heute**, sobald der Tag ausgewertet ist — darin stehen sie ja
- die **Rollentafel**

### Die Rollentafel

Die eigentliche Antwort auf „was kann ich hier tun“. Eine Zeile pro Rolle, und
darin:

| Spalte | Was drinsteht |
|---|---|
| **Rolle** | Name und Symbol; der Tooltip erklärt sie in einem Satz |
| **Besetzt durch** | Wer sie hat — Porträt, Name und **dessen Modifikator** auf diese Probe. Ein Ring um das Porträt heißt: heute schon gewürfelt. Leer steht „niemand“ |
| **Probe** | Welcher Skill gewürfelt wird, der **SG**, und der **Auf- oder Abschlag des aktuellen Tempos** |
| **Du** | **Dein eigener** Wert auf diese Probe — für *jede* Rolle, nicht nur für deine. Die Antwort auf „wo wäre ich eigentlich nützlich“ |
| **Wirkung** | Was die Rolle mechanisch bewirkt |
| **Unbesetzt** | Was es kostet, sie leer zu lassen |

Bei der Spielleitung ist die Tafel zugeklappt (sie hat die Arbeitsfläche
darüber), bei Spielern aufgeklappt — für sie *ist* sie das Fenster. Die
Spalte „Du“ füllt sich aus dem Charakter, der dem Benutzer zugewiesen ist; die
Spielleitung bekommt sie nicht, weil sie sonst willkürlich einen von allen
auswählen müsste.

Nichts davon ist ein Geheimnis: Wer sich für die Nachhut gemeldet hat, wird am
Tisch laut gesagt, und ein Fertigkeitsmodifikator steht auf einem Bogen, den
sein Besitzer ohnehin lesen darf. Das Tempo-Malus gehört sogar ausdrücklich
**vor** den Wurf — es hinterher im Bericht zu erklären ist zu spät.

### Was ein Spieler nicht sieht

Der **Tagesbericht**: die Ereignisse, die Folgen, die Kampfgrößen, das Logbuch,
die Würfe. Und zwar nicht nur ausgeblendet — das alles wird ihm **gar nicht
erst übermittelt**. Ein `{{#if gm}}` im Template hätte jedes Wort trotzdem in
seinen Browser geliefert, wo die Konsole es jedem zeigt, der nachsieht. Ein
Test prüft genau das: kein Ereignistext taucht im Kontextobjekt oder im
gerenderten Markup eines Spielers auf.

Auch die **Bedienung** bleibt bei der Spielleitung: Reiseart, Tempo, Tag
weiterschalten, auswerten, anwenden. Ein Spieler bekommt sie nicht ausgegraut
zu sehen, sondern gar nicht — acht tote Knöpfe wären keine Information, sondern
sähen kaputt aus.

### Zwei Schalter, wenn du es anders willst

**„Spieler dürfen selbst würfeln"** (Vorgabe: aus) gibt ihnen die Rollenliste
zurück: Jeder trägt sich selbst in eine Rolle ein und würfelt seinen eigenen
Charakter — auf **seinem** Client, damit seine Würfel, seine Module und seine
Vorteils-Tastenkürzel greifen. Der Tagesbericht bleibt trotzdem bei dir; das
sind zwei getrennte Fragen.

Dieser Schalter ist eine **Rechtefrage und wird auf SL-Seite geprüft**, nicht
nur im Fenster versteckt. Eine Socket-Nachricht sind bloß Daten, und emittieren
kann sie jeder — deshalb lehnt die Gegenseite sie ab, und ein Test schickt die
Nachricht von Hand vorbei, um das zu belegen.

**„Tagesbericht mit Spielern teilen"** (Vorgabe: aus) öffnet Bericht *und*
Logbuch für alle und schickt die Chatzusammenfassung an den ganzen Tisch statt
nur an dich.

---

## Bereit für morgen

**Jeder Spieler hat einen Knopf: „Bereit".** Damit sagt sein Charakter, dass er
mit dem Tag durch ist. Im Fenster steht dann für alle sichtbar, wer schon
eingecheckt hat und **auf wen noch gewartet wird** — namentlich, nicht als
„2/4", denn „wir warten auf Brombert" kann man beantworten, eine Zahl nicht.

Der Knopf ist ein **Umschalter**: Wer ihn gedrückt hat und dann doch noch das
Lager durchsuchen will, nimmt ihn selbst wieder zurück. Die SL darf ihn für
jeden drücken — irgendwer muss für den Spieler antworten können, der sich
mitten im Dschungel ausgeloggt hat.

Er liegt bewusst **nicht** hinter „Spieler dürfen selbst würfeln". Dieser
Schalter entscheidet, ob Spieler das *Werkzeug* bedienen; „ich bin fertig" ist
eine Aussage über den eigenen Charakter, die die SL sonst laut abfragen müsste.
Damit ist es die eine Bedienung, die ein Spieler immer hat — auch bei einem
Tisch, der den Tracker sonst rein SL-seitig fährt.

> **Warum ein Knopf und nicht die lange Rast?** Früher hing das Tagesende an
> einer langen Rast mit „neuer Tag". Für einen Tisch, dessen Hausregel lange
> Rasten in der Wildnis verbietet, kam die nie zustande — der Automatismus
> konnte bei euch schlicht nicht auslösen. Eine lange Rast zählt weiterhin
> mit, für Tische, die sie nehmen; sie ist nur nicht mehr der einzige Weg.

Eingeschaltet über die Weltoption **„Tag automatisch weiterzählen, wenn alle
bereit sind"** (Vorgabe: aus). Was dann passiert:

| Lage | Ergebnis |
|---|---|
| Der Tag war **ausgewertet** | Der Tag wird richtig abgeschlossen: Folgen angewandt, Bericht in den Chat, Logbucheintrag, Zähler weiter. Also genau das, was der Knopf tut. |
| Es wurde **gewürfelt, aber nicht ausgewertet** | Nur der Zähler springt weiter. Es wird kein Bericht erfunden, den niemand angefordert hat. |
| Am Tag wurde **noch gar nicht gereist** | Nichts. Siehe unten. |

**Der Zähler springt nie doppelt.** Wer den Tag selbst über „Tag abschließen"
beendet, landet auf einem frischen Tag ohne Würfe und ohne Bericht. Legt sich
die Gruppe danach schlafen, würde ein naiver Automatismus den Tag ein zweites
Mal weiterzählen. Deshalb zählt er nur weiter, wenn am laufenden Tag tatsächlich
gereist wurde — also ein Bericht oder mindestens ein Wurf vorliegt.

Auf dem zweiten Weg — der langen Rast — zählt ausschließlich eine **lange** Rast
mit gesetztem **„neuer Tag"**. Eine kurze Rast ist eine Verschnaufpause, und
eine lange Rast ohne das Häkchen ist die Gruppe, die sich am selben Nachmittag
von einem Kampf erholt; beides ist keine Aussage, dass der Reisetag vorbei ist.
Auch Aktoren außerhalb der Reisegruppe zählen nicht mit: Das schlafende
Haustier eines Spielers in der Stadt bewegt euren Reisetag nicht.

Auch mit ausgeschaltetem Automatismus bekommst du eine Meldung, sobald alle
bereit sind — das kostet nichts und ist für sich schon nützlich.

---

## Was der Tag jedem einzelnen gekostet hat

Der Bericht listet **jeden Reisenden**, auch die, denen nichts passiert ist:

```
Akk Akk:   kein Effekt                    · kurze Rast möglich
Brombert:  +1 Erschöpfung                 · keine Rast
Maleth:    abgewehrt  KON 18/13           · kurze Rast möglich
```

Ein Name, der einfach fehlt, liest sich als vergessen und nicht als verschont —
und die zweite Hälfte jeder Zeile ist für eine Gruppe ohne lange Rasten die
wichtigste Zeile im ganzen Bericht.

### Was der Feldscher heute getan hat

Darüber steht eine Zeile pro **pflegender Rolle** — auch dann, wenn sie nichts
zu tun hatte:

```
Feldscher     · nimmt Pyroth 1 Grad Erschöpfung ab.
Lagermeister  · niemand war erschöpft — nichts zu tun.
```

Der Feldscher braucht **beides**: eine gelungene Probe *und* jemanden, der
überhaupt erschöpft ist. Gemessen über 2400 Tage ist das an 18 % der Tage der
Fall — an den anderen 82 % sagte der Bericht schlicht gar nichts, und eine
Rolle, die auf einem guten Tag schweigt, ist von einer kaputten Rolle nicht zu
unterscheiden. Vier Ausgänge werden jetzt benannt: *hat geholfen*, *niemand war
erschöpft*, *Probe misslungen*, *unbesetzt*.

**„Abgewehrt" ist nicht „kein Effekt".** Ein gelungener Rettungswurf hebt das
Ereignis **ganz** auf — kein halber Schaden, keine Erschöpfung: Das sind Tage
und keine Feuerbälle, der Wurf fragt „hat es dich erwischt". Ein Kamadan, der
2W6 und einen Grad Erschöpfung im Kasten stehen hat und trotzdem niemanden
etwas kostet, ist deshalb kein Fehler — es hat der eine Getroffene seinen Wurf
geschafft. Weil genau das aussieht, als hätte die Auswertung nichts getan,
steht es jetzt als eigener Zustand da, mit dem Wurf daneben.

**Ein Lagerereignis, das durchkommt, kostet die Nachtruhe.** Keine kurze Rast,
keine Trefferwürfel. Genau das hat die Beschreibung des Lagermeisters immer
versprochen („eine Nacht, die nicht als Rast zählt") — bis jetzt machte es
nichts davon wahr. Wer seinen Rettungswurf schafft, hat das Ereignis abgewehrt
und behält damit auch seine Nacht.

> Der **Anwenden**-Knopf erscheint nur noch, wenn es tatsächlich etwas zu
> schreiben gibt. Vorher stand er auch an einem Tag da, an dem niemand etwas
> abbekommen hatte — ein Knopf, der nichts tut, erzieht dazu, ihm nicht zu
> trauen.

---

## Die Grung und euer Grung

Wenn eine Gruppe einen Grung dabei hat, sollte ein Dschungel voller Grung das
merken. Eine Patrouille, die euren froschblütigen Späher ignoriert, hätte auch
irgendetwas anderes sein können; eine, die auf ihn zeigt und lacht, ist eine
Szene.

Trage dazu unter **Weltoptionen → „Der Grung in der Gruppe"** seinen Namen ein
(Name, ID oder UUID gehen alle). Ab dann sind vier zusätzliche Ereignisse im
Spiel, die es **nur mit ihm** gibt:

| Ereignis | Was passiert | Antwort | Wenn er nichts zu sagen hat |
|---|---|---|---|
| **Spott** | Eine Patrouille zeigt auf ihn und ahmt seinen Gang nach | Überzeugen SG 12 | Erst Feigen, dann Steine — 1W4, nur auf ihn |
| **Wegzoll** | Sechs Grung an einer Furt verhandeln mit *ihm*, nicht mit euch | Täuschen SG 13 | Umweg durch den Sumpf, 1 Erschöpfung für alle |
| **Der falsche Name** | Jemand ruft aus dem Unterholz einen Namen, der nicht seiner ist | Auftreten SG 13 | Der Rufer bleibt den ganzen Tag in Hörweite |
| **Ein Käfer** | Ein sehr kleiner, sehr blauer Grung bringt ihm ein Geschenk | — | — (ein guter Tag) |

**Die Antwort ist ein Rettungswurf mit Worten.** Ein normales Ereignis lässt
jeden einzeln würfeln; ein Sippen-Ereignis lässt **einen** würfeln — den, um
den es geht — und ein Erfolg wendet es für die **ganze Gruppe** ab. Die Probe
läuft über sein Blatt, durch das System, ohne Chatkarte; die Zahl steht im
Bericht neben dem Ereignis, damit am Tisch nicht „er hat sie rumgekriegt" steht,
sondern „Überzeugen 23/12".

Der Wurf entscheidet außerdem, **welche Hälfte des Textes vorgelesen wird** —
deshalb hat auch das Ereignis ohne mechanische Kosten eine Probe. Die Geschichte
ist der Punkt:

> Acht Augen im Blattwerk, vier Speerspitzen — und dann Gelächter. Sie zeigen
> auf Akk Akk, quaken etwas Kurzes, Boshaftes, und einer ahmt seinen Gang nach.
> Was genau gesagt wurde, versteht am Lagerfeuer nur einer. Und der darf
> zurückquaken.
> **Was Akk Akk zurückruft, sitzt.** Einen Herzschlag lang ist es still im
> Blattwerk — dann kippt die halbe Patrouille vor Lachen fast von den Ästen und
> zieht nach Norden ab. Zwei von ihnen üben den Gang noch stundenlang.

**Ohne Eintrag existieren diese Ereignisse nicht.** Sie werden nicht seltener
gezogen oder allgemeiner formuliert — sie kommen gar nicht erst in den Topf,
denn eine Patrouille, die einen der Ihren erkennt, ergibt in einer Gruppe ohne
Grung keinen Sinn. `verify` prüft dabei, dass jedes Sippen-Ereignis den Namen
auch wirklich nennt und dass jede Antwort **beide** Enden hat: Ein fehlendes
Ende fällt sonst genau bei dem Wurf auf, den niemand getestet hat — mitten im
Vorlesen.

Das Ganze hängt an einem allgemeinen `kin`-Feld, nicht an einer
Grung-Sonderbehandlung. Eine zweite Sippe wäre eine Zeile in `KIN` plus ihre
Texte.

---

## Würfel und Tempo am Tisch

Wenn *Dice So Nice* läuft, ist jede Chatkarte mit einem Wurf ein Satz Würfel,
der physisch über den Bildschirm rollt. Das kostet Bilder pro Sekunde, und vor
allem: die Animationen **reihen sich aneinander**, während der Sammelwurf jede
einzelne abwartet. Aus einem Reisetag wurde so eine halbe Minute Zuschauen.

Deshalb erzeugt das Modul für alles, was es selbst im Hintergrund würfelt,
**gar keine Chatnachricht** — ohne Nachricht gibt es keinen
`createChatMessage`-Hook, und ohne Hook hat Dice So Nice nichts zu animieren:

- **Sammelwürfe** („Tag würfeln & auswerten", „Alles würfeln") — grundsätzlich,
  nicht als Einstellung. Sechs Proben sind sofort fertig.
- **Rettungswürfe** der Auswertung. Laufen weiter durch die dnd5e-Mechanik, also
  greifen alle Boni und Effekte; nur die Karte entfällt. Die Zahlen stehen im
  Bericht bei den Folgen als `KON 14/12`.
- **Wetter-, Begegnungs- und Schadenswürfe** waren nie Chatkarten.

**Verloren geht dabei nichts.** Die Ergebnisse stehen sofort in der Rollenliste,
und beim Tagesabschluss gehen sie gesammelt in **eine** Chatnachricht — als
Text, nicht als Würfe. Sie dort wieder als Roll-Objekte einzusetzen würde die
Würfel im letzten Schritt zurück auf den Bildschirm holen.

Was bleibt, ist der **Einzelwurf aus einer Zeile** — der eine, den ein Tisch
tatsächlich landen sehen will. Den steuert die Weltoption *„Einzelwürfe in den
Chat schreiben"*; ausgeschaltet ist dann wirklich alles still.

### Vorteil und Nachteil

Sammelwürfe fragen auch nicht mehr nach *normal / Vorteil / Nachteil*. Sechsmal
dieselbe Auswahl zu klicken sind nicht sechs Entscheidungen. Ein Einzelwurf
fragt weiterhin, denn das **ist** eine.

Verloren geht dadurch nichts: Foundrys eigene Tastenkürzel greifen weiterhin,
und Module, die Vorteil aus dem Zustand des Charakters ableiten — **Midi QoL**
zum Beispiel — hängen an derselben dnd5e-Pipeline, durch die diese Würfe ohnehin
laufen. Eine Integration braucht es dafür nicht, und eine Abhängigkeit ist es
ausdrücklich nicht.


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
| Begegnungswahrscheinlichkeit | 28 % |
| Schadensstärke (%) | **100** |

### Reisende
| Option | Vorgabe |
|---|---|
| Quelle der Reisenden | Alle Charaktere mit Spielerbesitz |
| Gruppen-Aktor | — |


### Kämpfe und Sichtbarkeit
| Option | Vorgabe |
|---|---|
| Gruppenstufe | 0 = aus den Bögen errechnen |
| Tagesbericht mit Spielern teilen | **aus** |
| Spieler dürfen selbst würfeln | **aus** |

### Automatik
| Option | Vorgabe |
|---|---|
| Tag automatisch weiterzählen, wenn alle bereit sind | **aus** |
| Würfe in den Chat schreiben | an |

### Folgen
| Option | Vorgabe |
|---|---|
| Folgen auf die Charakterbögen schreiben | an |
| Rettungswürfe automatisch würfeln | an |

### Eigene Rollen
| Option | Vorgabe |
|---|---|
| Eigene Rollen (JSON) | leer |

### Sippe
| Option | Vorgabe |
|---|---|
| Der Grung in der Gruppe | leer |

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
| `await api.resolveDay()` | SL | Tag auswerten. Schreibt **nichts** auf Bögen. |
| `api.clearReport()` | SL | Auswertung verwerfen. |
| `api.completeDay()` | SL | Protokollieren und weiterzählen. Wendet **keine** Folgen an — das tut der Knopf im Fenster. |
| `api.getState()` | alle | Der komplette Zustand. |
| `api.getRoles()` | alle | Die effektive Rollenliste. |
| `api.partyActors()` | alle | Wer als reisend gilt. |
| `api.modifierFor(actor, role)` | alle | Modifikator vom Bogen. |
| `api.worstExhaustion()` | alle | Höchster Erschöpfungsgrad in der Gruppe. |
| `api.allReady()` | alle | Ob alle Reisenden bereit für morgen sind. |
| `api.notReady()` | alle | Auf wen noch gewartet wird. |
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
- **Spieleraktionen sind standardmäßig abgeschaltet** und werden auf SL-Seite
  abgelehnt, nicht nur im Fenster ausgeblendet.
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
npm test             # Mondmathematik + ~740 Integrationstests
npm run check        # beides
npm run build:packs  # packs/_source/*.json -> LevelDB-Kompendium
```

`npm run verify` prüft, was `node --check` nicht sehen kann und was jeweils schon
einmal etwas kaputtgemacht hat: Import-Zyklen, Templates mit mehr oder weniger
als genau einem Wurzelelement, `data-action`s ohne Handler, i18n-Schlüssel, die
gleichzeitig Blatt und Zweig sind, Sprachdateien mit unterschiedlichen
Schlüsselmengen, eine fehlende Tabelle für die Rückfallsprache, Manifest-Pfade
ins Leere — und, weil die Ereignistabelle der
eigentliche Inhalt dieses Moduls ist, **dass jedes Ereignis in jeder Sprache
einen Namen und einen Text hat** und keine verwaisten Texte herumliegen.

`npm test` fährt einen minimalen Foundry-Ersatz hoch
(`tools/test/foundry-shim.mjs`) und prüft damit Zustandsübergänge, die
Hex-Regeln, Reisearten, Wetter, die Rollentafel, Rechtetrennung, die
XP-Arithmetik und das gerenderte Template. Darunter ein Lauf über 60 Seetage,
der prüft, dass **kein einziges Landereignis** je in den Seepool leckt, und
einer, der eine Spieler-Socket-Nachricht von Hand an die SL-Seite schickt, um zu
belegen, dass die Ablehnung dort und nicht bloß im Fenster passiert. Darunter ausdrücklich, dass **kein Ereignistext im
Spieler-Kontext auftaucht** — nicht im Kontextobjekt, nicht im gerenderten
Markup.

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
| `scripts/encounters.mjs` | XP-Budgets, Kampfgrößen für schwer und tödlich |
| `scripts/resolve.mjs` | **Die Tagesmaschine** — Wetter + Würfe → Hex, Ereignisse, Folgen |
| `scripts/consequences.mjs` | Schreibt Schaden und Erschöpfung auf die Bögen |
| `scripts/rest.mjs` | „Bereit für morgen“ und das Tagesende, mit Schutz vor Doppelsprung |
| `scripts/socket.mjs` | Spieleraktionen → SL |
| `scripts/app.mjs` | Das Fenster (ApplicationV2) |
| `scripts/module.mjs` | Hooks, Scene Controls, API |

`resolve.mjs` und `consequences.mjs` sind bewusst getrennt: Das eine würfelt und
baut einen Bericht, das andere ist der unumkehrbare Teil. Genau deshalb ist
„Neu auswerten“ gefahrlos.

---

## Lizenz

Siehe [LICENSE](LICENSE).
