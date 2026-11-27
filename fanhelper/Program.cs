// AleRGB Lüfter-Dienst
// Verbindet sich per TCP (nur 127.0.0.1) mit AleRGB, meldet Sensoren & Lüfter und setzt Lüfterleistungen.
// Sicherheit: Bei Verbindungsverlust, fehlendem Lebenszeichen (Watchdog) oder Beenden übernimmt
// wieder das BIOS (SetDefault) für jeden Lüfter, den der Dienst verändert hat.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using LibreHardwareMonitor.Hardware;
using Microsoft.Win32;

namespace AleRGB.FanHelper
{
    internal static class Program
    {
        private static readonly object Gate = new object();
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private static readonly HashSet<string> Touched = new HashSet<string>();
        private static Computer _computer;
        private static StreamWriter _out;
        private static DateTime _lastPing = DateTime.UtcNow;
        private static volatile bool _running = true;
        private static string _log = Path.Combine(Path.GetTempPath(), "AleRGB.FanHelper.log");

        private static int Main(string[] args)
        {
            int port = 0; string token = "";
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--port") int.TryParse(args[i + 1], out port);
                if (args[i] == "--token") token = args[i + 1];
            }
            if (args.Contains("--selftest")) return SelfTest();
            if (port <= 0 || string.IsNullOrEmpty(token)) { Console.Error.WriteLine("Aufruf: AleRGB.FanHelper --port <n> --token <t>"); return 2; }

            AppDomain.CurrentDomain.ProcessExit += (s, e) => RestoreAll();
            AppDomain.CurrentDomain.UnhandledException += (s, e) => { Log("Absturz: " + e.ExceptionObject); RestoreAll(); };
            Console.CancelKeyPress += (s, e) => RestoreAll();

