/* MarktPuls – Frontend. Liest data.json (oder window.__DATA__ in der Vorschau). */
(async function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const LOC = "de-AT";
  const nfCache = {};
  const nf = (d) => (nfCache[d] ||= new Intl.NumberFormat(LOC, { minimumFractionDigits: d, maximumFractionDigits: d }));
  const fmt = (v, d = 2) => (v == null || isNaN(v) ? "–" : nf(d).format(v));
  const fmtP = (v, d = 1) => (v == null || isNaN(v) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + nf(d).format(Math.abs(v)) + " %");
  const cls = (v) => (v == null ? "" : v >= 0 ? "up" : "down");
  const fmtPkt = (v) => (v == null || isNaN(v) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + nf(2).format(Math.abs(v)) + " Pkt.");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pxDec = (v) => (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 2 : 4);
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const dShort = (iso, withYear) => new Date(iso).toLocaleDateString(LOC, { day: "2-digit", month: "short", year: withYear ? "2-digit" : undefined });
  const dTime = (iso) => new Date(iso).toLocaleString(LOC, { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  let data = window.__DATA__;
  if (!data) {
    try { data = await (await fetch("data.json?ts=" + Date.now(), { cache: "no-store" })).json(); }
    catch (e) { $("#app-error").hidden = false; return; }
  }
  const I = data.indices || [];
  const M = data.macro || {};
  const ALL = {};
  I.forEach((x) => (ALL[x.id] = { ...x, kind: "index", dec: pxDec(x.last) }));
  Object.values(M).forEach((m) => (ALL[m.id] = { ...m, kind: "macro" }));
  // Einzelwerte der Indizes (Aktien) und Zinsen Euroraum ebenfalls als Chart öffnen können
  const MB = data.members || {};
  Object.values(MB).forEach((g) => g.members.forEach((m) => {
    const id = "s:" + m.t;
    if (ALL[id]) return;
    ALL[id] = { id, kind: "stock", name: m.n, sector: m.sector, unit: m.cur, last: m.last, dec: m.last >= 1000 ? 0 : 2, perf: m.perf,
      pe: m.pe, fpe: m.fpe, dy: m.dy, mcap: m.mcap, date: g.dates[g.dates.length - 1], group: m.sector,
      daily: g.dates.map((d, i) => [d, m.c[i]]).filter((q) => q[1] != null) };
  }));
  const RT = data.rates || { items: [] };
  RT.items.forEach((r) => (ALL["r:" + r.id] = { id: "r:" + r.id, kind: "rate", name: r.name, unit: "%", dec: 2, last: r.last, date: r.date,
    daily: r.hist, weekly: r.hist, perf: {}, group: "Zinsen Euroraum", note: r.note, freq: r.freq, chg1M: r.chg1M, chg1J: r.chg1J }));

  const RANGES = ["1T", "1W", "1M", "3M", "6M", "YTD", "1J", "5J", "10J", "Max"];
  const RANGE_BTN = { Max: "Seit Beginn" };
  const RANGE_CAP = { "1T": "Letzter Handelstag", "1W": "1 Woche", "1M": "1 Monat", "3M": "3 Monate", "6M": "6 Monate", YTD: "Seit Jahresbeginn", "1J": "1 Jahr", "3J": "3 Jahre", "5J": "5 Jahre", "10J": "10 Jahre", Max: "Seit Beginn" };
  const RANGE_DAYS = { "1W": 7, "1M": 30, "3M": 91, "6M": 182, "1J": 365, "3J": 1096, "5J": 1826, "10J": 3652 };
  const hasRange = (x, r) => {
    if (x.kind === "stock") return ["1W", "1M", "3M", "6M", "YTD", "1J"].includes(r);
    if (x.kind === "rate") return ["1J", "5J", "10J"].includes(r) || (r === "Max" && x.freq === "M");
    if (r === "1T") return (x.intraday?.["1T"] || []).length > 2;
    if (r === "5J" || r === "10J") return x.perf?.[r] != null;
    if (r === "Max") return (x.weekly || []).length > 2;
    return true;
  };
  const state = {
    range: RANGES.includes(store.get("mp-range")) ? store.get("mp-range") : "1J",
    dlgRange: "1J", dlgId: null, dlgList: [],
    sortKey: null, sortDir: -1, tableMode: "Entwicklung", secPeriod: "1M",
  };

  /* ---------- Datenstand ---------- */
  const gen = new Date(data.generated);
  const genTxt = gen.toLocaleString(LOC, { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr";
  $("#stamp-time").textContent = genTxt;
  $("#foot-stamp").textContent = genTxt;
  if ((Date.now() - gen) / 36e5 > 36) $("#stamp-dot").classList.add("stale");
  if (data.demo) $("#demo-banner").hidden = false;
  $("#hero-date").textContent = gen.toLocaleDateString(LOC, { timeZone: "Europe/Vienna", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  /* ---------- Serien ---------- */
  function series(x, range) {
    const d = x.daily || [];
    if (range === "1T") return x.intraday?.["1T"] || [];
    if (range === "1W" && (x.intraday?.["1W"] || []).length > 5) return x.intraday["1W"];
    if (range === "Max") return x.weekly && x.weekly.length > 2 ? x.weekly : d;
    if (!d.length) return d;
    // Start = letzter Schlusskurs am oder vor dem Stichtag (wie bei den Kennzahlen)
    let cut;
    if (range === "YTD") cut = d[d.length - 1][0].slice(0, 4) + "-01-01";
    else { const t = new Date(d[d.length - 1][0].slice(0, 10)); t.setDate(t.getDate() - (RANGE_DAYS[range] || 365)); cut = t.toISOString().slice(0, 10); }
    let i = 0; while (i < d.length - 1 && d[i + 1][0] <= cut) i++;
    if (range === "YTD" && d[i][0] >= cut && i > 0) i--;
    return d.slice(i);
  }
  const seriesPerf = (s) => (s.length > 1 ? (s[s.length - 1][1] / s[0][1] - 1) * 100 : null);
  const rangePerf = (x, range, s) => x.perf?.[range] ?? seriesPerf(s);
  // Bei Angst-Barometern ist ein Anstieg schlecht: Farbe umdrehen
  const inverse = (x) => x.id === "vix" || x.id === "vstoxx";
  const chgCls = (x, v) => (v == null ? "" : inverse(x) ? cls(-v) : cls(v));

  function spark(s, colorVar) {
    const w = 240, h = 60;
    if (!s || s.length < 2) return `<svg class="sp" viewBox="0 0 ${w} ${h}"></svg>`;
    const v = s.map((p) => p[1]);
    const mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn || 1;
    const pts = v.map((y, i) => [(i / (v.length - 1)) * w, h - 4 - ((y - mn) / rg) * (h - 8)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
    const col = colorVar || (v[v.length - 1] >= v[0] ? "var(--up)" : "var(--down)");
    return `<svg class="sp" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${line}L${w} ${h}L0 ${h}Z" fill="${col}" fill-opacity=".1"/>
      <path d="${line}" fill="none" stroke="${col}" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
  }
  const ZOOM = `<svg class="zoom" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M9.5 2H14v4.5M14 2L9 7M6.5 14H2V9.5M2 14l5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function segButtons(el, opts, cur, cb, labels = {}) {
    el.innerHTML = opts.map((o) => `<button type="button" aria-pressed="${o === cur}" data-v="${esc(o)}">${esc(labels[o] || o)}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; [...el.children].forEach((c) => c.setAttribute("aria-pressed", c === b)); cb(b.dataset.v); };
  }

  /* ---------- Kacheln ---------- */
  function indexCard(x, range) {
    if (!hasRange(x, range)) range = "Max";
    const s = series(x, range), p = rangePerf(x, range, s);
    return `<button type="button" class="card" data-open="${x.id}" aria-label="${esc(x.name)}: Chart groß öffnen">
      <div class="row"><span class="nm">${x.flag} ${esc(x.name)}</span>${ZOOM}</div>
      <div class="row"><span class="px num">${fmt(x.last, pxDec(x.last))}</span><span class="chg ${cls(x.perf["1T"])} num">${fmtP(x.perf["1T"], 2)}</span></div>
      ${spark(s)}
      <div class="cap">${RANGE_CAP[range]} <b class="${cls(p)}-t num">${fmtP(p)}</b></div>
    </button>`;
  }
  function macroTile(m, withSpark = true) {
    const note = m.id === "curve" ? (m.last < 0 ? "Invertiert: historisch ein Rezessionssignal" : "Normal (positiv)")
      : m.id === "vix" ? (m.last < 15 ? "Ruhiges Umfeld" : m.last < 22 ? "Normales Umfeld" : m.last < 30 ? "Erhöhte Nervosität" : "Stressphase") : "";
    const inner = `<div class="row"><span class="nm">${esc(m.name)}</span>${m.perf?.["1T"] != null ? `<span class="chg ${chgCls(m, m.perf["1T"])} num">${fmtP(m.perf["1T"], 2)}</span>` : ""}</div>
      <div class="v num">${fmt(m.last, m.dec)} <small>${esc(m.unit)}</small></div>
      ${withSpark && m.daily ? spark(m.daily.slice(-130), "var(--muted)") : ""}${note ? `<div class="note">${note}</div>` : ""}`;
    return m.daily ? `<button type="button" class="tile" data-open="${m.id}" aria-label="${esc(m.name)}: Chart groß öffnen">${inner}</button>` : `<div class="tile">${inner}</div>`;
  }
  const LT = ["kein Thema", "niedrig", "erhöht", "hoch"];
  const lvl = (r) => `<span class="lvl-box"><span class="lvl" data-l="${r.level}"><i></i><i></i><i></i></span><span class="lvl-t">${LT[r.level]}</span></span>`;

  /* ---------- Überblick ---------- */
  (function overview() {
    const m = data.mood || { score: 50, label: "Neutral", components: [] };
    const R = 120, cx = 150, cy = 140;
    const pt = (s, r = R) => { const a = Math.PI * (1 - s / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    const arc = (a, b, col) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `<path d="M${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}" stroke="${col}" stroke-width="20" fill="none"/>`; };
    const segs = [[0, 20, "var(--surface-2)"], [20, 40, "var(--surface-2)"], [40, 60, "var(--surface-2)"], [60, 80, "var(--surface-2)"], [80, 100, "var(--surface-2)"]];
    const [nx, ny] = pt(m.score, R - 30);
    $("#gauge").innerHTML = `<svg viewBox="0 0 300 172" class="gauge" role="img" aria-label="Marktstimmung ${m.score} von 100: ${esc(m.label)}">
      ${segs.map((s) => arc(s[0] + 0.6, s[1] - 0.6, s[2])).join("")}
      ${(() => { const [ax, ay] = pt(0), [bx, by] = pt(m.score); return `<path d="M${ax} ${ay}A${R} ${R} 0 0 1 ${bx} ${by}" stroke="var(--yellow)" stroke-width="20" fill="none"/>`; })()}
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--fg)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="var(--fg)"/>
      <text x="${cx - R}" y="${cy + 24}" text-anchor="middle" fill="var(--muted)" font-size="12">0</text>
      <text x="${cx + R}" y="${cy + 24}" text-anchor="middle" fill="var(--muted)" font-size="12">100</text></svg>
      <div class="gauge-label"><strong>${m.score}</strong><span>${esc(m.label)}</span></div>`;
    const h = data.moodHistory || [];
    const ago = (days) => { const t = new Date(gen); t.setDate(t.getDate() - days); const iso = t.toISOString().slice(0, 10); const c = h.filter((x) => x.date <= iso); return c.length ? c[c.length - 1].mood : null; };
    const w1 = ago(7), m1 = ago(30);
    $("#gauge-hist").textContent = [w1 != null ? `Vor 1 Woche: ${w1}` : null, m1 != null ? `Vor 1 Monat: ${m1}` : null].filter(Boolean).join(" · ");
    $("#comp").innerHTML = m.components.map((c) => `<div title="${esc(c.text)}"><span>${esc(c.name)}</span><em class="num">${fmt(c.value, 1)}</em><i class="bar"><b style="width:${c.score}%"></b></i></div>`).join("");

    const up = I.filter((x) => x.perf["1T"] > 0).length;
    const best = [...I].sort((a, b) => (b.perf.YTD ?? -999) - (a.perf.YTD ?? -999))[0];
    const topRisk = (data.risks || [])[0];
    $("#hero-title").textContent = up > I.length * 0.65 ? "Die Märkte liegen überwiegend im Plus" : up < I.length * 0.35 ? "Die Märkte liegen überwiegend im Minus" : "Die Märkte zeigen ein gemischtes Bild";
    $("#lead").innerHTML = `${up} von ${I.length} Indizes notieren gegenüber dem Vortag im Plus. Stärkster Markt seit Jahresbeginn ist <b>${esc(best?.name)}</b> mit ${fmtP(best?.perf.YTD)}.` +
      (topRisk && topRisk.count ? ` In den Nachrichten dominiert das Thema <b>${esc(topRisk.name)}</b>.` : "");

    const key = ["atx", "dax", "sx5e", "spx", "ndx", "nikkei"].filter((id) => ALL[id]);
    $("#key-cards").innerHTML = key.map((id) => indexCard(ALL[id], "1J")).join("");
    $("#key-cards").dataset.list = key.join(",");
    const km = ["vix", "eurusd", "gold", "brent"].filter((id) => M[id]);
    const kr = ["euribor3m", "yc10y"].map((id) => (data.rates?.items || []).find((r) => r.id === id)).filter(Boolean);
    $("#key-macro").innerHTML = kr.map((r) => rateTile(r, false)).join("") + km.map((id) => macroTile(M[id], false)).join("");
    $("#key-macro").dataset.list = [...kr.map((r) => "r:" + r.id), ...km].join(",");
    $("#key-risks").innerHTML = (data.risks || []).filter((r) => r.count).slice(0, 3).map((r) =>
      `<div class="toprisk"><div class="row"><b>${esc(r.name)}</b>${lvl(r)}</div>${r.headlines[0] ? `<p>${esc(r.headlines[0].title)}</p>` : ""}</div>`).join("") || `<p class="foot-note">Derzeit keine auffälligen Risikothemen in den Schlagzeilen.</p>`;
  })();

  /* ---------- Indizes ---------- */
  segButtons($("#seg-range"), RANGES, state.range, (v) => { state.range = v; store.set("mp-range", v); renderIndices(); }, RANGE_BTN);
  function renderIndices() {
    const regions = [...new Set(I.map((x) => x.region))];
    $("#index-groups").innerHTML = regions.map((rg) => {
      const list = I.filter((x) => x.region === rg);
      return `<h3 class="group-title">${esc(rg)}</h3><div class="cards" data-list="${list.map((x) => x.id).join(",")}">${list.map((x) => indexCard(x, state.range)).join("")}</div>`;
    }).join("");
  }

  /* ---------- Vergleich ---------- */
  const scaleOf = { "1T": 2, "1W": 4, "1M": 8, "3M": 12, YTD: 20, "1J": 25, "3J": 50, "5J": 80, "10J": 200 };
  const heatBg = (v, scale) => (v == null ? "" : `background:color-mix(in srgb, var(${v >= 0 ? "--up" : "--down"}) ${(Math.min(1, Math.abs(v) / scale) * 40 + 5).toFixed(0)}%, var(--surface));`);
  const TABLE = {
    Entwicklung: [["name", "Index"], ["last", "Stand"], ["1T", "1 Tag"], ["1W", "1 Woche"], ["1M", "1 Monat"], ["YTD", "Seit 1.1."], ["1J", "1 Jahr"], ["5J", "5 Jahre"], ["10J", "10 Jahre"]],
    Kennzahlen: [["name", "Index"], ["pe", "KGV"], ["divYield", "Dividende"], ["vol30", "Volatilität"], ["rsi14", "RSI"], ["vsSma200", "zur 200-Tage-Linie"], ["range", "52-Wochen-Spanne"]],
  };
  const NOTES = {
    Entwicklung: "Grün steht für Gewinne, Rot für Verluste, je kräftiger die Farbe, desto größer die Bewegung.",
    Kennzahlen: "KGV und Dividendenrendite stammen aus einem ETF auf den jeweiligen Markt. Volatilität: Schwankung der letzten 30 Handelstage, aufs Jahr gerechnet. RSI über 70 gilt als überkauft, unter 30 als überverkauft.",
  };
  const rangePos = (x) => (x.high52 > x.low52 ? ((x.last - x.low52) / (x.high52 - x.low52)) * 100 : 50);
  const val = (x, k) => (k in x.perf ? x.perf[k] : k === "range" ? rangePos(x) : x[k]);
  function cell(x, k) {
    if (k === "name") return `<td>${x.flag} <b>${esc(x.name)}</b></td>`;
    if (k === "last") return `<td class="num">${fmt(x.last, pxDec(x.last))}</td>`;
    if (k in scaleOf) return `<td class="num heat" style="${heatBg(x.perf[k], scaleOf[k])}">${fmtP(x.perf[k])}</td>`;
    if (k === "pe") return `<td class="num">${fmt(x.pe, 1)}</td>`;
    if (k === "divYield") return `<td class="num">${x.divYield != null ? fmt(x.divYield, 2) + " %" : "–"}</td>`;
    if (k === "pb") return `<td class="num">${fmt(x.pb, 2)}</td>`;
    if (k === "vol30") return `<td class="num">${x.vol30 != null ? fmt(x.vol30, 1) + " %" : "–"}</td>`;
    if (k === "rsi14") return `<td class="num">${fmt(x.rsi14, 0)}${x.rsi14 >= 70 ? " · überkauft" : x.rsi14 <= 30 ? " · überverkauft" : ""}</td>`;
    if (k === "vsSma200") return `<td class="num ${cls(x.vsSma200)}-t">${fmtP(x.vsSma200)}</td>`;
    if (k === "range") return `<td><span class="mrange" title="${fmt(x.low52, 0)} bis ${fmt(x.high52, 0)}"><i style="left:calc(${Math.max(0, Math.min(100, rangePos(x))).toFixed(0)}% - 1px)"></i></span></td>`;
    return "<td></td>";
  }
  segButtons($("#seg-table"), Object.keys(TABLE), state.tableMode, (v) => { state.tableMode = v; state.sortKey = null; renderTable(); });
  function renderTable() {
    const cols = TABLE[state.tableMode];
    const rows = [...I];
    if (state.sortKey) rows.sort((a, b) => { const va = val(a, state.sortKey), vb = val(b, state.sortKey); return typeof va === "string" ? va.localeCompare(vb) * state.sortDir : ((va ?? -1e9) - (vb ?? -1e9)) * state.sortDir; });
    $("#tbl thead").innerHTML = "<tr>" + cols.map(([k, n]) => `<th scope="col" data-k="${k}" ${state.sortKey === k ? `aria-sort="${state.sortDir > 0 ? "ascending" : "descending"}"` : ""}>${n}</th>`).join("") + "</tr>";
    $("#tbl tbody").innerHTML = rows.map((x) => `<tr data-open="${x.id}">${cols.map(([k]) => cell(x, k)).join("")}</tr>`).join("");
    $("#tbl tbody").dataset.list = rows.map((x) => x.id).join(",");
    $("#tbl-note").textContent = NOTES[state.tableMode];
  }
  $("#tbl thead").addEventListener("click", (e) => {
    const th = e.target.closest("th"); if (!th) return;
    const k = th.dataset.k; if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = k === "name" ? 1 : -1; }
    renderTable();
  });
  segButtons($("#seg-sec"), ["1T", "1W", "1M", "YTD", "1J"], state.secPeriod, (v) => { state.secPeriod = v; renderSectors(); });
  function renderSectors() {
    const p = state.secPeriod; const S = [...(data.sectors || [])].sort((a, b) => (b.perf[p] ?? 0) - (a.perf[p] ?? 0));
    $("#sectors").innerHTML = S.map((s) => `<div class="sector" style="${heatBg(s.perf[p], scaleOf[p])}"><b>${esc(s.name)}</b><span class="num">${fmtP(s.perf[p])}</span></div>`).join("");
  }

  /* ---------- Umfeld ---------- */
  (function macro() {
    const groups = ["Volatilität", "Zinsen", "Währungen", "Rohstoffe", "Krypto"];
    $("#macro-groups").innerHTML = groups.map((g) => {
      const list = Object.values(M).filter((m) => m.group === g); if (!list.length) return "";
      return `<h3 class="group-title">${esc(g)}</h3><div class="tiles" data-list="${list.filter((m) => m.daily).map((m) => m.id).join(",")}">${list.map((m) => macroTile(m)).join("")}</div>`;
    }).join("");
  })();

  renderRates();

  /* ---------- Risiken ---------- */
  (function risks() {
    const R = data.risks || [];
    $("#risks").innerHTML = R.map((r, i) => `<details class="risk" ${i === 0 ? "open" : ""}><summary><span class="t">${esc(r.name)}</span><span class="cnt">${r.count} ${r.count === 1 ? "Meldung" : "Meldungen"}</span>${lvl(r)}</summary>
      <ul>${r.headlines.length ? r.headlines.map((h) => `<li><a href="${esc(h.link)}" target="_blank" rel="noopener">${esc(h.title)}</a><small>${esc(h.source)}${h.date ? " · " + dTime(h.date) : ""}</small></li>`).join("") : "<li><small>Derzeit keine relevanten Schlagzeilen.</small></li>"}</ul></details>`).join("");
    const n = R.length; if (n < 3) return;
    const cx = 170, cy = 165, rad = 112, mx = Math.max(...R.map((r) => r.score || 0), 1);
    const P = (i, f) => { const a = -Math.PI / 2 + (i / n) * 2 * Math.PI; return [cx + Math.cos(a) * rad * f, cy + Math.sin(a) * rad * f]; };
    let g = "";
    for (const f of [0.25, 0.5, 0.75, 1]) g += `<polygon points="${R.map((_, i) => P(i, f).join(",")).join(" ")}" fill="none" stroke="var(--line)"/>`;
    R.forEach((r, i) => { const [x, y] = P(i, 1); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)"/>`; const [lx, ly] = P(i, 1.2); g += `<text x="${lx}" y="${ly + 4}" text-anchor="${Math.abs(lx - cx) < 10 ? "middle" : lx < cx ? "end" : "start"}" font-size="12" fill="var(--muted)">${esc(r.name.split(" ")[0])}</text>`; });
    const poly = R.map((r, i) => P(i, 0.08 + 0.92 * ((r.score || 0) / mx)).join(",")).join(" ");
    $("#radar").innerHTML = `<svg viewBox="-45 0 430 330" class="radar" role="img" aria-label="Risiko-Radar">${g}<polygon points="${poly}" fill="var(--yellow)" fill-opacity=".55" stroke="var(--fg)" stroke-width="1.5"/></svg>`;
    const N = (data.news || []).slice(0, 12);
    $("#news").innerHTML = N.map((h) => `<a href="${esc(h.link)}" target="_blank" rel="noopener"><b>${esc(h.title)}</b><small>${esc(h.source)}${h.date ? " · " + dTime(h.date) : ""}</small></a>`).join("");
  })();

  /* ---------- Farbskalen für Bewertungen ---------- */
  // Grün = günstig bewertet, Rot = teuer; je weiter vom Mittelwert entfernt, desto kräftiger.
  const SCALES = {
    pe: { lo: 10, mid: 17, hi: 28 },
    fpe: { lo: 9, mid: 15, hi: 24 },
    pb: { lo: 1, mid: 2.2, hi: 5 },
    divYield: { lo: 1, mid: 2.5, hi: 4.5, invert: true },
  };
  function valTone(key, v) {
    const sc = SCALES[key]; if (!sc || v == null) return null;
    let t = v <= sc.mid ? -(sc.mid - v) / (sc.mid - sc.lo) : (v - sc.mid) / (sc.hi - sc.mid);
    t = Math.max(-1, Math.min(1, t));
    return sc.invert ? -t : t;
  }
  const toneBg = (t, strength = 46) => (t == null ? "" : `background:color-mix(in srgb, var(${t < 0 ? "--up" : "--down"}) ${(Math.abs(t) * strength + 6).toFixed(0)}%, var(--surface));`);
  const toneWord = (key, t) => {
    if (t == null) return "";
    if (key === "divYield") return t < -0.5 ? "hoch" : t < -0.15 ? "eher hoch" : t <= 0.15 ? "im Mittelfeld" : t <= 0.5 ? "eher niedrig" : "niedrig";
    return t < -0.5 ? "günstig" : t < -0.15 ? "eher günstig" : t <= 0.15 ? "im Mittelfeld" : t <= 0.5 ? "eher teuer" : "teuer";
  };
  const fmtVal = (key, v) => (v == null ? "–" : key === "divYield" ? fmt(v, 2) + " %" : fmt(v, key === "pb" ? 2 : 1));

  /* ---------- Kennzahlen ---------- */
  const VAL = {
    pe: { label: "KGV", sub: "Kurs-Gewinn-Verhältnis, letzte 12 Monate", get: (x) => x.pe },
    fpe: { label: "Forward-KGV", sub: "auf die erwarteten Gewinne der nächsten 12 Monate", get: (x) => x.fpe },
    divYield: { label: "Dividendenrendite", sub: "Ausschüttungen der letzten 12 Monate zum Kurs", get: (x) => x.divYield },
    pb: { label: "Kurs-Buchwert (KBV)", sub: "Börsenwert im Verhältnis zum Eigenkapital", get: (x) => x.pb },
  };
  const yc10 = (RT.items || []).find((r) => r.id === "yc10y");
  state.kzId = byIdOk(store.get("mp-kz")) || "atx"; state.kzMetric = "pe";
  function byIdOk(id) { return id && I.some((x) => x.id === id) ? id : null; }
  function pickChips(el, list, cur, cb) {
    el.innerHTML = list.map((x) => `<button type="button" class="chip" aria-pressed="${x.id === cur}" data-v="${x.id}">${x.flag || ""} ${esc(x.name)}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (b) cb(b.dataset.v); };
  }
  function renderKennzahlen() {
    const x = I.find((i) => i.id === state.kzId) || I[0];
    pickChips($("#kz-pick"), I, x.id, (v) => { state.kzId = v; store.set("mp-kz", v); renderKennzahlen(); });
    $("#kz-title").textContent = `${x.flag} ${x.name}`;
    $("#kz-src").textContent = `Bewertung aus ${x.valSource}. Grün heißt im Vergleich günstig, Rot teuer.`;
    const big = Object.entries(VAL).map(([key, m]) => {
      const v = m.get(x), t = valTone(key, v);
      const all = I.map((i) => m.get(i)).filter((q) => q != null).sort((a, b) => a - b);
      const rank = v == null ? null : (key === "divYield" ? all.filter((q) => q > v).length : all.filter((q) => q < v).length) + 1;
      const lo = all[0], hi = all[all.length - 1], pos = v == null || hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100;
      return `<div class="kz-big" style="${toneBg(t, 40)}">
        <div class="kz-l">${m.label}</div>
        <div class="kz-v num">${fmtVal(key, v)}</div>
        <div class="kz-w">${v == null ? "Für diesen Markt nicht verfügbar" : `${toneWord(key, t)} · Platz ${rank} von ${all.length}${key === "divYield" ? " (höchste zuerst)" : " (günstigste zuerst)"}`}</div>
        ${v == null ? "" : `<div class="kz-range"><i style="left:${pos.toFixed(1)}%"></i></div><div class="kz-rl num"><span>${fmtVal(key, lo)}</span><span>${fmtVal(key, hi)}</span></div>`}
        <div class="kz-s">${m.sub}</div></div>`;
    }).join("");
    const growth = x.pe && x.fpe ? (x.pe / x.fpe - 1) * 100 : null;
    const ey = x.fpe || x.pe ? 100 / (x.fpe || x.pe) : null;
    const prem = ey != null && yc10 ? ey - yc10.last : null;
    const small = [
      ["Erwartetes Gewinnwachstum", growth != null ? fmtP(growth) : "–", "Wie stark die Gewinne laut Analysten in 12 Monaten steigen sollen (aus KGV und Forward-KGV)."],
      ["Gewinnrendite", ey != null ? fmt(ey, 2) + " %" : "–", `Erwarteter Gewinn je 100 € Börsenwert (1 ÷ ${x.fpe ? "Forward-KGV" : "KGV"}).`],
      ["Abstand zu Anleihen", prem != null ? fmtPkt(prem) : "–", yc10 ? `Gewinnrendite minus Rendite 10-jähriger AAA-Staatsanleihen (${fmt(yc10.last, 2)} %). Je höher, desto attraktiver Aktien gegenüber Anleihen.` : ""],
      ["Volatilität (30 Tage)", x.vol30 != null ? fmt(x.vol30, 1) + " %" : "–", "Schwankungsbreite der letzten 30 Handelstage, aufs Jahr gerechnet."],
    ].map(([l, v, h]) => `<div class="kz-small"><div class="kz-l">${l}</div><div class="kz-v2 num">${v}</div><div class="kz-s">${h}</div></div>`).join("");
    $("#kz-big").innerHTML = big;
    $("#kz-small").innerHTML = small;
    renderKzCompare();
    renderKzMatrix();
  }
  segButtons($("#kz-metric"), Object.keys(VAL), state.kzMetric, (v) => { state.kzMetric = v; renderKzCompare(); }, { pe: "KGV", fpe: "Forward-KGV", divYield: "Dividende", pb: "KBV" });
  function renderKzCompare() {
    const key = state.kzMetric, m = VAL[key];
    const rows = I.filter((x) => m.get(x) != null).sort((a, b) => (key === "divYield" ? m.get(b) - m.get(a) : m.get(a) - m.get(b)));
    const mx = Math.max(...rows.map((x) => m.get(x)));
    $("#kz-bars").innerHTML = rows.map((x) => {
      const v = m.get(x), t = valTone(key, v);
      return `<button type="button" class="bar-row" data-v="${x.id}" aria-pressed="${x.id === state.kzId}">
        <span class="bar-n">${x.flag} ${esc(x.name)}</span>
        <span class="bar-t"><i style="width:${((v / mx) * 100).toFixed(1)}%;${toneBg(t, 70).replace("background:", "background:")}"></i></span>
        <span class="bar-v num">${fmtVal(key, v)}</span></button>`;
    }).join("") + (I.length > rows.length ? `<p class="foot-note">Ohne Wert: ${I.filter((x) => m.get(x) == null).map((x) => esc(x.name)).join(", ")}.</p>` : "");
    $("#kz-bars").onclick = (e) => { const b = e.target.closest(".bar-row"); if (!b) return; state.kzId = b.dataset.v; store.set("mp-kz", b.dataset.v); renderKennzahlen(); };
  }
  function renderKzMatrix() {
    $("#kz-matrix thead").innerHTML = `<tr><th>Index</th><th>KGV</th><th>Forward-KGV</th><th>Gewinnwachstum</th><th>Dividende</th><th>KBV</th><th>Quelle</th></tr>`;
    $("#kz-matrix tbody").innerHTML = I.map((x) => {
      const g = x.pe && x.fpe ? (x.pe / x.fpe - 1) * 100 : null;
      const td = (key, v) => `<td class="num heat" style="${toneBg(valTone(key, v), 46)}">${fmtVal(key, v)}</td>`;
      return `<tr data-kz="${x.id}" class="${x.id === state.kzId ? "sel" : ""}"><td>${x.flag} <b>${esc(x.name)}</b></td>${td("pe", x.pe)}${td("fpe", x.fpe)}<td class="num">${fmtP(g)}</td>${td("divYield", x.divYield)}${td("pb", x.pb)}<td class="src">${esc(x.valSource)}</td></tr>`;
    }).join("");
    $("#kz-matrix tbody").onclick = (e) => { const tr = e.target.closest("tr"); if (!tr) return; state.kzId = tr.dataset.kz; renderKennzahlen(); scrollTo({ top: 0, behavior: "smooth" }); };
  }

  /* ---------- Einzelwerte: Kachelkarte nach Börsenwert ---------- */
  const EW_IDS = I.map((x) => x.id).filter((id) => MB[id]);
  state.ewId = EW_IDS.includes(store.get("mp-ew")) ? store.get("mp-ew") : EW_IDS[0];
  state.ewPeriod = "1T"; state.ewSort = { k: "mcap", dir: -1 };
  function squarify(items, X, Y, W, H) {
    const total = items.reduce((a, b) => a + b.v, 0), out = [];
    if (!total || W <= 0 || H <= 0) return out;
    let rest = items.filter((it) => it.v > 0).map((it) => ({ ...it, a: (it.v / total) * W * H }));
    let x = X, y = Y, w = W, h = H;
    while (rest.length) {
      const short = Math.min(w, h); let row = [], best = Infinity, i = 0;
      while (i < rest.length) {
        const cand = row.concat(rest[i]); const sum = cand.reduce((a, b) => a + b.a, 0);
        const mxA = Math.max(...cand.map((c) => c.a)), mnA = Math.min(...cand.map((c) => c.a));
        const worst = Math.max((short * short * mxA) / (sum * sum), (sum * sum) / (short * short * mnA));
        if (worst > best && row.length) break;
        best = worst; row = cand; i++;
      }
      const sum = row.reduce((a, b) => a + b.a, 0);
      if (w >= h) { const cw = sum / h; let yy = y; row.forEach((r) => { const rh = r.a / cw; out.push({ ...r, x, y: yy, w: cw, h: rh }); yy += rh; }); x += cw; w -= cw; }
      else { const rh = sum / w; let xx = x; row.forEach((r) => { const rw = r.a / rh; out.push({ ...r, x: xx, y, w: rw, h: rh }); xx += rw; }); y += rh; h -= rh; }
      rest = rest.slice(row.length);
    }
    return out;
  }
  const shortName = (n) => n.replace(/\b(AG|SE|S\.A\.|SA|N\.V\.|NV|PLC|Inc\.?|Corporation|Corp\.?|Holding|Holdings|Group|Co\.|KGaA|Aktiengesellschaft|Ltd|LTD|N|I|Class [A-C]|Kat\. A)\b\.?/g, "").replace(/\s{2,}/g, " ").replace(/[\s,&.-]+$/, "").trim();
  const perfBg = (v, scale) => (v == null ? "background:var(--surface-2)" : `background:color-mix(in srgb, var(${v >= 0 ? "--up" : "--down"}) ${(Math.min(1, Math.abs(v) / scale) * 58 + 8).toFixed(0)}%, var(--surface))`);
  function renderEinzelwerte() {
    if (!EW_IDS.length) return;
    const g = MB[state.ewId], x = I.find((i) => i.id === state.ewId), p = state.ewPeriod, sc = scaleOf[p] || 8;
    pickChips($("#ew-pick"), I.filter((i) => MB[i.id]), state.ewId, (v) => { state.ewId = v; store.set("mp-ew", v); renderEinzelwerte(); });
    $("#ew-note").textContent = `${x.flag} ${x.name}: ${g.count} Werte (${g.note}). Fläche = Börsenwert, Farbe = Entwicklung ${RANGE_CAP[p] === "Letzter Handelstag" ? "am letzten Handelstag" : "über " + RANGE_CAP[p]}. Anklicken öffnet den Chart.`;
    const box = $("#ew-map"), W = box.clientWidth || 900, H = Math.round(Math.max(420, Math.min(640, W * 0.56)));
    box.style.height = H + "px";
    const bySec = {};
    g.members.forEach((m) => (bySec[m.sector] ||= []).push(m));
    const secs = Object.entries(bySec).map(([n, ms]) => ({ n, ms, v: ms.reduce((a, b) => a + b.mcap, 0) })).sort((a, b) => b.v - a.v);
    let html = "";
    const list = g.members.map((m) => "s:" + m.t).join(",");
    for (const sr of squarify(secs, 0, 0, W, H)) {
      const head = sr.h > 60 && sr.w > 70 ? 18 : 0;
      html += `<div class="tm-sec" style="left:${sr.x}px;top:${sr.y}px;width:${sr.w}px;height:${sr.h}px">${head ? `<span>${esc(sr.n)}</span>` : ""}</div>`;
      for (const r of squarify(sr.ms.map((m) => ({ ...m, v: m.mcap })), sr.x, sr.y + head, sr.w, sr.h - head)) {
        const v = r.perf[p], area = r.w * r.h;
        const fs = Math.max(10, Math.min(20, Math.sqrt(area) / 7, r.w / 6, r.h / 2.8));
        const show = r.w > 44 && r.h > fs * 2.3 + 6, big = area > 9000 && r.h > fs * 3.4 + 10;
        html += `<button type="button" class="tm" data-open="s:${esc(r.t)}" title="${esc(r.n)} · ${fmtP(v)} · ${fmt(r.mcap, 1)} Mrd. ${esc(r.cur || "")}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;${perfBg(v, sc)};font-size:${fs.toFixed(1)}px">
          ${show ? `<b>${esc(shortName(r.n))}</b><span class="num">${fmtP(v)}</span>${big ? `<small>${fmt(r.w ? r.mcap : 0, 0)} Mrd.</small>` : ""}` : ""}</button>`;
      }
    }
    box.innerHTML = html; box.dataset.list = list;
    const ranked = g.members.filter((m) => m.perf[p] != null).sort((a, b) => b.perf[p] - a.perf[p]);
    const li = (m) => `<button type="button" class="mover" data-open="s:${esc(m.t)}"><span>${esc(shortName(m.n))}</span><b class="num ${cls(m.perf[p])}-t">${fmtP(m.perf[p])}</b></button>`;
    $("#ew-top").innerHTML = ranked.slice(0, 5).map(li).join(""); $("#ew-top").dataset.list = list;
    $("#ew-flop").innerHTML = ranked.slice(-5).reverse().map(li).join(""); $("#ew-flop").dataset.list = list;
    const upN = ranked.filter((m) => m.perf[p] > 0).length;
    $("#ew-breadth").innerHTML = `<div class="breadth"><i style="width:${((upN / ranked.length) * 100).toFixed(1)}%"></i></div><p class="foot-note">${upN} von ${ranked.length} Werten im Plus, ${ranked.length - upN} im Minus.</p>`;
    renderEwTable();
  }
  segButtons($("#ew-period"), ["1T", "1W", "1M", "YTD", "1J"], state.ewPeriod, (v) => { state.ewPeriod = v; renderEinzelwerte(); });
  function renderEwTable() {
    const g = MB[state.ewId], p = state.ewPeriod, { k, dir } = state.ewSort;
    const cols = [["n", "Unternehmen"], ["sector", "Branche"], ["mcap", "Börsenwert (Mrd.)"], ["w", "Gewicht"], ["perf", RANGE_CAP[p]], ["pe", "KGV"], ["fpe", "Forward-KGV"], ["dy", "Dividende"]];
    const get = (m, key) => (key === "perf" ? m.perf[p] : m[key]);
    const rows = [...g.members].sort((a, b) => { const va = get(a, k), vb = get(b, k); return typeof va === "string" ? va.localeCompare(vb) * dir : ((va ?? -1e9) - (vb ?? -1e9)) * dir; });
    $("#ew-table thead").innerHTML = "<tr>" + cols.map(([key, n]) => `<th data-k="${key}" ${k === key ? `aria-sort="${dir > 0 ? "ascending" : "descending"}"` : ""}>${n}</th>`).join("") + "</tr>";
    $("#ew-table tbody").innerHTML = rows.map((m) => `<tr data-open="s:${esc(m.t)}"><td><b>${esc(m.n)}</b></td><td class="src">${esc(m.sector)}</td><td class="num">${fmt(m.mcap, 1)}</td><td class="num">${fmt(m.w, 1)} %</td>
      <td class="num heat" style="${heatBg(m.perf[p], scaleOf[p] || 8)}">${fmtP(m.perf[p])}</td>
      <td class="num heat" style="${toneBg(valTone("pe", m.pe))}">${fmt(m.pe, 1)}</td><td class="num heat" style="${toneBg(valTone("fpe", m.fpe))}">${fmt(m.fpe, 1)}</td>
      <td class="num heat" style="${toneBg(valTone("divYield", m.dy))}">${m.dy != null ? fmt(m.dy, 2) + " %" : "–"}</td></tr>`).join("");
    $("#ew-table tbody").dataset.list = rows.map((m) => "s:" + m.t).join(",");
  }
  $("#ew-table thead").addEventListener("click", (e) => {
    const th = e.target.closest("th"); if (!th) return; const k = th.dataset.k;
    state.ewSort = state.ewSort.k === k ? { k, dir: -state.ewSort.dir } : { k, dir: k === "n" || k === "sector" ? 1 : -1 };
    renderEwTable();
  });

  /* ---------- Zinsen Euroraum ---------- */
  function rateTile(r, withSpark = true) {
    const asOf = r.freq === "M" ? "Ø " + new Date(r.date + "-01").toLocaleDateString(LOC, { month: "short", year: "numeric" }) : new Date(r.date).toLocaleDateString(LOC, { day: "2-digit", month: "2-digit" });
    return `<button type="button" class="tile" data-open="r:${r.id}" aria-label="${esc(r.name)}: Chart groß öffnen">
      <div class="row"><span class="nm">${esc(r.name)}</span>${r.chg1J != null ? `<span class="chg neutral num" title="Veränderung in 12 Monaten">${fmtPkt(r.chg1J)} 1 J</span>` : ""}</div>
      <div class="v num">${fmt(r.last, 3)} <small>%</small></div>
      ${withSpark ? spark(r.hist.slice(-260), "var(--muted)") : ""}<div class="note">${esc(asOf)} · ${esc(r.note)}</div></button>`;
  }
  function renderRates() {
    const items = RT.items || []; if (!items.length) { $("#rates").innerHTML = ""; return; }
    const grp = [["Leitzinsen & Tagesgeld", ["dfr", "mrr", "estr"]], ["Euribor", ["euribor1m", "euribor3m", "euribor6m", "euribor12m"]], ["Renditen für Fixzins-Laufzeiten", ["yc2y", "yc5y", "yc10y", "yc20y"]]];
    $("#rates").innerHTML = grp.map(([t, ids]) => {
      const list = ids.map((id) => items.find((r) => r.id === id)).filter(Boolean); if (!list.length) return "";
      return `<h3 class="group-title">${t}</h3><div class="tiles" data-list="${list.map((r) => "r:" + r.id).join(",")}">${list.map((r) => rateTile(r)).join("")}</div>`;
    }).join("");
    const c = RT.curve; if (!c) return;
    const W = 640, H = 260, L = 44, R = 16, T = 16, B = 34;
    const all = [...c.now, ...c.m1, ...c.y1].filter((v) => v != null);
    let mn = Math.floor(Math.min(...all) * 4) / 4 - 0.25, mx = Math.ceil(Math.max(...all) * 4) / 4 + 0.25;
    const X = (i) => L + (i / (c.tenors.length - 1)) * (W - L - R), Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
    const path = (arr) => arr.map((v, i) => (v == null ? "" : `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join("");
    let g = "";
    for (let t = Math.ceil(mn * 2) / 2; t <= mx; t += 0.5) g += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)"/><text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmt(t, 1)} %</text>`;
    c.tenors.forEach((tn, i) => (g += `<text x="${X(i)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--muted)">${tn.replace("Y", " J")}</text>`));
    $("#curve").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Zinskurve Euroraum">${g}
      <path d="${path(c.y1)}" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="5 4"/>
      <path d="${path(c.m1)}" fill="none" stroke="var(--ind-2)" stroke-width="1.6"/>
      <path d="${path(c.now)}" fill="none" stroke="var(--fg)" stroke-width="2.6"/>
      ${c.now.map((v, i) => (v == null ? "" : `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="var(--fg)"/>`)).join("")}</svg>
      <div class="legend"><span><i style="background:var(--fg)"></i>Aktuell (${new Date(c.date).toLocaleDateString(LOC)})</span><span><i style="background:var(--ind-2)"></i>Vor 1 Monat</span><span><i class="dash"></i>Vor 1 Jahr</span></div>`;
  }

  /* ---------- Chartanalyse ---------- */
  const TA_TOOLS = [["sma20", "20-Tage-Linie"], ["sma50", "50-Tage-Linie"], ["sma200", "200-Tage-Linie"], ["boll", "Bollinger-Bänder"], ["sr", "Unterstützung & Widerstand"], ["trend", "Trendkanal"], ["rsi", "RSI"], ["macd", "MACD"]];
  const TA_RANGES = ["3M", "6M", "1J", "3J", "5J", "10J"];
  state.taId = store.get("mp-ta") && ALL[store.get("mp-ta")] ? store.get("mp-ta") : "atx";
  state.taRange = "1J";
  try { state.taTools = new Set(JSON.parse(store.get("mp-tools") || "null") || ["sma50", "sma200", "rsi"]); } catch { state.taTools = new Set(["sma50", "sma200", "rsi"]); }
  const sma = (a, n) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  const ema = (a, n) => { const o = new Array(a.length).fill(null), k = 2 / (n + 1); let e = null; for (let i = 0; i < a.length; i++) { if (a[i] == null) continue; e = e == null ? a[i] : a[i] * k + e * (1 - k); o[i] = e; } return o; };
  const stdev = (a, n, m) => a.map((_, i) => { if (i < n - 1) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (a[j] - m[i]) ** 2; return Math.sqrt(s / n); });
  function rsiArr(a, n = 14) {
    const o = new Array(a.length).fill(null); let up = 0, dn = 0;
    for (let i = 1; i < a.length; i++) {
      const d = a[i] - a[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0);
      if (i <= n) { up += u / n; dn += w / n; if (i === n) o[i] = dn ? 100 - 100 / (1 + up / dn) : 100; }
      else { up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + w) / n; o[i] = dn ? 100 - 100 / (1 + up / dn) : 100; }
    }
    return o;
  }
  function lastCross(a, b, from = 0) { // letzter Schnittpunkt zweier Linien: {i, up}
    for (let i = a.length - 1; i > Math.max(from, 0); i--) {
      if (a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) continue;
      const now = a[i] - b[i], prev = a[i - 1] - b[i - 1];
      if ((now > 0) !== (prev > 0)) return { i, up: now > 0 };
    }
    return null;
  }
  function pivots(v, i0, win = 8) { // markante Hochs/Tiefs im Zeitraum, zu Preiszonen gebündelt
    const lv = [];
    for (let i = Math.max(i0, win); i < v.length - win; i++) {
      let hi = true, lo = true;
      for (let j = i - win; j <= i + win; j++) { if (v[j] > v[i]) hi = false; if (v[j] < v[i]) lo = false; }
      if (hi || lo) lv.push(v[i]);
    }
    lv.sort((a, b) => a - b);
    const zones = [];
    for (const p of lv) { const z = zones[zones.length - 1]; if (z && p / z.avg - 1 < 0.015) { z.n++; z.sum += p; z.avg = z.sum / z.n; } else zones.push({ n: 1, sum: p, avg: p }); }
    const last = v[v.length - 1];
    const above = zones.filter((z) => z.avg > last * 1.003).sort((a, b) => a.avg - b.avg).slice(0, 2);
    const below = zones.filter((z) => z.avg < last * 0.997).sort((a, b) => b.avg - a.avg).slice(0, 2);
    return { above, below };
  }
  function taOptions() {
    const sel = $("#ta-pick");
    const grp = (label, list) => `<optgroup label="${label}">${list.map((x) => `<option value="${x.id}" ${x.id === state.taId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`;
    sel.innerHTML = grp("Indizes", I) + grp("Rohstoffe, Währungen, Volatilität", Object.values(M).filter((m) => m.daily && m.group !== "Zinsen"));
    sel.onchange = () => { state.taId = sel.value; store.set("mp-ta", sel.value); renderAnalyse(); };
    $("#ta-tools").innerHTML = TA_TOOLS.map(([k, n]) => `<button type="button" class="chip tool" data-k="${k}" aria-pressed="${state.taTools.has(k)}"><i class="sw sw-${k}"></i>${n}</button>`).join("");
    $("#ta-tools").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const k = b.dataset.k; state.taTools.has(k) ? state.taTools.delete(k) : state.taTools.add(k);
      b.setAttribute("aria-pressed", state.taTools.has(k)); store.set("mp-tools", JSON.stringify([...state.taTools])); renderAnalyse();
    };
  }
  segButtons($("#ta-range"), TA_RANGES, state.taRange, (v) => { state.taRange = v; renderAnalyse(); });
  function renderAnalyse() {
    const x = ALL[state.taId]; if (!x || !x.daily) return;
    const d = x.daily, dates = d.map((q) => q[0]), v = d.map((q) => q[1]), n = v.length;
    const cutD = new Date(dates[n - 1]); cutD.setDate(cutD.getDate() - RANGE_DAYS[state.taRange]);
    const cut = cutD.toISOString().slice(0, 10); let i0 = 0; while (i0 < n - 1 && dates[i0] < cut) i0++;
    const T = state.taTools, dec = x.dec ?? pxDec(v[n - 1]);
    const s20 = sma(v, 20), s50 = sma(v, 50), s200 = sma(v, 200);
    const sd20 = stdev(v, 20, s20), bu = s20.map((m, i) => (m == null ? null : m + 2 * sd20[i])), bl = s20.map((m, i) => (m == null ? null : m - 2 * sd20[i]));
    const rsi = rsiArr(v), e12 = ema(v, 12), e26 = ema(v, 26), macd = e12.map((a, i) => (a == null || e26[i] == null ? null : a - e26[i]));
    const sig = ema(macd.map((q) => q ?? 0), 9).map((q, i) => (i < 34 ? null : q)), hist = macd.map((m, i) => (m == null || sig[i] == null ? null : m - sig[i]));
    // Trendkanal: lineare Regression auf den logarithmierten Kurs im Zeitraum
    let reg = null;
    if (T.has("trend")) {
      const xs = [], ys = []; for (let i = i0; i < n; i++) { xs.push(i); ys.push(Math.log(v[i])); }
      const mxx = xs.reduce((a, b) => a + b, 0) / xs.length, myy = ys.reduce((a, b) => a + b, 0) / ys.length;
      let sxy = 0, sxx = 0; xs.forEach((q, k) => { sxy += (q - mxx) * (ys[k] - myy); sxx += (q - mxx) ** 2; });
      const b = sxy / sxx, a = myy - b * mxx; const res = ys.map((q, k) => q - (a + b * xs[k]));
      const sdv = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / res.length);
      reg = { a, b, sdv };
    }
    const sr = T.has("sr") ? pivots(v, i0) : null;
    // Zeichnen
    const box = $("#ta-main"), W = Math.max(320, box.clientWidth), narrow = W < 560;
    const L = 6, R = narrow ? 56 : 72, H = narrow ? 300 : 400, Tp = 14, B = 26;
    const N = n - i0, X = (i) => L + ((i - i0) / Math.max(1, N - 1)) * (W - L - R);
    const lines = [v.slice(i0)];
    if (T.has("sma20")) lines.push(s20.slice(i0)); if (T.has("sma50")) lines.push(s50.slice(i0)); if (T.has("sma200")) lines.push(s200.slice(i0));
    if (T.has("boll")) { lines.push(bu.slice(i0)); lines.push(bl.slice(i0)); }
    const allv = lines.flat().filter((q) => q != null);
    let mn = Math.min(...allv), mx = Math.max(...allv); const pad = (mx - mn) * 0.06; mn -= pad; mx += pad;
    const Y = (q) => Tp + (1 - (q - mn) / (mx - mn)) * (H - Tp - B);
    const pth = (arr) => { let o = "", pen = false; for (let i = i0; i < n; i++) { const q = arr[i]; if (q == null) { pen = false; continue; } o += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(q).toFixed(1); pen = true; } return o; };
    const step = niceStep((mx - mn) / (narrow ? 4 : 6)); let g = "";
    for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) { const tt = Math.abs(t) < step / 1e6 ? 0 : t; g += `<line x1="${L}" x2="${W - R}" y1="${Y(tt)}" y2="${Y(tt)}" stroke="var(--grid)"/><text x="${W - R + 8}" y="${Y(tt) + 4}" font-size="11" fill="var(--muted)">${fmt(tt, step >= 1 ? 0 : step >= 0.1 ? 1 : 2)}</text>`; }
    const span = (new Date(dates[n - 1]) - new Date(dates[i0])) / 864e5, nX = narrow ? 3 : 6; let xl = "";
    for (let k = 0; k < nX; k++) { const i = i0 + Math.round((k / (nX - 1)) * (N - 1)); xl += `<text x="${X(i)}" y="${H - 6}" font-size="11" fill="var(--muted)" text-anchor="${k === 0 ? "start" : k === nX - 1 ? "end" : "middle"}">${span > 1500 ? dates[i].slice(0, 4) : new Date(dates[i]).toLocaleDateString(LOC, { month: "short", year: "2-digit" })}</text>`; }
    let ov = "";
    if (T.has("boll")) {
      let band = "", back = "";
      for (let i = i0; i < n; i++) if (bu[i] != null) band += (band ? "L" : "M") + X(i).toFixed(1) + " " + Y(bu[i]).toFixed(1);
      for (let i = n - 1; i >= i0; i--) if (bl[i] != null) back += "L" + X(i).toFixed(1) + " " + Y(bl[i]).toFixed(1);
      ov += `<path d="${band}${back}Z" fill="var(--ind-4)" fill-opacity=".12"/><path d="${pth(bu)}" fill="none" stroke="var(--ind-4)" stroke-width="1" stroke-dasharray="3 3"/><path d="${pth(bl)}" fill="none" stroke="var(--ind-4)" stroke-width="1" stroke-dasharray="3 3"/>`;
    }
    if (reg) {
      const y = (i, k) => Y(Math.exp(reg.a + reg.b * i + k * 2 * reg.sdv));
      for (const k of [-1, 0, 1]) ov += `<line x1="${X(i0)}" y1="${y(i0, k)}" x2="${X(n - 1)}" y2="${y(n - 1, k)}" stroke="var(--ind-5)" stroke-width="${k ? 1 : 1.6}" ${k ? 'stroke-dasharray="6 4"' : ""}/>`;
    }
    if (sr) {
      const lab = (z, t) => `<line x1="${L}" x2="${W - R}" y1="${Y(z.avg)}" y2="${Y(z.avg)}" stroke="var(${t === "W" ? "--down" : "--up"})" stroke-width="1.3" stroke-dasharray="8 4"/><text x="${L + 6}" y="${Y(z.avg) - 5}" font-size="11" font-weight="600" fill="var(${t === "W" ? "--down" : "--up"})">${t === "W" ? "Widerstand" : "Unterstützung"} ${fmt(z.avg, dec)}</text>`;
      ov += sr.above.map((z) => lab(z, "W")).join("") + sr.below.map((z) => lab(z, "U")).join("");
    }
    if (T.has("sma20")) ov += `<path d="${pth(s20)}" fill="none" stroke="var(--ind-3)" stroke-width="1.5"/>`;
    if (T.has("sma50")) ov += `<path d="${pth(s50)}" fill="none" stroke="var(--ind-1)" stroke-width="1.7"/>`;
    if (T.has("sma200")) ov += `<path d="${pth(s200)}" fill="none" stroke="var(--ind-2)" stroke-width="2"/>`;
    // Golden / Death Cross im Zeitraum markieren
    if (T.has("sma50") && T.has("sma200")) {
      for (let i = Math.max(i0 + 1, 200); i < n; i++) {
        if (s50[i] == null || s200[i] == null || s50[i - 1] == null || s200[i - 1] == null) continue;
        const a = s50[i] - s200[i], b = s50[i - 1] - s200[i - 1];
        if ((a > 0) !== (b > 0)) { const upX = a > 0; ov += `<g><circle cx="${X(i)}" cy="${Y(s200[i])}" r="6" fill="var(${upX ? "--up" : "--down"})" stroke="var(--surface)" stroke-width="2"/><text x="${X(i)}" y="${Y(s200[i]) + (upX ? 22 : -12)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(${upX ? "--up" : "--down"})">${upX ? "Golden Cross" : "Death Cross"}</text></g>`; }
      }
    }
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Chartanalyse ${esc(x.name)}">${g}${ov}
      <path d="${pth(v)}" fill="none" stroke="var(--chart)" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="${X(n - 1)}" cy="${Y(v[n - 1])}" r="4" fill="var(--chart)"/>${xl}
      <line class="hv" y1="${Tp}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/></svg>`;
    // Unterfenster RSI und MACD
    const sub = (id, on, draw) => { const el = $(id); el.hidden = !on; if (on) el.innerHTML = draw(); };
    const SH = narrow ? 110 : 130;
    sub("#ta-rsi", T.has("rsi"), () => {
      const Yr = (q) => 8 + (1 - q / 100) * (SH - 22);
      return `<div class="sub-l">RSI (14 Tage) <b class="num">${fmt(rsi[n - 1], 0)}</b></div><svg viewBox="0 0 ${W} ${SH}" width="${W}" height="${SH}">
        <rect x="${L}" y="${Yr(100)}" width="${W - L - R}" height="${Yr(70) - Yr(100)}" fill="var(--down)" fill-opacity=".08"/><rect x="${L}" y="${Yr(30)}" width="${W - L - R}" height="${Yr(0) - Yr(30)}" fill="var(--up)" fill-opacity=".08"/>
        ${[30, 50, 70].map((t) => `<line x1="${L}" x2="${W - R}" y1="${Yr(t)}" y2="${Yr(t)}" stroke="var(--grid)" ${t !== 50 ? 'stroke-dasharray="4 3"' : ""}/><text x="${W - R + 8}" y="${Yr(t) + 4}" font-size="11" fill="var(--muted)">${t}</text>`).join("")}
        <path d="${(() => { let o = "", pen = false; for (let i = i0; i < n; i++) { if (rsi[i] == null) { pen = false; continue; } o += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Yr(rsi[i]).toFixed(1); pen = true; } return o; })()}" fill="none" stroke="var(--ind-3)" stroke-width="1.5"/>
        <line class="hv" y1="0" y2="${SH}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/></svg>`;
    });
    sub("#ta-macd", T.has("macd"), () => {
      const vals = [...macd.slice(i0), ...sig.slice(i0)].filter((q) => q != null), m = Math.max(...vals.map(Math.abs), 1e-9);
      const Ym = (q) => SH / 2 - (q / m) * (SH / 2 - 10), bw = Math.max(1, (W - L - R) / N - 0.5);
      let bars = ""; for (let i = i0; i < n; i++) if (hist[i] != null) { const y0 = Ym(0), y1 = Ym(hist[i]); bars += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(y1 - y0).toFixed(1)}" fill="var(${hist[i] >= 0 ? "--up" : "--down"})" fill-opacity=".55"/>`; }
      const ln = (arr) => { let o = "", pen = false; for (let i = i0; i < n; i++) { if (arr[i] == null) { pen = false; continue; } o += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Ym(arr[i]).toFixed(1); pen = true; } return o; };
      return `<div class="sub-l">MACD (12, 26, 9) <span class="lg"><i style="background:var(--ind-1)"></i>MACD <i style="background:var(--ind-2)"></i>Signallinie</span></div><svg viewBox="0 0 ${W} ${SH}" width="${W}" height="${SH}">
        <line x1="${L}" x2="${W - R}" y1="${Ym(0)}" y2="${Ym(0)}" stroke="var(--grid)"/>${bars}
        <path d="${ln(macd)}" fill="none" stroke="var(--ind-1)" stroke-width="1.5"/><path d="${ln(sig)}" fill="none" stroke="var(--ind-2)" stroke-width="1.5"/>
        <line class="hv" y1="0" y2="${SH}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/></svg>`;
    });
    // Anzeige der Werte unter dem Mauszeiger, über alle Fenster synchron
    const read = $("#ta-read");
    const showAt = (i) => {
      const parts = [`<b>${new Date(dates[i]).toLocaleDateString(LOC)}</b>`, `Kurs <b class="num">${fmt(v[i], dec)}</b>`];
      if (T.has("sma20") && s20[i] != null) parts.push(`<i class="sw sw-sma20"></i>20 T <b class="num">${fmt(s20[i], dec)}</b>`);
      if (T.has("sma50") && s50[i] != null) parts.push(`<i class="sw sw-sma50"></i>50 T <b class="num">${fmt(s50[i], dec)}</b>`);
      if (T.has("sma200") && s200[i] != null) parts.push(`<i class="sw sw-sma200"></i>200 T <b class="num">${fmt(s200[i], dec)}</b>`);
      if (T.has("rsi") && rsi[i] != null) parts.push(`RSI <b class="num">${fmt(rsi[i], 0)}</b>`);
      if (T.has("macd") && macd[i] != null) parts.push(`MACD <b class="num">${fmt(macd[i], 2)}</b>`);
      read.innerHTML = parts.join('<span class="sep"></span>');
    };
    showAt(n - 1);
    const wrap = $("#ta-chart");
    wrap.onpointermove = (e) => {
      const r = box.getBoundingClientRect(); const fx = e.clientX - r.left;
      const i = Math.max(i0, Math.min(n - 1, i0 + Math.round(((fx - L) / (W - L - R)) * (N - 1))));
      $$(".hv", wrap).forEach((l) => { l.setAttribute("x1", X(i)); l.setAttribute("x2", X(i)); l.setAttribute("visibility", "visible"); });
      showAt(i);
    };
    wrap.onpointerleave = () => { $$(".hv", wrap).forEach((l) => l.setAttribute("visibility", "hidden")); showAt(n - 1); };
    // Signale in Worten
    const last = v[n - 1], cards = [];
    const card = (title, tone, value, text) => cards.push(`<div class="sigc"><div class="row"><b>${title}</b><span class="chg ${tone}">${value}</span></div><p>${text}</p></div>`);
    if (s200[n - 1] != null) { const dd = (last / s200[n - 1] - 1) * 100; card("Langfristiger Trend", dd >= 0 ? "up" : "down", dd >= 0 ? "Aufwärts" : "Abwärts", `Der Kurs liegt ${fmtP(dd)} ${dd >= 0 ? "über" : "unter"} der 200-Tage-Linie (${fmt(s200[n - 1], dec)}).`); }
    const cx = lastCross(s50, s200);
    if (cx) card("50- und 200-Tage-Linie", cx.up ? "up" : "down", cx.up ? "Golden Cross" : "Death Cross", `Die 50-Tage-Linie hat die 200-Tage-Linie am ${new Date(dates[cx.i]).toLocaleDateString(LOC)} von ${cx.up ? "unten nach oben" : "oben nach unten"} gekreuzt.`);
    if (rsi[n - 1] != null) { const r14 = rsi[n - 1]; card("Momentum (RSI)", r14 >= 70 ? "down" : r14 <= 30 ? "up" : "neutral", r14 >= 70 ? "Überkauft" : r14 <= 30 ? "Überverkauft" : "Neutral", `RSI ${fmt(r14, 0)}. Über 70 gilt ein Markt als heiß gelaufen, unter 30 als stark abverkauft.`); }
    const mc = lastCross(macd, sig, 40);
    if (macd[n - 1] != null && sig[n - 1] != null) { const pos = macd[n - 1] > sig[n - 1]; card("MACD", pos ? "up" : "down", pos ? "Positiv" : "Negativ", `Die MACD-Linie liegt ${pos ? "über" : "unter"} ihrer Signallinie${mc ? `, zuletzt gekreuzt am ${new Date(dates[mc.i]).toLocaleDateString(LOC)}` : ""}.`); }
    if (bu[n - 1] != null) { const pb = ((last - bl[n - 1]) / (bu[n - 1] - bl[n - 1])) * 100; card("Bollinger-Bänder", pb > 90 ? "down" : pb < 10 ? "up" : "neutral", pb > 90 ? "Am oberen Band" : pb < 10 ? "Am unteren Band" : "Innerhalb", `Kurs bei ${fmt(pb, 0)} % der Bandbreite (0 % = unteres, 100 % = oberes Band). Bandbreite ${fmt(((bu[n - 1] - bl[n - 1]) / s20[n - 1]) * 100, 1)} % des Kurses.`); }
    const yr = v.slice(Math.max(0, n - 252)), hi = Math.max(...yr), lo = Math.min(...yr);
    card("52-Wochen-Spanne", "neutral", `${fmt(((last - lo) / (hi - lo || 1)) * 100, 0)} %`, `${fmtP((last / hi - 1) * 100)} zum Hoch (${fmt(hi, dec)}), ${fmtP((last / lo - 1) * 100)} zum Tief (${fmt(lo, dec)}).`);
    $("#ta-signals").innerHTML = cards.join("");
    $("#ta-title").textContent = `${x.flag ? x.flag + " " : ""}${x.name}`;
    $("#ta-sub").innerHTML = `Stand ${new Date(dates[n - 1]).toLocaleDateString(LOC)} · Kurs <b class="num">${fmt(last, dec)}</b> · <span class="${cls(x.perf?.["1T"])}-t">${fmtP(x.perf?.["1T"], 2)} zum Vortag</span>`;
  }

  /* ---------- Großer Chart (Dialog) ---------- */
  const dlg = $("#dlg"), chart = $("#dlg-chart"), tip = $("#dlg-tip");
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
  const isIntra = (s) => s.length && s[0][0].length > 10;
  function drawChart(x, s, base) {
    const W = Math.max(300, chart.clientWidth), H = Math.max(200, chart.clientHeight);
    const narrow = W < 520, L = 4, Rm = narrow ? 52 : 68, T = 26, B = 30;
    chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!s || s.length < 2) { chart.innerHTML = ""; return; }
    const v = s.map((p) => p[1]);
    const ref = base ?? v[0];
    let mn = Math.min(...v, ref), mx = Math.max(...v, ref); const pad = (mx - mn) * 0.1 || Math.abs(mx) * 0.01 || 1; mn -= pad; mx += pad;
    const X = (i) => L + (i / (s.length - 1)) * (W - L - Rm), Y = (y) => T + (1 - (y - mn) / (mx - mn)) * (H - T - B);
    const line = s.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p[1]).toFixed(1)).join("");
    const step = niceStep((mx - mn) / (H < 300 ? 3 : 5)); const ticks = []; for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) ticks.push(Math.abs(t) < step / 1e6 ? 0 : t);
    const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 4;
    const grid = ticks.map((t) => `<line x1="${L}" x2="${W - Rm}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)"/><text x="${W - Rm + 10}" y="${Y(t) + 4}" fill="var(--muted)" font-size="12">${fmt(t, d)}</text>`).join("");
    const span = (new Date(s[s.length - 1][0].slice(0, 10)) - new Date(s[0][0].slice(0, 10))) / 864e5;
    const nX = narrow ? 3 : 6; let xl = "";
    const intra = isIntra(s);
    const xLabel = (iso) => (intra ? (span < 1 ? iso.slice(11, 16) : new Date(iso.slice(0, 10)).toLocaleDateString(LOC, { weekday: "short", day: "2-digit", month: "2-digit" }))
      : span > 1500 ? iso.slice(0, 4) : span > 300 ? new Date(iso).toLocaleDateString(LOC, { month: "short", year: "2-digit" }) : dShort(iso, false));
    for (let k = 0; k < nX; k++) { const i = Math.round((k / (nX - 1)) * (s.length - 1)); xl += `<text x="${X(i)}" y="${H - 8}" fill="var(--muted)" font-size="12" text-anchor="${k === 0 ? "start" : k === nX - 1 ? "end" : "middle"}">${xLabel(s[i][0])}</text>`; }
    // Startwert als Bezugslinie, Hoch und Tief im Zeitraum markieren
    const iHi = v.indexOf(Math.max(...v)), iLo = v.indexOf(Math.min(...v));
    const dec = x.dec ?? pxDec(v[v.length - 1]);
    const markD = (i, label, dy) => { const mxp = X(i); const anchor = mxp < 70 ? "start" : mxp > W - Rm - 70 ? "end" : "middle"; return `<circle cx="${mxp}" cy="${Y(v[i])}" r="3.5" fill="var(--surface)" stroke="var(--chart)" stroke-width="1.5"/><text x="${mxp}" y="${Y(v[i]) + dy}" text-anchor="${anchor}" font-size="12" font-weight="600" fill="var(--fg)">${label} ${fmt(v[i], dec)}</text>`; };
    const lx = X(s.length - 1), ly = Y(v[v.length - 1]);
    chart.innerHTML = `${grid}
      ${ref >= mn && ref <= mx ? `<line x1="${L}" x2="${W - Rm}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="var(--muted)" stroke-dasharray="2 5"/>` : ""}
      <path d="${line}L${lx} ${H - B}L${L} ${H - B}Z" fill="var(--chart-fill)"/>
      <path d="${line}" fill="none" stroke="var(--chart)" stroke-width="2.2" stroke-linejoin="round"/>
      ${markD(iHi, "Hoch", -10)}${markD(iLo, "Tief", 19)}
      <circle cx="${lx}" cy="${ly}" r="5" fill="var(--chart)" stroke="var(--surface)" stroke-width="2"/>
      ${xl}<line id="hov" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>
      <circle id="hovd" r="5" fill="var(--chart)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`;
    const hov = $("#hov", chart), hovd = $("#hovd", chart);
    chart.onpointermove = (e) => {
      const r = chart.getBoundingClientRect(); const fx = e.clientX - r.left;
      const i = Math.max(0, Math.min(s.length - 1, Math.round(((fx - L) / (W - L - Rm)) * (s.length - 1))));
      const px = X(i), py = Y(s[i][1]);
      hov.setAttribute("x1", px); hov.setAttribute("x2", px); hov.setAttribute("visibility", "visible");
      hovd.setAttribute("cx", px); hovd.setAttribute("cy", py); hovd.setAttribute("visibility", "visible");
      tip.hidden = false; tip.style.left = Math.max(90, Math.min(W - 90, px)) + "px"; tip.style.top = Math.max(44, py) + "px";
      const when = new Date(s[i][0].slice(0, 10)).toLocaleDateString(LOC) + (intra ? " " + s[i][0].slice(11, 16) + " Uhr" : "");
      const chg = x.kind === "rate" ? fmtPkt(s[i][1] - ref) : fmtP((s[i][1] / ref - 1) * 100);
      tip.textContent = `${when} · ${fmt(s[i][1], dec)}${x.kind === "rate" ? " %" : ""} · ${chg}`;
    };
    chart.onpointerleave = () => { hov.setAttribute("visibility", "hidden"); hovd.setAttribute("visibility", "hidden"); tip.hidden = true; };
  }

  const RL = { "1T": "Vortagesschluss", "1W": "1 Woche", "1M": "1 Monat", "3M": "3 Monaten", "6M": "6 Monaten", YTD: "Jahresbeginn", "1J": "1 Jahr", "5J": "5 Jahren", "10J": "10 Jahren" };
  function renderDialog() {
    const x = ALL[state.dlgId]; if (!x) return;
    const ranges = RANGES.filter((r) => hasRange(x, r));
    if (!ranges.includes(state.dlgRange)) state.dlgRange = ranges.includes("1J") ? "1J" : ranges[ranges.length - 1];
    const s = series(x, state.dlgRange);
    const since = state.dlgRange === "Max" ? "Beginn der Daten (" + new Date((x.since || s[0][0]).slice(0, 10)).toLocaleDateString(LOC, { month: "short", year: "numeric" }) + ")" : RL[state.dlgRange];
    const base = state.dlgRange === "1T" && x.prev ? x.prev : null;
    const p = rangePerf(x, state.dlgRange, s);
    $("#dlg-name").textContent = `${x.flag ? x.flag + " " : ""}${x.name}`;
    $("#dlg-sub").textContent = x.kind === "index" ? `${x.region} · Stand ${new Date(x.date).toLocaleDateString(LOC)}`
      : x.kind === "rate" ? `Zinsen Euroraum · Quelle: EZB · Stand ${x.freq === "M" ? new Date(x.date + "-01").toLocaleDateString(LOC, { month: "long", year: "numeric" }) + " (Monatsdurchschnitt)" : new Date(x.date).toLocaleDateString(LOC)}`
      : x.kind === "stock" ? `${x.sector} · Börsenwert ${fmt(x.mcap, 1)} Mrd. ${esc(x.unit || "")} · Stand ${new Date(x.date).toLocaleDateString(LOC)}`
      : `${x.group} · Stand ${new Date(x.date).toLocaleDateString(LOC)}`;
    if (state.dlgRange === "1T" && s.length) $("#dlg-sub").textContent += ` · Tagesverlauf ${new Date(s[0][0].slice(0, 10)).toLocaleDateString(LOC, { day: "2-digit", month: "2-digit" })} in 5-Minuten-Schritten`;
    else if (state.dlgRange === "1W" && isIntra(s)) $("#dlg-sub").textContent += " · Verlauf in 30-Minuten-Schritten";
    const head = `<strong class="num">${fmt(x.last, x.dec)}${x.unit ? ` <small style="font-size:16px;color:var(--muted)">${esc(x.unit)}</small>` : ""}</strong>`;
    if (x.kind === "rate") {
      const d = s.length > 1 ? s[s.length - 1][1] - s[0][1] : null;
      $("#dlg-px").innerHTML = head + `<span class="chg ${cls(d)} num">${fmtPkt(d)} seit ${since}</span>`;
    } else {
      $("#dlg-px").innerHTML = head + `<span class="chg ${chgCls(x, x.perf["1T"])} num">${fmtP(x.perf["1T"], 2)} zum Vortag</span>` +
        (state.dlgRange === "1T" ? "" : `<span class="chg ${chgCls(x, p)} num">${fmtP(p, Math.abs(p) >= 1000 ? 0 : 1)} seit ${since}</span>`);
    }
    segButtons($("#dlg-range"), ranges, state.dlgRange, (v) => { state.dlgRange = v; renderDialog(); }, RANGE_BTN);
    drawChart(x, s, base);
    const f = (label, value, c = "") => `<div><span>${label}</span><b class="num ${c}">${value}</b></div>`;
    const perfRow = (k, label) => f(label, fmtP(x.perf[k]), x.perf[k] == null ? "" : chgCls(x, x.perf[k]) + "-t");
    const long52 = perfRow("5J", "5 Jahre") + perfRow("10J", "10 Jahre") + f("52-Wochen-Hoch", fmt(x.high52, x.dec)) + f("52-Wochen-Tief", fmt(x.low52, x.dec));
    const common = perfRow("1W", "1 Woche") + perfRow("1M", "1 Monat") + perfRow("YTD", "Seit Jahresbeginn") + perfRow("1J", "1 Jahr");
    const pct2 = (v) => (v != null ? fmt(v, 2) + " %" : "–");
    $("#dlg-facts").innerHTML = x.kind === "index"
      ? f("KGV", fmt(x.pe, 1)) + f("Forward-KGV", fmt(x.fpe, 1)) + f("Dividendenrendite", pct2(x.divYield)) + f("Volatilität (30 Tage)", x.vol30 != null ? fmt(x.vol30, 1) + " %" : "–")
        + common + long52
      : x.kind === "stock"
      ? f("KGV", fmt(x.pe, 1)) + f("Forward-KGV", fmt(x.fpe, 1)) + f("Dividendenrendite", pct2(x.dy)) + f("Börsenwert", fmt(x.mcap, 1) + " Mrd.") + common
      : x.kind === "rate"
      ? f("Aktueller Wert", fmt(x.last, 3) + " %") + f("Veränderung 1 Monat", fmtPkt(x.chg1M), cls(x.chg1M) + "-t") + f("Veränderung 1 Jahr", fmtPkt(x.chg1J), cls(x.chg1J) + "-t") + `<div style="grid-column:1/-1"><span>${esc(x.note || "")}</span></div>`
      : common + long52;
    const multi = state.dlgList.length > 1;
    $("#dlg-prev").hidden = $("#dlg-next").hidden = !multi;
  }
  function openDialog(id, list) {
    if (!ALL[id] || !ALL[id].daily) return;
    state.dlgId = id; state.dlgList = list && list.length ? list : [id];
    state.dlgRange = hasRange(ALL[id], state.range) ? state.range : ALL[id].kind === "rate" ? "5J" : "1J";
    if (!dlg.open) dlg.showModal();
    renderDialog();
  }
  function stepDialog(dir) {
    const L = state.dlgList, i = L.indexOf(state.dlgId); if (L.length < 2) return;
    state.dlgId = L[(i + dir + L.length) % L.length]; renderDialog();
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-open]"); if (!el) return;
    const holder = el.closest("[data-list]");
    openDialog(el.dataset.open, holder ? holder.dataset.list.split(",").filter(Boolean) : null);
  });
  $("#dlg-close").onclick = () => dlg.close();
  $("#dlg-prev").onclick = () => stepDialog(-1);
  $("#dlg-next").onclick = () => stepDialog(1);
  $("#dlg-max").onclick = () => { const on = dlg.classList.toggle("max"); $("#dlg-max").setAttribute("aria-pressed", on); renderDialog(); };
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") stepDialog(-1); if (e.key === "ArrowRight") stepDialog(1); });
  dlg.addEventListener("close", () => { dlg.classList.remove("max"); $("#dlg-max").setAttribute("aria-pressed", false); });
  let rz, lastW = innerWidth; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => {
    if (dlg.open) renderDialog();
    if (innerWidth === lastW) return; lastW = innerWidth;
    const cur = location.hash.replace("#", "");
    if (cur === "einzelwerte") renderEinzelwerte(); if (cur === "analyse") renderAnalyse();
  }, 150); });

  /* ---------- Reiter ---------- */
  const VIEWS = $$(".view").map((v) => v.dataset.view);
  function showView() {
    const want = location.hash.replace("#", ""); const cur = VIEWS.includes(want) ? want : VIEWS[0];
    $$(".view").forEach((v) => (v.hidden = v.dataset.view !== cur));
    $$("#tabs a").forEach((a) => { if (a.getAttribute("href") === "#" + cur) { a.setAttribute("aria-current", "page"); a.scrollIntoView({ block: "nearest", inline: "nearest" }); } else a.removeAttribute("aria-current"); });
    if (cur === "einzelwerte") renderEinzelwerte();
    if (cur === "analyse") renderAnalyse();
    scrollTo(0, 0);
  }
  addEventListener("hashchange", showView);

  /* ---------- Präsentationsmodus & Theme ---------- */
  $("#btn-present").onclick = () => {
    const on = document.body.classList.toggle("present"); $("#btn-present").setAttribute("aria-pressed", on);
    const de = document.documentElement;
    if (on && de.requestFullscreen) de.requestFullscreen().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  $("#btn-theme").onclick = () => { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; r.dataset.theme = dark ? "light" : "dark"; };

  taOptions();
  renderIndices(); renderTable(); renderSectors(); renderKennzahlen();
  showView();
})();
