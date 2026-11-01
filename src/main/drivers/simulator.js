'use strict';
/** Virtuelle Demo-Geräte – zum Ausprobieren von Effekten und Layouts ohne Hardware. */
const { Driver, Device, matrixLeds, linearLeds, ringLeds } = require('./base');
class SimDevice extends Device { async write() {} }

class SimulatorDriver extends Driver {
  static meta = {
    id: 'simulator', name: 'Demo-Geräte', vendor: 'Virtuell',
    description: 'Virtuelle Tastatur, Maus, Lüfter, RAM und LED-Strip – perfekt zum Testen von Effekten ohne Hardware.',
    help: 'Einfach aktivieren. Die Geräte erscheinen in der Geräteliste und im Layout.',
    defaultEnabled: false,
    fields: [],
  };
  async start() {
    const add = (o) => this.devices.set(o.id, new SimDevice({ driver: 'simulator', vendor: 'Demo', maxFps: 60, ...o }));
    add({ id: 'sim:keyboard', name: 'Demo-Tastatur', type: 'keyboard', leds: matrixLeds(22, 6), aspect: 3.4 });
    add({ id: 'sim:mouse', name: 'Demo-Maus', type: 'mouse', leds: [...linearLeds(4, 0.2), ...linearLeds(4, 0.8)], aspect: 0.6 });
    add({ id: 'sim:strip', name: 'Demo-LED-Strip (60)', type: 'ledstrip', leds: linearLeds(60) });
    for (let i = 1; i <= 3; i++) add({ id: 'sim:fan' + i, name: `Demo-Lüfter ${i}`, type: 'fan', leds: ringLeds(16), aspect: 1 });
    add({ id: 'sim:ram1', name: 'Demo-RAM 1', type: 'ram', leds: linearLeds(10).map((p) => ({ x: 0.5, y: p.x })), aspect: 0.15 });
    add({ id: 'sim:ram2', name: 'Demo-RAM 2', type: 'ram', leds: linearLeds(10).map((p) => ({ x: 0.5, y: p.x })), aspect: 0.15 });
    this.setStatus('ok', `${this.devices.size} virtuelle Geräte`);
    this.emit('changed');
  }
  async stop() { this.clearDevices(); this.setStatus('stopped'); }
}
module.exports = SimulatorDriver;
