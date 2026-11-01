## AleRGB 1.2.0 – NZXT Kraken

### Neu: Seite „NZXT Kraken“
Wasserkühlung und Display werden direkt per USB gesteuert, NZXT CAM ist dafür nicht nötig.

- **Eigene Bilder und GIFs aufs Pumpen-Display.** PNG, JPG, WebP, BMP und animierte GIFs werden per Dateiauswahl oder Drag & Drop geladen. Eine runde Live-Vorschau zeigt das Ergebnis, Zoom, Verschieben und Hintergrundfarbe lassen sich anpassen. Das Bild wird automatisch auf die Display-Auflösung gebracht und passend zur Einbaulage gedreht.
- **Display-Helligkeit** (0–100 %) und **Ausrichtung** (0°/90°/180°/270°).
- **Temperatur-Anzeige:** Ein Klick schaltet zurück zur Standard-Anzeige der Flüssigkeitstemperatur.
- **Pumpe und Radiator-Lüfter:** Profile *Leise*, *Ausgewogen*, *Leistung* oder eine feste Leistung, jeweils mit Kurvenansicht. Ab 59 °C laufen beide immer mit 100 %. Die Einstellungen werden beim Start automatisch wieder angewendet.
- **Live-Werte:** Flüssigkeitstemperatur, Pumpen- und Lüfterdrehzahl.

Unterstützte Modelle:
- **Kraken Z53/Z63/Z73, Kraken 2023, 2023 Elite, 2024 Elite RGB und 2024 Plus:** Display, Pumpe und Lüfter
- **Kraken X53/X63/X73:** Pumpe und Messwerte
- Die Kraken 2023 mit Firmware 2.x kann nur Standbilder anzeigen, keine GIFs.

### Einrichtung
1. **NZXT CAM beenden**, auch im Infobereich. CAM belegt die Kraken.
2. In AleRGB die Seite **NZXT Kraken** öffnen. Die Verbindung kommt automatisch zustande.
3. Kommt beim Übertragen eines Bildes die Meldung „Kein Zugriff auf die Display-Schnittstelle“: Mit [Zadig](https://zadig.akeo.ie/) unter *Options → List All Devices* die Schnittstelle „NZXT Kraken … (Interface 1/2)“ auswählen und **WinUSB** installieren. Die HID-Schnittstelle (Pumpe und Lüfter) dabei nicht ändern.

### Installation
**`AleRGB-Setup-1.2.0.exe`** herunterladen und ausführen. Die Installation aktualisiert eine vorhandene Version, deine Einstellungen bleiben erhalten.
> Windows SmartScreen warnt, weil das Programm nicht signiert ist: **Weitere Informationen → Trotzdem ausführen**.

*Protokoll nach [liquidctl](https://github.com/liquidctl/liquidctl), Display- und Bucket-Logik aus `kraken3.py`.*
