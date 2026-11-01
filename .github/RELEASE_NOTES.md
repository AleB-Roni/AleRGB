## AleRGB 1.0.0 – erste Version

Universelle RGB-Steuerung für Windows: Alle Geräte über alle Hersteller hinweg synchron auf einer gemeinsamen Leinwand.

### Installation
**`AleRGB-Setup-1.0.0.exe`** herunterladen und ausführen. Admin-Rechte sind nicht nötig, Desktop- und Startmenü-Verknüpfungen werden angelegt.
> Windows SmartScreen warnt, weil das Programm nicht signiert ist: **Weitere Informationen → Trotzdem ausführen**.

### Enthalten
- **Treiber:** OpenRGB (Mainboards, RAM, GPUs, ARGB und Hunderte Peripheriegeräte), Razer Chroma, Corsair iCUE, Logitech G HUB, SteelSeries GG, WLED, Philips Hue, Nanoleaf, Govee (LAN) und Yeelight
- **26 Effekte**, darunter Musik-reaktive Effekte, Bildschirm-Ambilight und ein CPU/RAM-Monitor
- **Effekt-Studio:** Ebenen-Baukasten ohne Code und ein Code-Editor für HTML-Canvas-Effekte
- **Import** von Community-Effekten im HTML-Canvas-Format (Datei, Drag & Drop oder URL)
- **Weitere Funktionen:** Layout-Editor, Profile, Tray-Betrieb, Hotkeys, Autostart und automatisches Abschalten bei Sperre oder Standby
- **Kompatibilitäts-Check:** erkennt RGB-Hardware und Konflikte mit anderer RGB-Software

### Hinweise
- Corsair iCUE braucht zusätzlich `iCUESDK.x64_2019.dll` aus dem offiziellen [cue-sdk](https://github.com/CorsairOfficial/cue-sdk/releases) im Ordner `resources\sdk` der Installation.
- Die Herstellertreiber sind gegen die offiziellen Schnittstellen geschrieben, aber noch nicht mit jeder Hardware getestet. Fehler bitte als Issue melden und das Ergebnis des Kompatibilitäts-Checks anhängen.
