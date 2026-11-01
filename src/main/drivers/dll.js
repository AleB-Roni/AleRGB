'use strict';
const fs = require('fs');
const path = require('path');
let koffi = null;
try { koffi = require('koffi'); } catch { koffi = null; }

/** Sucht eine Hersteller-DLL an üblichen Orten. */
function findDll(names, extraDirs = [], configured) {
  if (configured && fs.existsSync(configured)) return configured;
  const dirs = [
    ...extraDirs,
    process.resourcesPath ? path.join(process.resourcesPath, 'sdk') : null,
    path.join(__dirname, '..', '..', '..', 'sdk'),
  ].filter(Boolean);
  for (const d of dirs) for (const n of names) { const p = path.join(d, n); if (fs.existsSync(p)) return p; }
  return null;
}
module.exports = { koffi, findDll };
