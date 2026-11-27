## AleRGB 1.5.0 – Lüftersteuerung

### Neu: Seite „Lüfter“
Die Lüfter am **Mainboard** (CPU_FAN, SYS_FAN, CHA_FAN …) lassen sich jetzt in AleRGB regeln. Der Nollie 8 steuert nur das Licht. Die Drehzahl kommt über das PWM-Kabel vom Mainboard.

- **Pro Lüfter wählbar:** *BIOS* (wie bisher), *Fest* (fester Prozentwert) oder *Kurve*.
- **Kurveneditor:** Die Punkte ziehst du mit der Maus. Die aktuelle Temperatur wird als Linie angezeigt. Vorlagen: Leise, Ausgewogen, Leistung.
- **Temperatur-Quelle frei wählbar:** CPU, Grafikkarte, Mainboard-Sensoren oder die **Wassertemperatur deiner Kraken**.
- **Live-Werte:** Drehzahl und Leistung jedes Lüfters, dazu CPU-, GPU- und Wassertemperatur.
- Lüfter lassen sich **umbenennen**, z. B. „Front unten“ oder „Heck“.

### Sicherheit
- Kein Lüfter fällt unter 20 %, außer du erlaubst 0 % ausdrücklich.
- **Notlauf:** Ab CPU 90 °C, GPU 88 °C oder Wasser 50 °C laufen alle gesteuerten Lüfter mit 100 %.
- Wird AleRGB beendet, stürzt ab oder meldet sich 10 Sekunden nicht, übernimmt **automatisch wieder das BIOS**.
- Bei ungültigen Werten gilt immer: lieber kühlen als stoppen.

### Einrichtung (einmalig)
1. Den **PawnIO-Treiber** von [pawnio.eu](https://pawnio.eu/) installieren. Er ist signiert und Open Source und wird auch von OpenRGB und FanControl genutzt.
2. In AleRGB **Lüfter → „Lüftersteuerung starten“** klicken und die Windows-Adminabfrage bestätigen.

Nur ein kleines Hilfsprogramm läuft dabei mit Adminrechten. Es basiert auf [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor). AleRGB selbst bleibt ein normales Programm.

### Installation
**`AleRGB-Setup-1.5.0.exe`** herunterladen und ausführen. Die Installation aktualisiert eine vorhandene Version.
> Windows SmartScreen warnt, weil das Programm nicht signiert ist: **Weitere Informationen → Trotzdem ausführen**.
