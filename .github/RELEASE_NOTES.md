## AleRGB 1.1.0 – Nollie-Unterstützung

### Neu
- **Direkter Treiber für Nollie ARGB-Controller.** Unterstützt werden Nollie 8, Nollie 8 v2, Nollie 8 OS2, Prism 8 und Nollie 1. Der Controller wird direkt per USB angesteuert, OpenRGB, SignalRGB oder die Nollie-Software sind dafür nicht nötig.
  - Jeder Kanal erscheint als eigenes Gerät im Layout. So kannst du Front-Lüfter, Heck-Lüfter und Strips einzeln platzieren.
  - Unter *Integrationen → Nollie ARGB → Einstellungen & Hilfe* gibst du pro Kanal Name, Art (Lüfter-Ring oder LED-Strip), LED-Anzahl und die Anzahl der Lüfter in Reihe an.
  - Der Kompatibilitäts-Check erkennt Nollie-Controller und warnt, wenn OpenRGB den Controller gleichzeitig ansteuert.
- **Neuer Status „Kein Gerät“:** Ein Treiber ohne angeschlossenes Gerät zeigt keinen grünen „Verbunden“-Status mehr.

### Installation
**`AleRGB-Setup-1.1.0.exe`** herunterladen und ausführen. Die Installation aktualisiert eine vorhandene Version, deine Einstellungen bleiben erhalten.
> Windows SmartScreen warnt, weil das Programm nicht signiert ist: **Weitere Informationen → Trotzdem ausführen**.

### Nollie einrichten
1. SignalRGB, die Nollie-Software und gegebenenfalls OpenRGB beenden, damit nur ein Programm den Controller ansteuert.
2. In AleRGB unter *Integrationen → Nollie ARGB* pro Kanal die LED-Anzahl eintragen und auf **Speichern** klicken.
3. Unter *Layout* die Kanäle an die richtige Stelle ziehen.
