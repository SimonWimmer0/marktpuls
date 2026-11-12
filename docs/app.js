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
  const RANGES = ["1M", "3M", "6M", "YTD", "1J", "5J", "10J", "Max"];
  const RANGE_BTN = { Max: "Seit Beginn" };
  const RANGE_CAP = { "1M": "1 Monat", "3M": "3 Monate", "6M": "6 Monate", YTD: "Seit Jahresbeginn", "1J": "1 Jahr", "5J": "5 Jahre", "10J": "10 Jahre", Max: "Seit Beginn" };
  const hasRange = (x, r) => (r === "5J" || r === "10J" ? x.perf?.[r] != null : r === "Max" ? (x.monthly || []).length > 2 : true);
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
    if (range === "Max") return x.monthly && x.monthly.length > 2 ? x.monthly : d;
    if (range === "10J") return x.weekly && x.weekly.length > 2 ? x.weekly : d;
    if (range === "5J") {
      const w = x.weekly && x.weekly.length > 2 ? x.weekly : d;
      const from = new Date(w[w.length - 1][0]); from.setFullYear(from.getFullYear() - 5);
      const iso = from.toISOString().slice(0, 10);
      return w.filter((p) => p[0] >= iso);
    }
    if (!d.length) return d;
    // Start = letzter Schlusskurs am oder vor dem Stichtag (wie bei den Kennzahlen)
    let cut;
    if (range === "YTD") cut = d[d.length - 1][0].slice(0, 4) + "-01-01";
    else { const t = new Date(d[d.length - 1][0]); t.setDate(t.getDate() - { "1M": 30, "3M": 91, "6M": 182, "1J": 365 }[range]); cut = t.toISOString().slice(0, 10); }
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
    const km = ["vix", "us10", "eurusd", "gold", "brent", "btc"].filter((id) => M[id]);
    $("#key-macro").innerHTML = km.map((id) => macroTile(M[id], false)).join("");
    $("#key-macro").dataset.list = km.join(",");
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

  /* ---------- Großer Chart (Dialog) ---------- */
  const dlg = $("#dlg"), chart = $("#dlg-chart"), tip = $("#dlg-tip");
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
  function drawChart(x, s) {
    const W = Math.max(300, chart.clientWidth), H = Math.max(200, chart.clientHeight);
    const narrow = W < 520, L = 4, Rm = narrow ? 52 : 68, T = 26, B = 30;
    chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!s || s.length < 2) { chart.innerHTML = ""; return; }
    const v = s.map((p) => p[1]);
    let mn = Math.min(...v), mx = Math.max(...v); const pad = (mx - mn) * 0.1 || Math.abs(mx) * 0.01 || 1; mn -= pad; mx += pad;
    const X = (i) => L + (i / (s.length - 1)) * (W - L - Rm), Y = (y) => T + (1 - (y - mn) / (mx - mn)) * (H - T - B);
    const line = s.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p[1]).toFixed(1)).join("");
    const step = niceStep((mx - mn) / (H < 300 ? 3 : 5)); const ticks = []; for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) ticks.push(Math.abs(t) < step / 1e6 ? 0 : t);
    const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 4;
    const grid = ticks.map((t) => `<line x1="${L}" x2="${W - Rm}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)"/><text x="${W - Rm + 10}" y="${Y(t) + 4}" fill="var(--muted)" font-size="12">${fmt(t, d)}</text>`).join("");
    const span = (new Date(s[s.length - 1][0]) - new Date(s[0][0])) / 864e5;
    const nX = narrow ? 3 : 6; let xl = "";
    const xLabel = (iso) => (span > 1500 ? iso.slice(0, 4) : span > 300 ? new Date(iso).toLocaleDateString(LOC, { month: "short", year: "2-digit" }) : dShort(iso, false));
    for (let k = 0; k < nX; k++) { const i = Math.round((k / (nX - 1)) * (s.length - 1)); xl += `<text x="${X(i)}" y="${H - 8}" fill="var(--muted)" font-size="12" text-anchor="${k === 0 ? "start" : k === nX - 1 ? "end" : "middle"}">${xLabel(s[i][0])}</text>`; }
    // Startwert als Bezugslinie, Hoch und Tief im Zeitraum markieren
    const iHi = v.indexOf(Math.max(...v)), iLo = v.indexOf(Math.min(...v));
    const dec = x.dec ?? pxDec(v[v.length - 1]);
    const markD = (i, label, dy) => { const mxp = X(i); const anchor = mxp < 70 ? "start" : mxp > W - Rm - 70 ? "end" : "middle"; return `<circle cx="${mxp}" cy="${Y(v[i])}" r="3.5" fill="var(--surface)" stroke="var(--chart)" stroke-width="1.5"/><text x="${mxp}" y="${Y(v[i]) + dy}" text-anchor="${anchor}" font-size="12" font-weight="600" fill="var(--fg)">${label} ${fmt(v[i], dec)}</text>`; };
    const lx = X(s.length - 1), ly = Y(v[v.length - 1]);
    chart.innerHTML = `${grid}
      <line x1="${L}" x2="${W - Rm}" y1="${Y(v[0])}" y2="${Y(v[0])}" stroke="var(--muted)" stroke-dasharray="2 5"/>
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
      tip.textContent = `${new Date(s[i][0]).toLocaleDateString(LOC)} · ${fmt(s[i][1], dec)} · ${fmtP((s[i][1] / s[0][1] - 1) * 100)}`;
    };
    chart.onpointerleave = () => { hov.setAttribute("visibility", "hidden"); hovd.setAttribute("visibility", "hidden"); tip.hidden = true; };
  }

  const RL = { "1M": "1 Monat", "3M": "3 Monaten", "6M": "6 Monaten", YTD: "Jahresbeginn", "1J": "1 Jahr", "5J": "5 Jahren", "10J": "10 Jahren" };
  function renderDialog() {
    const x = ALL[state.dlgId]; if (!x) return;
    const ranges = RANGES.filter((r) => hasRange(x, r));
    if (!ranges.includes(state.dlgRange)) state.dlgRange = "Max";
    const since = state.dlgRange === "Max" ? "Beginn der Daten (" + new Date(x.since || x.monthly[0][0]).toLocaleDateString(LOC, { month: "short", year: "numeric" }) + ")" : RL[state.dlgRange];
    const s = series(x, state.dlgRange), p = rangePerf(x, state.dlgRange, s);
    $("#dlg-name").textContent = `${x.flag ? x.flag + " " : ""}${x.name}`;
    $("#dlg-sub").textContent = `${x.kind === "index" ? x.region : x.group} · Stand ${new Date(x.date).toLocaleDateString(LOC)}`;
    $("#dlg-px").innerHTML = `<strong class="num">${fmt(x.last, x.dec)}${x.unit ? ` <small style="font-size:16px;color:var(--muted)">${esc(x.unit)}</small>` : ""}</strong>
      <span class="chg ${chgCls(x, x.perf["1T"])} num">${fmtP(x.perf["1T"], 2)} zum Vortag</span><span class="chg ${chgCls(x, p)} num">${fmtP(p, Math.abs(p) >= 1000 ? 0 : 1)} seit ${since}</span>`;
    segButtons($("#dlg-range"), ranges, state.dlgRange, (v) => { state.dlgRange = v; renderDialog(); }, RANGE_BTN);
    drawChart(x, s);
    const f = (label, value, c = "") => `<div><span>${label}</span><b class="num ${c}">${value}</b></div>`;
    const perfRow = (k, label) => f(label, fmtP(x.perf[k]), x.perf[k] == null ? "" : chgCls(x, x.perf[k]) + "-t");
    const long52 = perfRow("5J", "5 Jahre") + perfRow("10J", "10 Jahre") + f("52-Wochen-Hoch", fmt(x.high52, x.dec)) + f("52-Wochen-Tief", fmt(x.low52, x.dec));
    const common = perfRow("1W", "1 Woche") + perfRow("1M", "1 Monat") + perfRow("YTD", "Seit Jahresbeginn") + perfRow("1J", "1 Jahr");
    $("#dlg-facts").innerHTML = x.kind === "index"
      ? f("KGV", fmt(x.pe, 1)) + f("Dividendenrendite", x.divYield != null ? fmt(x.divYield, 2) + " %" : "–") + f("Volatilität (30 Tage)", x.vol30 != null ? fmt(x.vol30, 1) + " %" : "–") + f("RSI (14 Tage)", fmt(x.rsi14, 0) + (x.rsi14 >= 70 ? " · überkauft" : x.rsi14 <= 30 ? " · überverkauft" : ""))
        + common + long52
      : common + long52;
    const multi = state.dlgList.length > 1;
    $("#dlg-prev").hidden = $("#dlg-next").hidden = !multi;
  }
  function openDialog(id, list) {
    if (!ALL[id] || !ALL[id].daily) return;
    state.dlgId = id; state.dlgList = list && list.length ? list : [id]; state.dlgRange = state.range;
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
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => dlg.open && renderDialog(), 120); });

  /* ---------- Reiter ---------- */
  const VIEWS = $$(".view").map((v) => v.dataset.view);
  function showView() {
    const want = location.hash.replace("#", ""); const cur = VIEWS.includes(want) ? want : VIEWS[0];
    $$(".view").forEach((v) => (v.hidden = v.dataset.view !== cur));
    $$("#tabs a").forEach((a) => { if (a.getAttribute("href") === "#" + cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
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

  renderIndices(); renderTable(); renderSectors(); showView();
})();
