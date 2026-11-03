/* matija-tasic.de · Binär-Umrechner (Logik)
   - Dezimal ↔ Binär für ganze Zahlen von 0 bis 4294967295 (32 Bit, z. B. eine IPv4-Adresse als Zahl)
   - Binär darf mit Leerzeichen, Punkten, Unterstrichen oder „0b“ davor eingegeben werden
   - läuft im Browser und in Node (tests/binconv.test.js)
*/
(function (global) {
  'use strict';

  var MAX = 4294967295;

  /* Dezimalzahl lesen; Tausenderpunkte und Leerzeichen sind erlaubt. null = ungültig */
  function parseDec(s) {
    var v = String(s).replace(/[\s.']/g, '');
    if (!/^\d{1,10}$/.test(v)) return null;
    var n = Number(v);
    return n <= MAX ? n : null;
  }

  /* Binärzahl lesen; nur 0 und 1, höchstens 32 Stellen. null = ungültig */
  function parseBin(s) {
    var v = String(s).replace(/^\s*0b/i, '').replace(/[\s._]/g, '');
    if (!/^[01]{1,32}$/.test(v)) return null;
    return parseInt(v, 2);
  }

  /* Anzahl der Bits, aufgerundet auf ganze Bytes (8, 16, 24 oder 32) */
  function width(n) {
    var bits = n > 0 ? Math.floor(Math.log2(n)) + 1 : 1;
    while (n >= Math.pow(2, bits)) bits++;   /* gegen Rundungsfehler bei log2 */
    return Math.max(8, Math.ceil(bits / 8) * 8);
  }

  /* Binärdarstellung, mit Nullen auf ganze Bytes aufgefüllt, in 8er-Gruppen */
  function toBin(n, w) {
    w = w || width(n);
    var s = n.toString(2);
    while (s.length < w) s = '0' + s;
    return s.replace(/(.{8})(?=.)/g, '$1 ');
  }

  /* Stellenwerte der gesetzten Bits, größter zuerst: 170 → [128, 32, 8, 2] */
  function parts(n) {
    var out = [], bit = width(n) - 1;
    for (; bit >= 0; bit--) {
      var p = Math.pow(2, bit);
      if (Math.floor(n / p) % 2 === 1) out.push(p);
    }
    return out;
  }

  /* Ein Bit umschalten (Bit 0 = ganz rechts) */
  function toggle(n, bit) {
    var p = Math.pow(2, bit);
    return Math.floor(n / p) % 2 === 1 ? n - p : n + p;
  }

  var api = { MAX: MAX, parseDec: parseDec, parseBin: parseBin, width: width, toBin: toBin, parts: parts, toggle: toggle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.BinConv = api;
})(this);
