/* matija-tasic.de · Prüfsummen für den Hash-Rechner
   - MD5, SHA-1, SHA-256, SHA-512 in reinem JavaScript, blockweise
   - blockweise, damit auch ISO-Dateien mit mehreren GB nicht ganz in den Speicher müssen
   - läuft im Browser und in Node (tests/hash.test.js)
*/
(function (global) {
  'use strict';

  var TWO32 = 4294967296;

  /* ---------- Konstanten (Nachkommastellen der Wurzeln der ersten Primzahlen) ---------- */
  var K256 = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  /* SHA-512: je Konstante zwei 32-Bit-Hälften (hoch, niedrig) */
  var K512 = new Int32Array([
    0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
    0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
    0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
    0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
    0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
    0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
    0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
    0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
    0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
    0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
    0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
    0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
    0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
    0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
    0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
    0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
    0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
    0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
    0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
    0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
  ]);
  var MD5_K = new Int32Array(64);
  for (var i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * TWO32) | 0;
  var MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

  /* ---------- Rechenkerne: verarbeiten einen Block ab Position o ---------- */
  function md5Block(h, b, o, x) {
    for (var j = 0; j < 16; j++) {
      var p = o + j * 4;
      x[j] = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24);
    }
    var a = h[0], bb = h[1], c = h[2], d = h[3];
    for (var i = 0; i < 64; i++) {
      var f, g, r = i >> 4;
      if (r === 0) { f = (bb & c) | (~bb & d); g = i; }
      else if (r === 1) { f = (d & bb) | (~d & c); g = (5 * i + 1) & 15; }
      else if (r === 2) { f = bb ^ c ^ d; g = (3 * i + 5) & 15; }
      else { f = c ^ (bb | ~d); g = (7 * i) & 15; }
      var s = MD5_S[(r << 2) | (i & 3)];
      var t = (a + f + MD5_K[i] + x[g]) | 0;
      a = d; d = c; c = bb;
      bb = (bb + ((t << s) | (t >>> (32 - s)))) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  }

  function be32(b, p) { return (b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]; }

  function sha1Block(h, b, o, w) {
    for (var j = 0; j < 16; j++) w[j] = be32(b, o + j * 4);
    for (j = 16; j < 80; j++) { var v = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16]; w[j] = (v << 1) | (v >>> 31); }
    var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4];
    for (var i = 0; i < 80; i++) {
      var f, k;
      if (i < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
      else if (i < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = bb ^ c ^ d; k = 0xca62c1d6; }
      var t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
      e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = t;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0;
  }

  function sha256Block(h, b, o, w) {
    for (var j = 0; j < 16; j++) w[j] = be32(b, o + j * 4);
    for (j = 16; j < 64; j++) {
      var x = w[j - 15], y = w[j - 2];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (var i = 0; i < 64; i++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }

  /* SHA-512 mit 64-Bit-Zahlen als Paar (hoch, niedrig) in Int32Arrays.
     Rotation nach rechts um n (0 < n < 64), Ergebnis-Hälfte hoch bzw. niedrig: */
  function rH(h, l, n) { return n < 32 ? (h >>> n) | (l << (32 - n)) : (l >>> (n - 32)) | (h << (64 - n)); }
  function rL(h, l, n) { return n < 32 ? (l >>> n) | (h << (32 - n)) : (h >>> (n - 32)) | (l << (64 - n)); }

  function sha512Block(H, b, o, W) {
    var j, k, lo;
    for (j = 0; j < 32; j++) W[j] = be32(b, o + j * 4);
    for (j = 16; j < 80; j++) {
      var xh = W[(j - 15) * 2], xl = W[(j - 15) * 2 + 1], yh = W[(j - 2) * 2], yl = W[(j - 2) * 2 + 1];
      var s0h = rH(xh, xl, 1) ^ rH(xh, xl, 8) ^ (xh >>> 7);
      var s0l = rL(xh, xl, 1) ^ rL(xh, xl, 8) ^ ((xl >>> 7) | (xh << 25));
      var s1h = rH(yh, yl, 19) ^ rH(yh, yl, 61) ^ (yh >>> 6);
      var s1l = rL(yh, yl, 19) ^ rL(yh, yl, 61) ^ ((yl >>> 6) | (yh << 26));
      lo = (W[(j - 16) * 2 + 1] >>> 0) + (s0l >>> 0) + (W[(j - 7) * 2 + 1] >>> 0) + (s1l >>> 0);
      W[j * 2] = W[(j - 16) * 2] + s0h + W[(j - 7) * 2] + s1h + ((lo / TWO32) | 0);
      W[j * 2 + 1] = lo;
    }
    var ah = H[0], al = H[1], bh = H[2], bl = H[3], ch = H[4], cl = H[5], dh = H[6], dl = H[7];
    var eh = H[8], el = H[9], fh = H[10], fl = H[11], gh = H[12], gl = H[13], hh = H[14], hl = H[15];
    for (var i = 0; i < 80; i++) {
      var S1h = rH(eh, el, 14) ^ rH(eh, el, 18) ^ rH(eh, el, 41);
      var S1l = rL(eh, el, 14) ^ rL(eh, el, 18) ^ rL(eh, el, 41);
      var chh = (eh & fh) ^ (~eh & gh), chl = (el & fl) ^ (~el & gl);
      lo = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (K512[i * 2 + 1] >>> 0) + (W[i * 2 + 1] >>> 0);
      var t1h = (hh + S1h + chh + K512[i * 2] + W[i * 2] + ((lo / TWO32) | 0)) | 0, t1l = lo | 0;
      var S0h = rH(ah, al, 28) ^ rH(ah, al, 34) ^ rH(ah, al, 39);
      var S0l = rL(ah, al, 28) ^ rL(ah, al, 34) ^ rL(ah, al, 39);
      var mjh = (ah & bh) ^ (ah & ch) ^ (bh & ch), mjl = (al & bl) ^ (al & cl) ^ (bl & cl);
      lo = (S0l >>> 0) + (mjl >>> 0);
      var t2h = (S0h + mjh + ((lo / TWO32) | 0)) | 0, t2l = lo | 0;
      hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
      lo = (dl >>> 0) + (t1l >>> 0);
      eh = (dh + t1h + ((lo / TWO32) | 0)) | 0; el = lo | 0;
      dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
      lo = (t1l >>> 0) + (t2l >>> 0);
      ah = (t1h + t2h + ((lo / TWO32) | 0)) | 0; al = lo | 0;
    }
    var v = [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl];
    for (k = 0; k < 16; k += 2) {
      lo = (H[k + 1] >>> 0) + (v[k + 1] >>> 0);
      H[k] = H[k] + v[k] + ((lo / TWO32) | 0);
      H[k + 1] = lo;
    }
  }

  /* ---------- Verfahren ---------- */
  var ALGS = {
    md5: { name: 'MD5', block: 64, hex: 32, lenBytes: 8, little: true, words: 16, run: md5Block,
      init: [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476] },
    sha1: { name: 'SHA-1', block: 64, hex: 40, lenBytes: 8, words: 80, run: sha1Block,
      init: [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0] },
    sha256: { name: 'SHA-256', block: 64, hex: 64, lenBytes: 8, words: 64, run: sha256Block,
      init: [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19] },
    sha512: { name: 'SHA-512', block: 128, hex: 128, lenBytes: 16, words: 160, run: sha512Block,
      init: [0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1, 0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179] }
  };

  /* create('sha256') → { update(Uint8Array), digest() → Hex-Text } */
  function create(id) {
    var A = ALGS[id];
    if (!A) throw new Error('Unbekanntes Verfahren: ' + id);
    var h = new Int32Array(A.init), w = new Int32Array(A.words);
    var buf = new Uint8Array(A.block), used = 0, total = 0, done = false;

    function update(data) {
      if (done) throw new Error('digest() wurde schon aufgerufen');
      total += data.length;
      feed(data);
      return api;
    }

    function feed(data) {
      var n = data.length, p = 0;
      if (used) {
        var take = Math.min(A.block - used, n);
        buf.set(data.subarray(0, take), used); used += take; p = take;
        if (used < A.block) return;
        A.run(h, buf, 0, w); used = 0;
      }
      for (; p + A.block <= n; p += A.block) A.run(h, data, p, w);
      if (p < n) { buf.set(data.subarray(p), 0); used = n - p; }
    }

    function digest() {
      if (done) throw new Error('digest() wurde schon aufgerufen');
      done = true;
      var bits = total * 8, hi = Math.floor(bits / TWO32), lo = bits >>> 0;
      var padLen = (used < A.block - A.lenBytes ? A.block : 2 * A.block) - used;
      var pad = new Uint8Array(padLen);
      pad[0] = 0x80;
      if (A.little) {
        for (var i = 0; i < 4; i++) { pad[padLen - 8 + i] = (lo >>> (8 * i)) & 255; pad[padLen - 4 + i] = (hi >>> (8 * i)) & 255; }
      } else {
        for (i = 0; i < 4; i++) { pad[padLen - 1 - i] = (lo >>> (8 * i)) & 255; pad[padLen - 5 - i] = (hi >>> (8 * i)) & 255; }
      }
      feed(pad);
      var out = '';
      for (i = 0; i < h.length; i++) {
        var x = h[i];
        if (A.little) x = ((x & 255) << 24) | (((x >>> 8) & 255) << 16) | (((x >>> 16) & 255) << 8) | (x >>> 24);
        out += ('0000000' + (x >>> 0).toString(16)).slice(-8);
      }
      return out;
    }

    var api = { update: update, digest: digest };
    return api;
  }

  /* Text als UTF-8 hashen */
  function hashText(id, text) {
    return create(id).update(utf8(text)).digest();
  }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return new Uint8Array(Buffer.from(s, 'utf8'));
  }

  /* Erwarteten Wert aus dem eingefügten Text holen. Versteht reine Prüfsummen,
     Zeilen aus SHA256SUMS ("<hash>  datei.iso") und BSD-Form ("SHA256 (datei.iso) = <hash>"). */
  function parseExpected(str) {
    var s = String(str || '').trim();
    if (!s) return null;
    var m = s.match(/=\s*([0-9a-fA-F]+)\s*$/) || s.match(/^\s*([0-9a-fA-F]{32,128})\b/) || s.match(/\b([0-9a-fA-F]{32,128})\b/);
    if (!m) return { hex: null };
    var hex = m[1].toLowerCase();
    return { hex: hex, alg: detect(hex) };
  }

  /* Verfahren anhand der Länge erraten: 32 → MD5, 40 → SHA-1, 64 → SHA-256, 128 → SHA-512 */
  function detect(hex) {
    for (var id in ALGS) if (ALGS[id].hex === hex.length) return id;
    return null;
  }

  var api = { ALGS: ALGS, create: create, hashText: hashText, parseExpected: parseExpected, detect: detect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.HashCalc = api;
})(this);
