# AleRGB

Eine RGB-Steuerung für Windows mit moderner Oberfläche. Sie steuert die Beleuchtung aller Hersteller gemeinsam auf einer Leinwand (ähnlich wie SignalRGB).

## Installation

1. Unter [Releases](https://github.com/AleB-Roni/AleRGB/releases) die Datei **`AleRGB-Setup-1.0.0.exe`** herunterladen.
2. Ausführen. Admin-Rechte sind nicht nötig, der Installationsordner ist frei wählbar, und Desktop- und Startmenü-Verknüpfungen werden angelegt.
3. Windows SmartScreen meldet „Der Computer wurde durch Windows geschützt“, weil das Programm nicht signiert ist. Auf **Weitere Informationen → Trotzdem ausführen** klicken.

Deinstallieren geht über *Windows-Einstellungen → Apps*. Deine Effekte und Einstellungen bleiben dabei in `%APPDATA%\alergb` erhalten.

## Aus dem Quellcode starten

Node.js 20+ installieren:

```bash
npm install
```

```bash
npm start
```

Mit `npm run demo` startet die App mit virtuellen Demo-Geräten. `npm run dist` baut den Installer `dist/AleRGB-Setup-<version>.exe`.

## Funktionen

| Bereich | Was es kann |
|---|---|
| **Geräte** | Alle Geräte mit Live-LED-Vorschau, Ein/Aus, Helligkeit pro Gerät, „Identifizieren“ (blinkt weiß), eigene Farbe oder eigener Effekt pro Gerät |
| **Effekte** | 22 eingebaute Effekte (u. a. Polarlicht, Feuer, Plasma, Matrix-Regen, Herzschlag), Audio-Effekte (Spektrum, Bass-Puls), Bildschirm-Ambilight, CPU/RAM-Monitor, dazu 4 Canvas-Effekte (Lavalampe, Synthwave, Neon-Tunnel, Kometen) |
| **Effekt-Studio** | **Ebenen-Baukasten** ohne Code (Effekte stapeln, 7 Mischmodi, Deckkraft, Bereichsmasken) und **Code-Editor** für HTML/JS-Canvas-Effekte mit Vorlagen und Live-Vorschau |
| **Import** | `.html`-Effekte aus dem Netz per Datei, Drag & Drop oder URL (GitHub-Links werden automatisch umgewandelt), Export und Teilen eigener Effekte |
| **Layout** | Geräte per Drag & Drop auf der 16:9-Leinwand anordnen, damit Effekte realistisch über den Schreibtisch laufen |
| **Profile** | Effekt, Layout und Helligkeit speichern und per Tray-Menü oder Hotkey wechseln |
| **Automatik** | Autostart, Tray-Betrieb, Licht aus bei Sperre/Standby/Beenden, globale Hotkeys |
| **Diagnose** | Erkennt RGB-Hardware über die USB-Hersteller-ID und störende RGB-Software und gibt konkrete Tipps |

### Hotkeys
`Strg+Alt+L` Licht an/aus · `Strg+Alt+←/→` Profil wechseln · `Strg+Alt+↑/↓` Helligkeit

## Treiber

| Treiber | Deckt ab | Voraussetzung |
|---|---|---|
| **OpenRGB** | Mainboards (ASUS Aura, MSI Mystic Light, Gigabyte RGB Fusion, ASRock), RAM, GPUs, ARGB-Controller und Hunderte Peripheriegeräte | OpenRGB mit gestartetem SDK-Server (Port 6742) |
| **Razer Chroma** | Alle Chroma-Geräte und Chroma-Link | Razer Synapse mit Chroma Connect |
| **Corsair iCUE** | Alle iCUE-Geräte inkl. Lüfter, Commander und RAM | iCUE mit aktiviertem SDK und `iCUESDK.x64_2019.dll` im Ordner `sdk` |
| **Logitech G HUB** | Tastaturen (pro Taste), Mäuse, Headsets, Mauspads und Lautsprecher | G HUB mit erlaubter App-Steuerung |
| **SteelSeries GG** | Tastaturen (pro Taste), Mäuse und Headsets | SteelSeries GG |
| **WLED** | ESP-LED-Controller | Wird automatisch gefunden (mDNS) |
| **Philips Hue** | Farblampen über die Bridge | Bridge per Knopfdruck koppeln |
| **Nanoleaf** | Shapes, Canvas, Elements, Lines und Light Panels (jedes Panel einzeln) | Koppeln über den Power-Knopf |
| **Govee** | LAN-fähige Strips und Lampen | „LAN Control“ in der Govee-App aktivieren |
| **Yeelight** | Farblampen und Strips | „LAN-Steuerung“ in der Yeelight-App aktivieren |

## Eigene Effekte

**Ebenen-Baukasten:** Im Effekt-Studio Effekte übereinanderlegen. Ein Beispiel: „Sternenhimmel“ mit dem Mischmodus *Addieren* über „Polarlicht“.

**Canvas-Effekte (HTML):** Eine HTML-Datei, die auf `<canvas id="exCanvas" width="320" height="200">` zeichnet. AleRGB tastet das Bild ab und überträgt es auf deine Geräte.

```html
<head>
  <title>Mein Effekt</title>
  <meta description="Beschreibung">
  <meta property="speed" label="Geschwindigkeit" type="number" min="1" max="10" default="5">
  <meta property="farbe" label="Farbe" type="color" default="#ff0000">
  <meta property="modus" label="Modus" type="combobox" values="A,B" default="A">
  <meta property="an" label="Schalter" type="boolean" default="1">
</head>
<body><canvas id="exCanvas" width="320" height="200"></canvas>
<script>/* speed, farbe, modus, an sind globale Variablen */</script></body>
```

- Jede `<meta property>` wird in der App zu einer Einstellung und im Skript zu einer globalen Variable.
- Bei jeder Änderung wird `on<name>Changed()` aufgerufen.
- Audio steht in `engine.audio.freq` (200 Werte, 0–255), `engine.audio.level` (dB) und `engine.audio.density` zur Verfügung, zusätzlich in `engine.audio.bands` und `engine.audio.bass` (jeweils 0–1).

Viele Community-Effekte im Netz nutzen dieses Format, zum Beispiel die Lightscripts für SignalRGB. Solche Effekte lassen sich direkt importieren. Die Grenzen dabei:
- Effekte, die nur auf den Canvas zeichnen, funktionieren in der Regel.
- Effekte mit herstellerspezifischen APIs (z. B. Bildschirmerfassung über `engine.vision`, Spielintegrationen, Bilder von fremden Servern) funktionieren nicht oder nur teilweise.
- Die Audiowerte sind an das Format angenähert, die Skalierung kann etwas abweichen.

Die Effekte werden unter `%APPDATA%\alergb\effects` gespeichert.

## Damit wirklich alle Geräte gefunden werden

1. **Pro Gerät nur eine Software.** Zwei Programme, die dasselbe Gerät ansteuern, führen zu Flackern. Für jeden Hersteller gilt eine der beiden Varianten:
   - Herstellersoftware **plus** SDK-Treiber in AleRGB (iCUE, Synapse, G HUB, GG), *oder*
   - Herstellersoftware beenden bzw. deinstallieren und das Gerät über **OpenRGB** steuern.
2. **OpenRGB für Mainboard, RAM und GPU.** Diese Komponenten hängen am SMBus statt an USB.
   - Aktuelles OpenRGB installieren und den angebotenen Treiber **PawnIO** mitinstallieren.
   - OpenRGB beim ersten Mal **als Administrator** starten.
   - In OpenRGB unter *Settings* „Start at login“, „Start server“ und „Start minimized“ aktivieren.
3. **Armoury Crate / Aura und MSI Center entfernen**, wenn OpenRGB das Mainboard oder den RAM steuern soll. Der „LightingService“ blockiert den SMBus. Am saubersten geht das mit dem *Armoury Crate Uninstall Tool* von ASUS.
4. **ARGB-Header konfigurieren.** Bei adressierbaren Headern in OpenRGB unter „Resize“ die tatsächliche LED-Anzahl eintragen. Sonst bleiben die Zonen bei 0 LEDs, und die Diagnose in AleRGB weist darauf hin.
5. **Firmware aktualisieren.** Das gilt für Mainboard-BIOS, Peripherie (über die Herstellersoftware) und den Corsair Commander.
6. **USB direkt am Mainboard.** Passive Hubs und Frontpanel-Ports führen manchmal zu Verbindungsabbrüchen.
7. **Netzwerkgeräte.** PC und Lampen müssen im selben Netz sein. In der Windows-Firewall „Privates Netzwerk“ für AleRGB erlauben, sonst funktionieren Discovery bzw. Multicast nicht.
8. **Den Kompatibilitäts-Check** in der App nutzen. Er zeigt erkannte Hersteller, die passende Treiber-Route und Konflikte.
9. **Nicht unterstützte Geräte:** in der [OpenRGB-Geräteliste](https://openrgb.org/devices.html) prüfen. Fehlt ein Gerät dort, kann man in OpenRGB unter *Settings → Supported Devices* die USB-IDs auslesen und dem Projekt melden.

## Projektstruktur

```
src/main/          Main-Prozess: Engine, Geräteverwaltung, Treiber, Diagnose
src/main/drivers/  Ein Treiber pro Datei (Driver/Device-Basisklassen in base.js)
src/shared/        Effekt-Bibliothek (wird von Engine und UI genutzt)
src/renderer/      Oberfläche (ohne Framework)
assets/effects/    Mitgelieferte Canvas-Effekte
sdk/               Optionale Hersteller-DLLs
```

Für einen neuen Treiber genügt eine Klasse mit `static meta`, `start()` und `stop()`. Sie wird in `src/main/drivers/index.js` eingetragen und legt `Device`-Objekte mit `write(colors)` an.