            try
            {
                using (var client = new TcpClient())
                {
                    client.Connect("127.0.0.1", port);
                    var stream = client.GetStream();
                    var reader = new StreamReader(stream, new UTF8Encoding(false));
                    _out = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };
                    Send(new Dictionary<string, object> { { "type", "hello" }, { "token", token }, { "version", "1.0.0" }, { "pawnio", PawnIoInstalled() } });

                    OpenComputer();
                    var pump = new Thread(StatusLoop) { IsBackground = true }; pump.Start();

                    string line;
                    while (_running && (line = reader.ReadLine()) != null)
                    {
                        _lastPing = DateTime.UtcNow;
                        try { Handle(Json.Deserialize<Dictionary<string, object>>(line)); }
                        catch (Exception ex) { Send(new Dictionary<string, object> { { "type", "error" }, { "message", ex.Message } }); }
                    }
                }
            }
            catch (Exception ex) { Log("Verbindungsfehler: " + ex.Message); }
            finally
            {
                _running = false;
                RestoreAll();
                try { _computer?.Close(); } catch { }
            }
            return 0;
        }

        private static void OpenComputer()
        {
            lock (Gate)
            {
                _computer = new Computer
                {
                    IsMotherboardEnabled = true, IsCpuEnabled = true, IsGpuEnabled = true,
                    IsControllerEnabled = true, IsMemoryEnabled = false, IsStorageEnabled = false, IsNetworkEnabled = false,
                };
                _computer.Open();
            }
        }

        private static void StatusLoop()
        {
            while (_running)
            {
                try
                {
                    // Watchdog: AleRGB pingt jede Sekunde. Bleibt das aus (z.B. Absturz), übernimmt das BIOS.
                    if ((DateTime.UtcNow - _lastPing).TotalSeconds > 10) { Log("Kein Lebenszeichen von AleRGB – gebe Lüfter an das BIOS zurück."); RestoreAll(); _running = false; Environment.Exit(0); }
                    Send(Snapshot());
                }
                catch (Exception ex) { Log("Status: " + ex.Message); }
                Thread.Sleep(1000);
            }
        }

        private static IEnumerable<IHardware> AllHardware()
        {
            foreach (var hw in _computer.Hardware)
            {
                yield return hw;
                foreach (var sub in hw.SubHardware) yield return sub;
            }
        }

        private static Dictionary<string, object> Snapshot()
        {
            var sensors = new List<object>(); var controls = new List<object>();
            lock (Gate)
            {
                foreach (var hw in AllHardware())
                {
                    hw.Update();
                    foreach (var s in hw.Sensors)
                    {
                        if (s.SensorType == SensorType.Temperature || s.SensorType == SensorType.Fan || s.SensorType == SensorType.Load)
                            sensors.Add(new Dictionary<string, object> {
                                { "id", s.Identifier.ToString() }, { "name", s.Name }, { "type", s.SensorType.ToString() },
                                { "hardware", hw.Name }, { "hwType", hw.HardwareType.ToString() }, { "value", s.Value.HasValue ? (object)Math.Round(s.Value.Value, 1) : null },
                            });
                        if (s.SensorType == SensorType.Control && s.Control != null)
                        {
                            // Passenden Drehzahl-Sensor (gleicher Index) suchen
                            var fan = hw.Sensors.FirstOrDefault(f => f.SensorType == SensorType.Fan && f.Index == s.Index);
                            controls.Add(new Dictionary<string, object> {
                                { "id", s.Identifier.ToString() }, { "name", s.Name }, { "hardware", hw.Name }, { "hwType", hw.HardwareType.ToString() },
                                { "value", s.Value.HasValue ? (object)Math.Round(s.Value.Value, 1) : null },
                                { "mode", s.Control.ControlMode.ToString() }, { "min", s.Control.MinSoftwareValue }, { "max", s.Control.MaxSoftwareValue },
                                { "rpm", fan != null && fan.Value.HasValue ? (object)Math.Round(fan.Value.Value) : null }, { "fanSensor", fan?.Identifier.ToString() },
                            });
                        }
                    }
                }
            }
            return new Dictionary<string, object> { { "type", "state" }, { "sensors", sensors }, { "controls", controls } };
        }

        private static ISensor FindControl(string id)
        {
            foreach (var hw in AllHardware())
                foreach (var s in hw.Sensors)
                    if (s.SensorType == SensorType.Control && s.Control != null && s.Identifier.ToString() == id) return s;
            return null;
        }

        private static void Handle(Dictionary<string, object> msg)
        {
            var cmd = msg.ContainsKey("cmd") ? Convert.ToString(msg["cmd"]) : "";
            switch (cmd)
            {
                case "ping": break;
                case "set":
                {
                    var id = Convert.ToString(msg["id"]);
                    // Ungültige Werte niemals als 0 % interpretieren
                    if (!msg.ContainsKey("value") || msg["value"] == null) throw new Exception("Ungültiger Wert für " + id);
                    var value = Convert.ToSingle(msg["value"], System.Globalization.CultureInfo.InvariantCulture);
                    if (float.IsNaN(value) || float.IsInfinity(value)) throw new Exception("Ungültiger Wert für " + id);
                    lock (Gate)
                    {
                        var s = FindControl(id) ?? throw new Exception("Lüfter nicht gefunden: " + id);
                        value = Math.Max(s.Control.MinSoftwareValue, Math.Min(s.Control.MaxSoftwareValue, value));
                        s.Control.SetSoftware(value);
                        Touched.Add(id);
                    }
                    break;
                }
                case "default":
                {
                    var id = Convert.ToString(msg["id"]);
                    lock (Gate) { var s = FindControl(id); if (s != null) { s.Control.SetDefault(); Touched.Remove(id); } }
                    break;
                }
                case "restoreAll": RestoreAll(); break;
                case "quit": _running = false; RestoreAll(); Environment.Exit(0); break;
                default: throw new Exception("Unbekannter Befehl: " + cmd);
            }
        }

        private static void RestoreAll()
        {
            try
            {
                lock (Gate)
                {
                    if (_computer == null) return;
                    foreach (var id in Touched.ToList())
                    {
                        try { FindControl(id)?.Control.SetDefault(); } catch (Exception ex) { Log("Zurücksetzen " + id + ": " + ex.Message); }
                    }
                    Touched.Clear();
                }
            }
            catch { }
        }

        private static void Send(object o)
        {
            var line = Json.Serialize(o);
            lock (Json) { _out?.WriteLine(line); }
        }

        private static bool PawnIoInstalled()
        {
            try { using (var k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO")) return k != null; }
            catch { return false; }
        }

        private static void Log(string m) { try { File.AppendAllText(_log, DateTime.Now.ToString("s") + " " + m + Environment.NewLine); } catch { } }

        /// Gibt alle Sensoren/Lüfter einmal als JSON aus – zur Fehlersuche ohne AleRGB.
        private static int SelfTest()
        {
            OpenComputer();
            Console.WriteLine("PawnIO installiert: " + PawnIoInstalled());
            Console.WriteLine(Json.Serialize(Snapshot()));
            _computer.Close();
            return 0;
        }
    }
}
