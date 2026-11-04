/* matija-tasic.de · Cron-Erklärer: Rechenlogik
   - nur Logik und Texte, keine Oberfläche; läuft im Browser und in Node (tests/cron.test.js)
   - Format wie crontab unter Linux (cronie/Vixie cron): Minute Stunde Tag Monat Wochentag
   - Kürzel: @hourly @daily @midnight @weekly @monthly @yearly @annually @reboot
   - Sind Tag UND Wochentag eingeschränkt, reicht es, wenn EINES passt (wie bei cron üblich)
*/
(function (global) {
  'use strict';

  var FIELDS = [
    { key: 'min', lo: 0, hi: 59 },
    { key: 'hour', lo: 0, hi: 23 },
    { key: 'dom', lo: 1, hi: 31 },
    { key: 'mon', lo: 1, hi: 12, names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] },
    { key: 'dow', lo: 0, hi: 7, names: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }
  ];
  var MACROS = {
    '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *'
  };

  function val(f, s) {
    s = s.toLowerCase();
    if (/^\d{1,2}$/.test(s)) return Number(s);
    if (f.names) { var i = f.names.indexOf(s); if (i >= 0) return f.key === 'mon' ? i + 1 : i; }
    return null;
  }

  /* Ein Feld lesen → { items: [{from,to,step,star}], set: [Zahlen], star } oder { error, token } */
  function parseField(f, text) {
    var items = [], set = {};
    var parts = String(text).split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], m = /^([^/]+)(?:\/(\d{1,2}))?$/.exec(p);
      if (!m) return { error: 'format', token: p };
      var step = m[2] ? Number(m[2]) : 1, a, b, star = false;
      if (m[2] && step < 1) return { error: 'step', token: p };
      if (m[1] === '*') { a = f.lo; b = f.key === 'dow' ? 6 : f.hi; star = true; }
      else {
        var r = m[1].split('-');
        if (r.length > 2) return { error: 'format', token: p };
        a = val(f, r[0]); b = r.length === 2 ? val(f, r[1]) : a;
        if (a === null || b === null) return { error: 'format', token: p };
        if (a < f.lo || b > f.hi || a > b) return { error: 'range', token: p };
        if (m[2] && r.length === 1) b = f.key === 'dow' ? 6 : f.hi; // "5/15" = ab 5 alle 15
      }
      items.push({ from: a, to: b, step: step, star: star });
      for (var v = a; v <= b; v += step) set[f.key === 'dow' && v === 7 ? 0 : v] = true;
    }
    var list = Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
    return { items: items, set: list, star: String(text).charAt(0) === '*' };
  }

  /* Ausdruck lesen → { fields: {min,hour,dom,mon,dow}, macro } | { reboot: true } | { error, field, token } */
  function parse(expr) {
    var s = String(expr || '').trim().replace(/\s+/g, ' ');
    if (!s) return { error: 'empty' };
    var macro = null;
    if (s.charAt(0) === '@') {
      var k = s.split(' ')[0].toLowerCase();
      if (k === '@reboot') return { reboot: true, macro: k, command: s.slice(k.length).trim() };
      if (!MACROS[k]) return { error: 'macro', token: k };
      macro = k;
      s = MACROS[k] + s.slice(k.length);
    }
    var parts = s.split(' ');
    if (parts.length < 5) return { error: 'count', count: parts.length };
    var out = { fields: {}, macro: macro, command: parts.slice(5).join(' ') };
    for (var i = 0; i < 5; i++) {
      var r = parseField(FIELDS[i], parts[i]);
      if (r.error) return { error: r.error, field: FIELDS[i].key, token: r.token };
      r.text = parts[i];
      out.fields[FIELDS[i].key] = r;
    }
    return out;
  }

  function has(list, v) { return list.indexOf(v) >= 0; }

  function dayMatches(f, d) {
    var dom = has(f.dom.set, d.getDate()), dow = has(f.dow.set, d.getDay());
    if (!f.dom.star && !f.dow.star) return dom || dow; // beide eingeschränkt: ODER
    return dom && dow;
  }

  /* Nächste Ausführungen ab "from" (Date, lokale Zeit). Sucht höchstens 5 Jahre voraus. */
  function nextRuns(parsed, from, count) {
    var out = [];
    if (!parsed || !parsed.fields) return out;
    var f = parsed.fields;
    var start = new Date(from.getTime());
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);
    var day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (var n = 0; n < 366 * 5 && out.length < count; n++) {
      if (has(f.mon.set, day.getMonth() + 1) && dayMatches(f, day)) {
        for (var h = 0; h < f.hour.set.length && out.length < count; h++) {
          for (var m = 0; m < f.min.set.length && out.length < count; m++) {
            var t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), f.hour.set[h], f.min.set[m]);
            // Zeitumstellung: nicht existierende Uhrzeit wird vom Browser verschoben → überspringen
            if (t.getHours() !== f.hour.set[h] || t.getDate() !== day.getDate()) continue;
            if (t >= start) out.push(t);
          }
        }
      }
      day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    }
    return out;
  }

  /* ---------- Klartext (de/en) ---------- */
  var TXT = {
    de: {
      dow: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
      dowS: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
      mon: ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
      and: ' und ', or: ' oder ', every: 'jede', to: ' bis '
    },
    en: {
      dow: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      dowS: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      mon: ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      and: ' and ', or: ' or ', every: 'every', to: ' to '
    }
  };
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function joinList(arr, lang) {
    var T = TXT[lang];
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + T.and + arr[arr.length - 1];
  }
  function ord(n, lang) {
    if (lang === 'de') return n + '.';
    var s = (n % 10 === 1 && n !== 11) ? 'st' : (n % 10 === 2 && n !== 12) ? 'nd' : (n % 10 === 3 && n !== 13) ? 'rd' : 'th';
    return n + s;
  }
  /* Ein Feld allgemein beschreiben (für die Tabelle) */
  function fieldText(key, r, lang) {
    var T = TXT[lang], de = lang === 'de';
    function name(v) {
      if (key === 'dow') return T.dow[v];
      if (key === 'mon') return T.mon[v];
      if (key === 'dom') return ord(v, lang);
      return String(v);
    }
    var unit = {
      min: de ? ['jede Minute', 'Minuten', 'Minute'] : ['every minute', 'minutes', 'minute'],
      hour: de ? ['jede Stunde', 'Stunden', 'Stunde'] : ['every hour', 'hours', 'hour'],
      dom: de ? ['jeder Tag', 'Tage', 'Tag'] : ['every day', 'days', 'day'],
      mon: de ? ['jeder Monat', 'Monate', 'Monat'] : ['every month', 'months', 'month'],
      dow: de ? ['jeder Wochentag', 'Tage', 'Wochentag'] : ['every weekday', 'days', 'weekday']
    }[key];
    var parts = r.items.map(function (it) {
      if (it.star && it.step === 1) return unit[0];
      if (it.star) return de ? 'alle ' + it.step + ' ' + unit[1] : 'every ' + it.step + ' ' + unit[1];
      var base = it.from === it.to ? name(it.from) : name(it.from) + T.to + name(it.to);
      if (it.step > 1) return (de ? 'alle ' + it.step + ' ' + unit[1] + ' von ' : 'every ' + it.step + ' ' + unit[1] + ' from ') + base;
      return base;
    });
    return joinList(parts, lang);
  }

  function singles(r) { return r.items.every(function (it) { return it.from === it.to && !it.star; }); }

  /* Ganzer Satz: "Läuft um 03:30, montags bis freitags." */
  function describe(p, lang) {
    lang = lang === 'en' ? 'en' : 'de';
    var de = lang === 'de', T = TXT[lang];
    if (p.reboot) return de ? 'Läuft einmal nach jedem Start des Systems (@reboot).' : 'Runs once after every system start (@reboot).';
    var f = p.fields, mi = f.min, ho = f.hour;
    var time;
    if (singles(mi) && singles(ho) && mi.set.length * ho.set.length <= 6) {
      var times = [];
      ho.set.forEach(function (h) { mi.set.forEach(function (m) { times.push(pad(h) + ':' + pad(m)); }); });
      time = (de ? 'um ' : 'at ') + joinList(times, lang);
    } else if (mi.star && mi.items[0].step === 1 && mi.items.length === 1) {
      time = de ? 'jede Minute' : 'every minute';
      if (!ho.star || ho.items[0].step > 1) time += (de ? ' während der Stunde(n) ' : ' during hour(s) ') + fieldText('hour', ho, lang);
    } else if (mi.star && mi.items.length === 1) {
      time = de ? 'alle ' + mi.items[0].step + ' Minuten' : 'every ' + mi.items[0].step + ' minutes';
      if (!ho.star || ho.items[0].step > 1) time += (de ? ', Stunde(n): ' : ', hour(s): ') + fieldText('hour', ho, lang);
    } else if (singles(mi) && ho.star && ho.items[0].step === 1 && ho.items.length === 1) {
      time = de ? 'stündlich zur Minute ' + joinList(mi.set.map(String), lang) : 'every hour at minute ' + joinList(mi.set.map(String), lang);
    } else if (singles(mi) && ho.star && ho.items.length === 1) {
      time = de ? 'alle ' + ho.items[0].step + ' Stunden zur Minute ' + joinList(mi.set.map(String), lang) : 'every ' + ho.items[0].step + ' hours at minute ' + joinList(mi.set.map(String), lang);
    } else {
      time = (de ? 'Minute ' : 'minute ') + fieldText('min', mi, lang) + (de ? ', Stunde ' : ', hour ') + fieldText('hour', ho, lang);
    }

    var dowTxt = null, domTxt = null;
    if (!f.dow.star) {
      var d = f.dow.set.slice();
      if (d.join(',') === '1,2,3,4,5') dowTxt = de ? 'montags bis freitags' : 'Monday to Friday';
      else if (d.join(',') === '0,6') dowTxt = de ? 'am Wochenende' : 'at weekends';
      else dowTxt = (de ? '' : 'on ') + joinList(d.map(function (x) { return de ? T.dow[x].toLowerCase() + 's' : T.dow[x] + 's'; }), lang);
    }
    if (!f.dom.star) domTxt = (de ? 'am ' : 'on the ') + fieldText('dom', f.dom, lang) + (de ? ' des Monats' : ' of the month');
    var day;
    if (dowTxt && domTxt) day = domTxt + T.or + dowTxt;
    else day = dowTxt || domTxt || (de ? 'täglich' : 'every day');
    if (f.dom.star && f.dom.items[0].step > 1) day = (de ? 'alle ' : 'every ') + f.dom.items[0].step + (de ? ' Tage (ab dem 1.)' : ' days (from the 1st)');

    var mon = '';
    if (!f.mon.star) mon = (de ? ', nur im ' : ', only in ') + joinList(f.mon.set.map(function (x) { return T.mon[x]; }), lang);
    else if (f.mon.items[0].step > 1) mon = (de ? ', alle ' : ', every ') + f.mon.items[0].step + (de ? ' Monate' : ' months');

    var s = (de ? 'Läuft ' : 'Runs ') + time + ', ' + day + mon + '.';
    return s;
  }

  /* Hinweise: [{level, code, ...}] */
  function hints(p) {
    var out = [];
    if (!p || p.error) return out;
    if (p.reboot) { out.push({ level: 'info', code: 'reboot' }); return out; }
    var f = p.fields;
    if (!f.dom.star && !f.dow.star) out.push({ level: 'warn', code: 'dom-or-dow' });
    if (f.min.star && f.min.items[0].step === 1 && f.min.items.length === 1) out.push({ level: 'warn', code: 'every-minute' });
    if (has(f.dow.set, 0) && /(^|[,-])7($|[,/-])/.test(f.dow.text)) out.push({ level: 'info', code: 'sunday7' });
    var maxDom = Math.max.apply(null, f.dom.set);
    if (!f.dom.star && f.dow.star && maxDom >= 29) {
      var months = f.mon.set, len = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      var never = months.every(function (m) { return Math.min.apply(null, f.dom.set) > len[m]; });
      if (never) out.push({ level: 'err', code: 'never' });
      else if (months.some(function (m) { return maxDom > len[m]; })) out.push({ level: 'info', code: 'short-months', day: maxDom });
    }
    return out;
  }

  var api = { FIELDS: FIELDS, MACROS: MACROS, parse: parse, parseField: parseField, nextRuns: nextRuns, describe: describe, fieldText: fieldText, hints: hints };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CronCalc = api;
})(this);
