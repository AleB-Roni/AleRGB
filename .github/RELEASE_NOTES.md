## AleRGB 1.3.0 – GIF-Browser & Kraken-Fix

### Neu: GIF-Browser
Auf der Seite **NZXT Kraken** findest du den Button **„GIF-Browser“**.
- **GIPHY-Suche:** Trends und eine Suche nach Stichwörtern (deutsch und englisch). Mit „Mehr laden“ kommen weitere Ergebnisse dazu. Ein Klick auf ein GIF lädt es direkt in die Display-Vorschau.
- **Link einfügen:** Funktioniert mit GIPHY- und Tenor-Seitenlinks, Imgur-Links (`.gifv`) und jedem direkten `.gif`-Link. AleRGB findet das GIF auf der Seite selbst.
- Für die Suche brauchst du einmalig einen **kostenlosen GIPHY-API-Schlüssel**. Die App erklärt, wie du ihn bekommst. Das Laden per Link geht auch ohne Schlüssel.

### Behoben: „Keine Antwort vom Gerät“ (NZXT Kraken)
Die Kraken sendet von sich aus zwei Status-Meldungen pro Sekunde. AleRGB hat davon nur einen Teil gelesen, der Rest staute sich im Windows-Puffer. Irgendwann fand AleRGB die eigentliche Antwort nicht mehr. Jetzt wird der Puffer vor jedem Befehl geleert, und AleRGB wartet zeitbasiert auf die passende Antwort.

### Installation
**`AleRGB-Setup-1.3.0.exe`** herunterladen und ausführen. Die Installation aktualisiert eine vorhandene Version.
> Windows SmartScreen warnt, weil das Programm nicht signiert ist: **Weitere Informationen → Trotzdem ausführen**.
