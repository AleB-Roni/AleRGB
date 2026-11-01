'use strict';
/**
 * Kompatibilitäts-Check: erkennt angeschlossene RGB-Hardware (USB-Hersteller-IDs), laufende Konflikt-Software
 * und gibt konkrete Empfehlungen, welcher Treiberweg für welches Gerät am besten ist.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const VENDORS = {
  '1B1C': { name: 'Corsair', route: 'Corsair iCUE (SDK) – oder OpenRGB ohne iCUE', drivers: ['corsair', 'openrgb'] },
  '1532': { name: 'Razer', route: 'Razer Chroma (Synapse) – oder OpenRGB ohne Synapse', drivers: ['razer', 'openrgb'] },
  '046D': { name: 'Logitech', route: 'Logitech G HUB (LED SDK) – oder OpenRGB', drivers: ['logitech', 'openrgb'] },
  '1038': { name: 'SteelSeries', route: 'SteelSeries GG (GameSense) – oder OpenRGB', drivers: ['steelseries', 'openrgb'] },
  '0951': { name: 'HyperX (Kingston)', route: 'OpenRGB', drivers: ['openrgb'] },
  '03F0': { name: 'HyperX / HP', route: 'OpenRGB', drivers: ['openrgb'] },
  '0B05': { name: 'ASUS (Aura / ROG)', route: 'OpenRGB (Armoury Crate/LightingService beenden!)', drivers: ['openrgb'] },
  '1462': { name: 'MSI (Mystic Light)', route: 'OpenRGB (MSI Center Mystic Light deaktivieren)', drivers: ['openrgb'] },
  '048D': { name: 'ITE (Gigabyte RGB Fusion / diverse Mainboards & Tastaturen)', route: 'OpenRGB', drivers: ['openrgb'] },
  '26CE': { name: 'ASRock (Polychrome)', route: 'OpenRGB', drivers: ['openrgb'] },
  '1E71': { name: 'NZXT', route: 'Kraken-Wasserkühlung: AleRGB-Seite „NZXT Kraken“ (direkt, ohne CAM). Andere NZXT-RGB-Geräte: OpenRGB. NZXT CAM jeweils beenden', drivers: ['openrgb', 'kraken'] },
  '2516': { name: 'Cooler Master', route: 'OpenRGB', drivers: ['openrgb'] },
  '1E7D': { name: 'ROCCAT / Turtle Beach', route: 'OpenRGB', drivers: ['openrgb'] },
  '10F5': { name: 'Turtle Beach', route: 'OpenRGB', drivers: ['openrgb'] },
  '31E3': { name: 'Wooting', route: 'OpenRGB', drivers: ['openrgb'] },
  '03EB': { name: 'Wooting (alt) / Atmel', route: 'OpenRGB', drivers: ['openrgb'] },
  '264A': { name: 'Thermaltake', route: 'OpenRGB', drivers: ['openrgb'] },
  '0CF2': { name: 'Lian Li (L-Connect / Uni Fan)', route: 'OpenRGB (L-Connect beenden)', drivers: ['openrgb'] },
  '3842': { name: 'EVGA', route: 'OpenRGB', drivers: ['openrgb'] },
  '258A': { name: 'Sinowealth (Glorious, diverse OEM-Mäuse/Tastaturen)', route: 'OpenRGB', drivers: ['openrgb'] },
  '320F': { name: 'Glorious / Evision', route: 'OpenRGB', drivers: ['openrgb'] },
  '04D9': { name: 'Holtek (Ducky, diverse OEM)', route: 'OpenRGB', drivers: ['openrgb'] },
  '0416': { name: 'Winbond (diverse ARGB-Controller)', route: 'OpenRGB', drivers: ['openrgb'] },
  '16D2': { name: 'Nollie (ARGB-Controller)', route: 'AleRGB-Treiber „Nollie ARGB“ – direkt, ohne Zusatzsoftware', drivers: ['nollie'] },
  '16D5': { name: 'Nollie (ARGB-Controller, OS2-Firmware)', route: 'AleRGB-Treiber „Nollie ARGB“ – direkt, ohne Zusatzsoftware', drivers: ['nollie'] },
  '3061': { name: 'Nollie 16/32 (ARGB-Controller)', route: 'OpenRGB (Nollie 16/32 werden vom AleRGB-Treiber noch nicht direkt unterstützt)', drivers: ['openrgb'] },
  '1A86': { name: 'QinHeng (DIY/Adalight-Controller)', route: 'OpenRGB (Serial/Adalight) oder WLED', drivers: ['openrgb', 'wled'] },
  '10C4': { name: 'Silicon Labs (diverse LED-/Lüfter-Controller)', route: 'OpenRGB', drivers: ['openrgb'] },
  '1044': { name: 'Gigabyte (Aorus Peripherie)', route: 'OpenRGB', drivers: ['openrgb'] },
  '2109': { name: 'VIA (Hubs/RGB-Hubs)', route: 'OpenRGB', drivers: ['openrgb'] },
  '0C45': { name: 'Microdia/Sonix (Redragon, diverse OEM)', route: 'OpenRGB', drivers: ['openrgb'] },
  '3434': { name: 'Keychron', route: 'OpenRGB (QMK/VIA-Firmware mit OpenRGB-Protokoll)', drivers: ['openrgb'] },
  '1209': { name: 'Open-Source-Hardware (QMK u.a.)', route: 'OpenRGB (QMK OpenRGB)', drivers: ['openrgb'] },
};

const CONFLICTS = [
  { re: /^(LightingService|ArmouryCrate|ArmouryCrate\.Service|AuraService|ArmourySocketServer)\.exe$/i, name: 'ASUS Armoury Crate / Aura', tip: 'Blockiert den SMBus-Zugriff auf RAM & Mainboard. Für OpenRGB den Dienst „LightingService“ beenden/deaktivieren oder Armoury Crate komplett mit dem „Armoury Crate Uninstall Tool“ entfernen.' },
  { re: /^(MSI\.CentralServer|MysticLight|MSI_Center)\.exe$/i, name: 'MSI Center / Mystic Light', tip: 'Mystic Light übernimmt die Mainboard-/GPU-LEDs. In MSI Center das Mystic-Light-Modul deinstallieren, wenn OpenRGB sie steuern soll.' },
  { re: /^(RGBFusion|GCC|GigabyteControlCenter)\.exe$/i, name: 'Gigabyte RGB Fusion / Control Center', tip: 'Kann mit OpenRGB um den Controller konkurrieren – RGB Fusion beenden.' },
  { re: /^iCUE\.exe$/i, name: 'Corsair iCUE', tip: 'Gut für den Corsair-iCUE-Treiber (SDK in iCUE aktivieren). Wenn du Corsair-Geräte stattdessen über OpenRGB steuerst, iCUE beenden – sonst flackern die Geräte.' },
  { re: /^(Razer Synapse 3|Razer Synapse|RazerAppEngine|Razer Central|RzSDKService|RzChromaSDKService)\.exe$/i, name: 'Razer Synapse', tip: 'Nötig für den Razer-Chroma-Treiber. Razer-Geräte nicht zusätzlich in OpenRGB aktivieren.' },
  { re: /^lghub(_agent|_system_tray)?\.exe$/i, name: 'Logitech G HUB', tip: 'Nötig für den Logitech-Treiber. In G HUB „Spielen und Anwendungen die Steuerung der Beleuchtung erlauben“ aktivieren.' },
  { re: /^(SteelSeriesGG|SteelSeriesEngine|SteelSeriesGGClient)\.exe$/i, name: 'SteelSeries GG', tip: 'Nötig für den SteelSeries-Treiber.' },
  { re: /^(NZXT CAM|CAM)\.exe$/i, name: 'NZXT CAM', tip: 'Steuert NZXT-Geräte exklusiv – für OpenRGB beenden.' },
  { re: /^(L-Connect 3|L-Connect|LConnect3)\.exe$/i, name: 'Lian Li L-Connect', tip: 'Für OpenRGB beenden.' },
  { re: /^(SignalRgb|SignalRGB)\.exe$/i, name: 'SignalRGB', tip: 'Zwei RGB-Programme gleichzeitig führen zu Flackern – SignalRGB beenden.' },
  { re: /^(Aura|AuraCreator)\.exe$/i, name: 'ASUS Aura Creator', tip: 'Beenden, wenn OpenRGB steuern soll.' },
  { re: /^(TTRGBPLUS|Thermaltake.*)\.exe$/i, name: 'Thermaltake TT RGB Plus', tip: 'Für OpenRGB beenden.' },
  { re: /^(NollieRGB|Nollie|NollieOS|NollieLight)\.exe$/i, name: 'Nollie-Software', tip: 'Belegt den Nollie-Controller – beenden, AleRGB steuert ihn direkt.' },
  { re: /^(OpenRGB)\.exe$/i, name: 'OpenRGB', tip: 'Läuft – stelle sicher, dass der SDK-Server gestartet ist.', ok: true },
  { re: /^(WallpaperEngine|wallpaper64|wallpaper32)\.exe$/i, name: 'Wallpaper Engine (iCUE/Razer/Logitech-Integration)', tip: 'Kann über seine RGB-Integration ebenfalls Geräte ansteuern – in Wallpaper Engine → Einstellungen → Plugins deaktivieren.' },
];

function run(cmd, args, timeout = 15000) {
  return new Promise((res) => execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (e, out) => res(e ? '' : String(out))));
}

async function usbDevices() {
  const list = [];
  if (process.platform === 'win32') {
    const out = await run('powershell.exe', ['-NoProfile', '-Command', "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_' } | Select-Object FriendlyName,InstanceId | ConvertTo-Json -Compress"]);
    let arr = []; try { arr = JSON.parse(out); if (!Array.isArray(arr)) arr = [arr]; } catch {}
    for (const d of arr) { const m = /VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(d.InstanceId || ''); if (m) list.push({ vid: m[1].toUpperCase(), pid: m[2].toUpperCase(), name: d.FriendlyName || '' }); }
  } else if (fs.existsSync('/sys/bus/usb/devices')) {
    for (const d of fs.readdirSync('/sys/bus/usb/devices')) {
      const p = path.join('/sys/bus/usb/devices', d);
      try { const vid = fs.readFileSync(path.join(p, 'idVendor'), 'utf8').trim().toUpperCase(); const pid = fs.readFileSync(path.join(p, 'idProduct'), 'utf8').trim().toUpperCase(); let name = ''; try { name = fs.readFileSync(path.join(p, 'product'), 'utf8').trim(); } catch {} list.push({ vid, pid, name }); } catch {}
    }
  }
  return list;
}

async function processes() {
  if (process.platform === 'win32') {
    const out = await run('tasklist', ['/fo', 'csv', '/nh']);
    return [...new Set(out.split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean))];
  }
  const out = await run('ps', ['-eo', 'comm=']);
  return [...new Set(out.split('\n').map((s) => s.trim() + '.exe').filter(Boolean))];
}

async function smbusCheck() {
  if (process.platform !== 'win32') return null;
  // OpenRGB braucht für RAM/Mainboard-SMBus den Treiber PawnIO (neu) bzw. WinRing0/inpoutx64 (alt)
  const out = await run('sc.exe', ['query', 'type=', 'driver', 'state=', 'all']);
  return { pawnio: /PawnIO/i.test(out), winring0: /WinRing0/i.test(out) };
}

async function runDiagnostics(core) {
  const [usb, procs, smb] = await Promise.all([usbDevices(), processes(), smbusCheck()]);
  const items = [];

  // 1) Hardware nach Hersteller
  const byVendor = new Map();
  for (const d of usb) { const v = VENDORS[d.vid]; if (!v) continue; if (!byVendor.has(d.vid)) byVendor.set(d.vid, { ...v, vid: d.vid, devices: new Set() }); if (d.name) byVendor.get(d.vid).devices.add(d.name); }
  const hardware = [...byVendor.values()].map((v) => ({ ...v, devices: [...v.devices].slice(0, 8), active: v.drivers.filter((id) => (id === 'kraken' ? core.kraken && core.kraken.k && core.kraken.k.connected : core.drivers.get(id) && core.drivers.get(id).status === 'ok')) }));

  // 2) Software-Konflikte
  const software = [];
  for (const c of CONFLICTS) { const hit = procs.find((p) => c.re.test(p)); if (hit) software.push({ name: c.name, process: hit, tip: c.tip, ok: !!c.ok }); }

  // 3) Treiber-Status
  for (const [id, d] of core.drivers) {
    if (d.status === 'error') items.push({ level: 'error', text: `${d.constructor.meta.name}: ${d.message}`, driver: id });
    for (const x of await d.diagnose().catch(() => [])) items.push({ ...x, driver: id });
  }
  for (const h of hardware) if (!h.active.length) items.push({ level: 'warn', text: `${h.name}-Hardware erkannt, aber kein passender Treiber verbunden. Empfohlen: ${h.route}.` });
  const corsairBoth = core.drivers.get('corsair').status === 'ok' && core.allDevices().some((d) => d.driver === 'openrgb' && /corsair/i.test(d.vendor + d.name));
  const nollieBoth = core.drivers.get('nollie') && core.drivers.get('nollie').devices.size && core.allDevices().some((d) => d.driver === 'openrgb' && /nollie/i.test(d.vendor + d.name));
  if (nollieBoth) items.push({ level: 'warn', text: 'Der Nollie-Controller wird doppelt angesteuert (AleRGB-Treiber UND OpenRGB). In OpenRGB unter Settings → Supported Devices „Nollie“ deaktivieren.' });
  if (corsairBoth) items.push({ level: 'warn', text: 'Corsair-Geräte werden doppelt angesteuert (iCUE-SDK UND OpenRGB). In OpenRGB die Corsair-Geräte deaktivieren oder den iCUE-Treiber ausschalten.' });
  if (smb && !smb.pawnio && !smb.winring0 && byVendor.size) items.push({ level: 'info', text: 'Für RAM- und Mainboard-RGB über SMBus benötigt OpenRGB den Treiber „PawnIO“ (wird vom aktuellen OpenRGB-Installer angeboten). Ohne ihn werden RAM-Riegel oft nicht gefunden.' });
  const orgb = core.drivers.get('openrgb');
  if (orgb && orgb.status === 'ok' && !core.allDevices().some((d) => d.driver === 'openrgb' && (d.type === 'ram' || d.type === 'motherboard')))
    items.push({ level: 'info', text: 'OpenRGB findet kein Mainboard/RAM: OpenRGB einmal „Als Administrator“ starten und in OpenRGB unter Einstellungen → „Rescan Devices“ ausführen.' });
  return { platform: process.platform, hardware, software, items, usbCount: usb.length, unknownUsb: usb.filter((d) => !VENDORS[d.vid]).length };
}

module.exports = { runDiagnostics };
