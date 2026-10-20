/* matija-tasic.de · Passwortgenerator (Logik)
   - Zufall nur aus crypto.getRandomValues, nie aus Math.random
   - gleichverteilt durch Verwerfen zu großer Zufallswerte (kein Modulo-Bias)
   - läuft im Browser und in Node (tests/pwgen.test.js)
*/
(function (global) {
  'use strict';

  /* Sonderzeichen ohne Leerzeichen, Anführungszeichen und Backslash,
     damit das Passwort auch in Shell, Konfigdateien und CSV keinen Ärger macht */
  var SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!#$%&()*+,-./:;<=>?@[]^_{|}~'
  };
  /* Leicht zu verwechseln beim Abtippen */
  var SIMILAR = 'O0oIl1|';
  var MIN = 8, MAX = 64;

  function getRandom() {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || (typeof window !== 'undefined' && window.crypto);
    if (!c || !c.getRandomValues) throw new Error('Kein sicherer Zufallsgenerator verfügbar');
    return function (n) {
      var buf = new Uint32Array(1), limit = Math.floor(4294967296 / n) * n;
      do { c.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % n;
    };
  }

  function pools(opts) {
    var out = [];
    Object.keys(SETS).forEach(function (k) {
      if (!opts[k]) return;
      var chars = SETS[k];
      if (opts.noSimilar) chars = chars.split('').filter(function (ch) { return SIMILAR.indexOf(ch) < 0; }).join('');
      out.push(chars);
    });
    return out;
  }

  /* opts: { length, lower, upper, digits, symbols, noSimilar }
     Jede gewählte Zeichenart kommt mindestens einmal vor. */
  function generate(opts, rand) {
    rand = rand || getRandom();
    var p = pools(opts);
    if (!p.length) return null;
    var len = Math.max(MIN, Math.min(MAX, Math.floor(opts.length) || 20));
    var all = p.join(''), chars = [];
    p.forEach(function (set) { chars.push(set[rand(set.length)]); });
    while (chars.length < len) chars.push(all[rand(all.length)]);
    for (var i = chars.length - 1; i > 0; i--) {
      var j = rand(i + 1), t = chars[i]; chars[i] = chars[j]; chars[j] = t;
    }
    return chars.join('');
  }

  /* Stärke in Bit: Länge × log2(Zeichenvorrat) */
  function entropy(opts) {
    var n = pools(opts).join('').length;
    if (!n) return 0;
    var len = Math.max(MIN, Math.min(MAX, Math.floor(opts.length) || 20));
    return Math.round(len * Math.log2(n));
  }

  /* Einstufung: 0 schwach, 1 mittel, 2 stark, 3 sehr stark */
  function rating(bits) {
    return bits < 60 ? 0 : bits < 80 ? 1 : bits < 110 ? 2 : 3;
  }

  var api = { SETS: SETS, SIMILAR: SIMILAR, MIN: MIN, MAX: MAX, generate: generate, entropy: entropy, rating: rating };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.PwGen = api;
})(this);
