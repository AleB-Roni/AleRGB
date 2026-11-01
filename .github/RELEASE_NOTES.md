## AleRGB 1.2.1 – Kraken-Verbindung repariert

### Behoben
- **„Keine Antwort vom Gerät“ bei NZXT Kraken.** Windows meldet die Kraken oft mit mehreren USB-Schnittstellen, und AleRGB hat bisher nur die erste ausprobiert. Jetzt testet AleRGB alle Schnittstellen in beiden Übertragungsarten (mit und ohne Report-ID) und nimmt die, die antwortet.
- Antwortet die Kraken im laufenden Betrieb dreimal nicht, verbindet AleRGB sich automatisch neu.
- Schlägt die Verbindung fehl, wartet AleRGB 15 Sekunden bis zum nächsten Versuch, statt es alle 2 Sekunden erneut zu probieren.

### Neu
- **Diagnose auf der Kraken-Seite:** Die Tabelle zeigt alle gefundenen USB-Schnittstellen und wie jede reagiert hat. Mit **„Diagnose kopieren“** kannst du die Daten weitergeben, wenn es weiterhin Probleme gibt.
- Ein Button **„Erneut verbinden“**.

### Installation
**`AleRGB-Setup-1.2.1.exe`** herunterladen und ausführen. Die Installation aktualisiert eine vorhandene Version.
> Windows SmartScreen warnt, weil das Programm nicht signiert ist: **Weitere Informationen → Trotzdem ausführen**.
