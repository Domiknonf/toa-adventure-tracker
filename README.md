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
- [Lange Rast beendet den Tag](#lange-rast-beendet-den-tag)
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

**1. Rollen besetzen.** Du weist jedem Charakter im Fenster eine Rolle zu
(oder die Spieler tun es selbst, siehe [Was die Spieler sehen](#was-die-spieler-sehen)). Pro
Charakter genau eine — das erzwingt die Datenstruktur. Dieselbe Rolle darf
mehrfach besetzt werden, aber dann fehlt sie woanders.

Eine Gruppe von vier kann nicht acht Rollen füllen. **Welche Rollen ihr leer
lasst, ist die eigentliche Entscheidung dieses Fensters** — deshalb steht
unbesetzt direkt unter der Liste und nicht erst im Bericht.

**2. „Tag würfeln & auswerten"** — ein Knopf. Er würfelt jede noch offene
Rolle und wertet den Tag anschließend aus: Wetter, ob euch etwas findet, welches
Ereignis, die Vorräte, die fälligen Rettungswürfe. Heraus kommt der Tagesbericht
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
| **Navigator** | Überleben | 15 | Bestimmt die Tagesstrecke. Misslingt der Wurf, kommt die Gruppe keinen Schritt weit. | **schlimmer** |
| **Vorhut** | Wahrnehmung | 12 | Entscheidet, ob eine Begegnung ein Hinterhalt oder eine rechtzeitige Sichtung wird. Misslungen kostet TP. | **schlimmer** |
| **Nachhut** | Heimlichkeit | 12 | Verwischt die Spuren. Misslungen hebt die Begegnungschance um 15 Punkte und kann eine Verfolgung auslösen. | **schlimmer** |
| **Lagermeister** | Überleben | 12 | Gelungen: nimmt dem am stärksten Erschöpften **einen Grad Erschöpfung ab**. Misslungen: eine Nacht, die nicht als Rast zählt. | Misserfolg |
| **Feldscher** | Medizin | 12 | Nimmt bei Erfolg dem am stärksten erschöpften Reisenden einen Grad Erschöpfung ab. | folgenlos |
| **Kartograph** | Nachforschungen | 12 | Fängt einen misslungenen Navigationswurf auf: halbe Strecke statt null, mindestens ein Hexfeld. | folgenlos |

Dieselbe Tabelle steht **im Fenster selbst**, aufklappbar unter der Rollenliste
(„Rollen-Übersicht") — samt der Modifikatoren, die das gewählte Tempo gerade auf
die einzelnen Proben legt.

> **Der Feldscher tat lange nichts.** Seine Beschreibung versprach, er nehme
> Erschöpfung wieder ab — die Engine hatte nie von ihm gehört. Aufgefallen ist
> das erst beim Schreiben dieser Übersicht, weil die Spalte „Was sie mechanisch
> tut" leer blieb. Jetzt prüft `verify`, dass **jede** Standardrolle vom
> Resolver gelesen wird *und* eine Wirkungsbeschreibung hat.

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

Gemessen über je 300 simulierte Tage bei normalem Tempo: zu Fuß 0,70 Hexfelder
pro Tag, beritten 1,20, im Kanu 1,30, unter Segeln 2,01.

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

Gemessen über je 300 Tage zu Fuß, gleiche Gruppe, Vorhut und Nachhut besetzt:

| Tempo | Hexfelder/Tag | Schaden/Tag | Begegnungstage |
|---|:--:|:--:|:--:|
| Langsam | 0,62 | 1,1 | 6 % |
| Normal | 0,79 | 1,7 | 22 % |
| Schnell | **1,04** | **3,5** | **39 %** |

Unter Segeln dasselbe Muster: 1,37 → 2,20 → 2,74 Hexfelder bei 0,8 → 1,8 → 4,0
Schaden pro Tag.

Schnell kommt am weitesten **und** kostet dreimal so viel Blut. Das ist der
Handel.

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

Zum Vergleich, gleiche Gruppe zu Fuß, normales Tempo, **mit** Kartograph statt
Vorhut: 0,83 Hexfelder pro Tag statt 0,66 und nur 17 % verlorene Tage. Die
Rollenwahl ist der größte Hebel im ganzen System.

---

## Wetter

Wetter wird **gewürfelt, nie eingestellt.** Es gibt bewusst keinen Regenschalter:
Die ganze Vorratsrechnung ergibt nur dann etwas, wenn Trockenperioden der Gruppe
*zustoßen*. Eine SL, die jeden Morgen entscheiden müsste, ob es regnet, wird
sich — völlig zu Recht — für die Geschichte entscheiden, die sie ohnehin im Kopf
hat, und die Fässer laufen nie aus Versehen leer.

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

## Erschöpfung, wenn es keine langen Rasten gibt

Viele Tische in Chult spielen mit der Hausregel, dass **lange Rasten nur an
gesicherten Orten** möglich sind — nicht im Dschungel. Damit hat Erschöpfung
keinen Rückweg mehr, und ein Reisemodul, das sie großzügig verteilt, wird zur
Ratsche.

Das ist gemessen, nicht geschätzt. Über 200 simulierte Treks (vier Charaktere,
Stufe 6, kompetent besetzt, **ohne** lange Rasten):

| | vorher | jetzt |
|---|:--:|:--:|
| Erschöpfung netto pro Tag | 0,48 | **0,25** |
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
Absicht — und es steht in der Rollen-Übersicht im Fenster, bevor der erste Wurf
fällt.

> Spielt ihr mit normalen langen Rasten, ändert das nichts zum Schlechteren:
> Erschöpfung wird dann ohnehin zurückgesetzt, und die Erholung durch das Lager
> ist einfach ein zusätzlicher Puffer.

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

**Das Werkzeug gehört der Spielleitung.** Das Fenster, das ein Spieler öffnet,
ist ein Schaufenster — es zeigt, was die Gruppe ohnehin weiß, und hat nichts
zum Drücken.

Ein Spieler sieht:

- den **Reisetag**
- die **Mondphase** samt gezeichneter Scheibe
- **wie** die Gruppe unterwegs ist (Reiseart und Tempo, als eine Zeile Text)
- das **Wetter von heute**, sobald der Tag ausgewertet ist — darin stehen sie ja
- die **Vorräte** und wie viele Tage ohne Regen vergangen sind

Ein Spieler sieht **nicht**: die Rollenliste, die Würfe, den Tagesbericht, die
Ereignisse, die Folgen, das Logbuch, die Kampfgrößen. Und zwar nicht nur
ausgeblendet — das alles wird ihm **gar nicht erst übermittelt**. Ein `{{#if gm}}`
im Template hätte jedes Wort trotzdem in seinen Browser geliefert, wo die
Konsole es jedem zeigt, der nachsieht. Ein Test prüft genau das: kein
Ereignistext taucht im Kontextobjekt oder im gerenderten Markup eines Spielers
auf.

Das Fenster öffnet für Spieler auch schmaler, weil ihre Ansicht eine kurze
Spalte ist. Acht ausgegraute Knöpfe wären keine Information, sondern sähen
kaputt aus.

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

## Lange Rast beendet den Tag

Wenn **alle Reisenden** eine lange Rast mit „neuer Tag" gemacht haben, ist die
Nacht vorbei — der Zähler kann dann von selbst weiterspringen, statt auf den
Knopf zu warten.

Eingeschaltet über die Weltoption **„Tag bei langer Rast automatisch
weiterzählen"** (Vorgabe: aus). Was dann passiert:

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

Es zählt ausschließlich eine **lange** Rast mit gesetztem **„neuer Tag"**. Eine
kurze Rast ist eine Verschnaufpause, und eine lange Rast ohne das Häkchen ist
die Gruppe, die sich am selben Nachmittag von einem Kampf erholt — beides
beendet keinen Reisetag. Auch Aktoren außerhalb der Reisegruppe zählen nicht
mit: Das schlafende Haustier eines Spielers in der Stadt bewegt euren Reisetag
nicht.

Im Rollen-Panel zeigt ein kleines Mondsymbol, auf wen noch gewartet wird. Auch
mit ausgeschaltetem Automatismus bekommst du eine Meldung, sobald alle gerastet
haben — das kostet nichts und ist für sich schon nützlich.

Eine lange Rast zu melden liegt bewusst **nicht** hinter „Spieler dürfen selbst
würfeln": Dass jemand gerastet hat, ist eine Tatsache über seinen eigenen
Charakterbogen und keine Handlung in diesem Werkzeug.

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
| Begegnungswahrscheinlichkeit | 20 % |

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
| Tag bei langer Rast automatisch weiterzählen | **aus** |
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
| `api.allRested()` | alle | Ob alle Reisenden ihre lange Rast gemacht haben. |
| `api.stillAwake()` | alle | Auf wen noch gewartet wird. |
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
Schlüsselmengen, Manifest-Pfade ins Leere — und, weil die Ereignistabelle der
eigentliche Inhalt dieses Moduls ist, **dass jedes Ereignis in jeder Sprache
einen Namen und einen Text hat** und keine verwaisten Texte herumliegen.

`npm test` fährt einen minimalen Foundry-Ersatz hoch
(`tools/test/foundry-shim.mjs`) und prüft damit Zustandsübergänge, die
Hex-Regeln, Reisearten, Wetter, Vorratsübertrag, Rechtetrennung, die
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
| `scripts/rest.mjs` | Lange Rast als Tagesende, mit Schutz vor Doppelsprung |
| `scripts/socket.mjs` | Spieleraktionen → SL |
| `scripts/app.mjs` | Das Fenster (ApplicationV2) |
| `scripts/module.mjs` | Hooks, Scene Controls, API |

`resolve.mjs` und `consequences.mjs` sind bewusst getrennt: Das eine würfelt und
baut einen Bericht, das andere ist der unumkehrbare Teil. Genau deshalb ist
„Neu auswerten“ gefahrlos.

---

## Lizenz

Siehe [LICENSE](LICENSE).
