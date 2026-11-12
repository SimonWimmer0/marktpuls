/* MarktPuls – Frontend. Liest data.json (oder window.__DATA__ in der Vorschau). */
(async function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const LOC = "de-AT";
  const nf = (d) => new Intl.NumberFormat(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, d = 2) => (v == null || isNaN(v) ? "–" : nf(d).format(v));
  const fmtP = (v, d = 1) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + nf(d).format(Math.abs(v)) + " %");
  const cls = (v) => (v == null ? "" : v >= 0 ? "up" : "down");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pxDec = (v) => (v >= 1000 ? 0 : v >= 10 ? 2 : 4);
  const safeStore = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  let data = window.__DATA__;
  if (!data) {
    try { data = await (await fetch("data.json?ts=" + Date.now(), { cache: "no-store" })).json(); }
    catch (e) { $("#app-error").hidden = false; return; }
  }
  const I = data.indices || [];
  const M = data.macro || {};
  const byId = Object.fromEntries(I.map((x) => [x.id, x]));
  const state = { range: safeStore.get("mp-range") || "1J", region: "Alle", sel: safeStore.get("mp-sel") || "atx", sortKey: null, sortDir: -1, secPeriod: "1M" };
  if (!byId[state.sel]) state.sel = I[0]?.id;

  /* ---------- Datenstand ---------- */
  const gen = new Date(data.generated);
  const ageH = (Date.now() - gen) / 36e5;
  const genTxt = gen.toLocaleString(LOC, { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  $("#stamp-time").textContent = genTxt + " Uhr";
  $("#foot-stamp").textContent = genTxt + " Uhr (Wien)";
  if (ageH > 36) $("#stamp-dot").classList.add("stale");
  if (data.demo) $("#demo-banner").hidden = false;
  const today = gen.toLocaleDateString(LOC, { timeZone: "Europe/Vienna", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#hero-date").textContent = today;

  /* ---------- Serien ---------- */
  function series(x, range) {
    const d = x.daily || [];
    if (range === "5J") return x.weekly || d;
    if (range === "1J") return d;
    if (range === "YTD") { const y = d.length ? d[d.length - 1][0].slice(0, 4) : ""; const s = d.filter((p) => p[0].slice(0, 4) === y); return s.length > 1 ? s : d.slice(-5); }
    const n = { "1M": 22, "3M": 64, "6M": 128 }[range] || d.length;
    return d.slice(-n);
  }
  const rangePerf = (x, range) => ({ "1M": x.perf["1M"], "3M": x.perf["3M"], "6M": null, YTD: x.perf.YTD, "1J": x.perf["1J"], "5J": x.perf["5J"] }[range]);
  function seriesPerf(s) { return s.length > 1 ? (s[s.length - 1][1] / s[0][1] - 1) * 100 : null; }

  /* ---------- Sparkline ---------- */
  function spark(s, w = 240, h = 46, colorVar) {
    if (!s || s.length < 2) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
    const v = s.map((p) => p[1]);
    const mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn || 1;
    const pts = v.map((y, i) => [(i / (v.length - 1)) * w, h - 3 - ((y - mn) / rg) * (h - 6)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
    const up = v[v.length - 1] >= v[0];
    const col = colorVar || (up ? "var(--up)" : "var(--down)");
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${line}L${w} ${h}L0 ${h}Z" fill="${col}" fill-opacity=".1"/>
      <path d="${line}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.4" fill="${col}"/></svg>`;
  }

  /* ---------- Laufband ---------- */
  (function ticker() {
    const items = [...I.map((x) => [x.name, x.last, x.perf["1T"]]), ...Object.values(M).filter((m) => m.daily).map((m) => [m.name.replace(/ \(.*\)/, ""), m.last, m.perf["1T"]])];
    const html = items.map(([n, l, c]) => `<span><b>${esc(n)}</b>${fmt(l, pxDec(l))} <span class="${cls(c)}-t" style="color:${c >= 0 ? "#3fcf8e" : "#ff7a68"}">${fmtP(c, 2)}</span></span>`).join("");
    $("#ticker").innerHTML = html + html;
  })();

  /* ---------- Stimmung ---------- */
  (function hero() {
    const m = data.mood || { score: 50, label: "Neutral", components: [] };
    const g = $("#gauge");
    const W = 300, R = 120, cx = 150, cy = 140;
    const pt = (s, r = R) => { const a = Math.PI * (1 - s / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    const arc = (a, b, col) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `<path d="M${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}" stroke="${col}" stroke-width="20" fill="none"/>`; };
    const segs = [[0, 20, "#c23a2b"], [20, 40, "#e8833a"], [40, 60, "#a8a69a"], [60, 80, "#7fbf6a"], [80, 100, "#0f9b5f"]];
    const [nx, ny] = pt(m.score, R - 30);
    const labels = [["Angst", cx - R], ["Gier", cx + R]].map(([t, x]) => `<text x="${x}" y="${cy + 24}" text-anchor="middle" fill="#c9c7bb" font-size="12">${t}</text>`).join("");
    g.innerHTML = `<svg viewBox="0 0 ${W} 170" class="gauge" role="img" aria-label="Marktstimmung ${m.score} von 100: ${esc(m.label)}">
      ${segs.map((s) => arc(s[0] + 0.6, s[1] - 0.6, s[2])).join("")}
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#ffe600" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="#ffe600"/>${labels}</svg>
      <div class="gauge-label"><strong>${m.score}</strong><span>${esc(m.label)}</span></div>`;
    const h = data.moodHistory || [];
    const ago = (days) => { const t = new Date(gen); t.setDate(t.getDate() - days); const iso = t.toISOString().slice(0, 10); const c = h.filter((x) => x.date <= iso); return c.length ? c[c.length - 1].mood : null; };
    const w1 = ago(7), m1 = ago(30);
    $("#gauge-hist").textContent = [w1 != null ? `Vor 1 Woche: ${w1}` : null, m1 != null ? `Vor 1 Monat: ${m1}` : null].filter(Boolean).join(" · ") || "Verlauf wird ab heute täglich aufgezeichnet";
    $("#comp").innerHTML = m.components.map((c) => `<div title="${esc(c.text)}"><span>${esc(c.name)}</span><em>${fmt(c.value, 1)}</em><i class="bar"><b style="width:${c.score}%"></b></i></div>`).join("");

    const k = [["spx", "S&P 500"], ["dax", "DAX"], ["atx", "ATX"], ["sx5e", "Euro Stoxx 50"]].filter(([id]) => byId[id]).map(([id, n]) => [n, byId[id].last, byId[id].perf["1T"], 0]);
    const mk = [["vix", "VIX"], ["eurusd", "EUR/USD"], ["gold", "Gold $"], ["us10", "US 10J %"]].filter(([id]) => M[id]).map(([id, n]) => [n, M[id].last, M[id].perf["1T"], M[id].dec, id === "vix"]);
    $("#kpis").innerHTML = [...k, ...mk].map(([n, v, c, d, inv]) => `<div class="kpi"><div class="k">${esc(n)}</div><div class="v num">${fmt(v, d || pxDec(v))}</div><div class="c ${cls(inv && c != null ? -c : c)}">${fmtP(c, 2)} heute</div></div>`).join("");

    // Kurzfazit in Worten
    const up = I.filter((x) => x.perf["1T"] > 0).length;
    const best = [...I].sort((a, b) => (b.perf.YTD ?? -999) - (a.perf.YTD ?? -999))[0];
    const topRisk = (data.risks || [])[0];
    $("#lead").innerHTML = `${up} von ${I.length} Indizes liegen heute im Plus. Stärkster Markt seit Jahresbeginn: <b>${esc(best?.name)}</b> (${fmtP(best?.perf.YTD)}).` +
      (M.vix ? ` Der VIX steht bei <b>${fmt(M.vix.last, 1)}</b>${M.vix.last < 15 ? " (ruhiges Umfeld)" : M.vix.last < 22 ? " (normales Umfeld)" : M.vix.last < 30 ? " (erhöhte Nervosität)" : " (Stressphase)"}.` : "") +
      (topRisk && topRisk.count ? ` Meistdiskutiertes Risiko in den Nachrichten: <b>${esc(topRisk.name)}</b>.` : "");
  })();

  /* ---------- Index-Kacheln ---------- */
  const regions = ["Alle", ...new Set(I.map((x) => x.region))];
  function segButtons(el, opts, cur, cb) {
    el.innerHTML = opts.map((o) => `<button type="button" aria-pressed="${o === cur}" data-v="${esc(o)}">${esc(o)}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; [...el.children].forEach((c) => c.setAttribute("aria-pressed", c === b)); cb(b.dataset.v); };
  }
  segButtons($("#seg-region"), regions, state.region, (v) => { state.region = v; renderCards(); });
  segButtons($("#seg-range"), ["1M", "3M", "6M", "YTD", "1J", "5J"], state.range, (v) => { state.range = v; safeStore.set("mp-range", v); renderCards(); renderDetail(); });

  function renderCards() {
    const list = I.filter((x) => state.region === "Alle" || x.region === state.region);
    $("#cards").innerHTML = list.map((x) => {
      const s = series(x, state.range); const p = seriesPerf(s);
      return `<button type="button" class="card" data-id="${x.id}" aria-pressed="${x.id === state.sel}">
        <div class="row"><span class="nm">${x.flag} ${esc(x.name)}</span><span class="rg">${esc(x.region)}</span></div>
        <div class="row"><span class="px num">${fmt(x.last, pxDec(x.last))}</span><span class="chg ${cls(x.perf["1T"])} num">${fmtP(x.perf["1T"], 2)}</span></div>
        ${spark(s)}
        <div class="mini"><span>${state.range} <b class="${cls(p)}-t">${fmtP(p)}</b></span><span>KGV <b>${fmt(x.pe, 1)}</b></span><span>Div. <b>${x.divYield != null ? fmt(x.divYield, 1) + " %" : "–"}</b></span></div>
      </button>`;
    }).join("");
  }
  $("#cards").addEventListener("click", (e) => {
    const c = e.target.closest(".card"); if (!c) return;
    state.sel = c.dataset.id; safeStore.set("mp-sel", state.sel);
    [...$("#cards").children].forEach((k) => k.setAttribute("aria-pressed", k === c));
    renderDetail();
  });

  /* ---------- Detail-Chart ---------- */
  function bigChart(svg, s, tipEl) {
    const W = 800, H = 300, L = 8, Rr = 62, T = 12, B = 26;
    if (!s || s.length < 2) { svg.innerHTML = ""; return; }
    const v = s.map((p) => p[1]);
    let mn = Math.min(...v), mx = Math.max(...v); const pad = (mx - mn) * 0.08 || 1; mn -= pad; mx += pad;
    const X = (i) => L + (i / (s.length - 1)) * (W - L - Rr), Y = (y) => T + (1 - (y - mn) / (mx - mn)) * (H - T - B);
    const line = s.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p[1]).toFixed(1)).join("");
    // Achsen: 5 runde Ticks
    const step = niceStep((mx - mn) / 4); const ticks = []; for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) ticks.push(t);
    const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 4;
    const grid = ticks.map((t) => `<line x1="${L}" x2="${W - Rr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--grid)"/><text x="${W - Rr + 8}" y="${Y(t) + 4}" fill="var(--muted)" font-size="11">${fmt(t, d)}</text>`).join("");
    const nX = 5; const xl = []; for (let k = 0; k < nX; k++) { const i = Math.round((k / (nX - 1)) * (s.length - 1)); const dt = new Date(s[i][0]); xl.push(`<text x="${X(i)}" y="${H - 6}" fill="var(--muted)" font-size="11" text-anchor="${k === 0 ? "start" : k === nX - 1 ? "end" : "middle"}">${dt.toLocaleDateString(LOC, { day: "2-digit", month: "short", year: s.length > 200 || state.range === "5J" ? "2-digit" : undefined })}</text>`); }
    const lx = X(s.length - 1), ly = Y(v[v.length - 1]);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `${grid}<path d="${line}L${X(s.length - 1)} ${H - B}L${L} ${H - B}Z" fill="var(--chart-fill)"/>
      <path d="${line}" fill="none" stroke="var(--chart)" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${lx}" cy="${ly}" r="4.5" fill="var(--chart)" stroke="var(--surface)" stroke-width="2"/>
      ${xl.join("")}<line id="hov" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>
      <circle id="hovd" r="4" fill="var(--chart)" visibility="hidden"/>`;
    const hov = svg.querySelector("#hov"), hovd = svg.querySelector("#hovd");
    svg.onpointermove = (e) => {
      const r = svg.getBoundingClientRect(); const fx = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(s.length - 1, Math.round(((fx - L) / (W - L - Rr)) * (s.length - 1))));
      const x = X(i), y = Y(s[i][1]);
      hov.setAttribute("x1", x); hov.setAttribute("x2", x); hov.setAttribute("visibility", "visible");
      hovd.setAttribute("cx", x); hovd.setAttribute("cy", y); hovd.setAttribute("visibility", "visible");
      const ch = (s[i][1] / s[0][1] - 1) * 100;
      tipEl.hidden = false; tipEl.style.left = (x / W) * r.width + "px"; tipEl.style.top = (y / H) * r.height + "px";
      tipEl.textContent = `${new Date(s[i][0]).toLocaleDateString(LOC)} · ${fmt(s[i][1], pxDec(s[i][1]))} · ${fmtP(ch)}`;
    };
    svg.onpointerleave = () => { hov.setAttribute("visibility", "hidden"); hovd.setAttribute("visibility", "hidden"); tipEl.hidden = true; };
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }

  function renderDetail() {
    const x = byId[state.sel]; if (!x) return;
    const s = series(x, state.range), p = seriesPerf(s);
    $("#d-name").textContent = `${x.flag} ${x.name}`;
    $("#d-sub").textContent = `${x.region} · Symbol ${x.symbol} · Stand ${new Date(x.date).toLocaleDateString(LOC)}`;
    $("#d-px").innerHTML = `<strong class="num">${fmt(x.last, pxDec(x.last))}</strong><span class="chg ${cls(x.perf["1T"])}">${fmtP(x.perf["1T"], 2)} heute</span><span class="chg ${cls(p)}">${fmtP(p)} im Zeitraum ${state.range}</span>`;
    bigChart($("#d-chart"), s, $("#d-tip"));
    const pos = x.high52 > x.low52 ? ((x.last - x.low52) / (x.high52 - x.low52)) * 100 : 50;
    const rsiTxt = x.rsi14 == null ? "" : x.rsi14 >= 70 ? " überkauft" : x.rsi14 <= 30 ? " überverkauft" : "";
    $("#d-facts").innerHTML = `
      <div><span>KGV (trailing)</span><b>${fmt(x.pe, 1)}</b></div>
      <div><span>Dividendenrendite</span><b>${x.divYield != null ? fmt(x.divYield, 2) + " %" : "–"}</b></div>
      <div><span>Kurs-Buchwert (KBV)</span><b>${fmt(x.pb, 2)}</b></div>
      <div><span>Volatilität 30 T (p. a.)</span><b>${x.vol30 != null ? fmt(x.vol30, 1) + " %" : "–"}</b></div>
      <div><span>RSI 14</span><b>${fmt(x.rsi14, 0)}${rsiTxt}</b></div>
      <div><span>Abstand 200-Tage-Linie</span><b class="${cls(x.vsSma200)}-t">${fmtP(x.vsSma200)}</b></div>
      <div><span>Abstand 52-W-Hoch</span><b class="${cls(x.distHigh52)}-t">${fmtP(x.distHigh52)}</b></div>
      <div><span>Max. Rückgang 1 J</span><b class="down-t">${fmtP(x.maxDD1J)}</b></div>
      <div style="display:block"><span>52-Wochen-Spanne</span>
        <div class="range"><i style="left:${pos.toFixed(1)}%"></i></div>
        <div class="range-l num"><span>${fmt(x.low52, pxDec(x.low52))}</span><span>${fmt(x.high52, pxDec(x.high52))}</span></div></div>
      <div><span>Bewertung via ETF</span><b><span class="tag">${esc(x.proxy)}</span></b></div>`;
  }

  /* ---------- Vergleichstabelle ---------- */
  const COLS = [
    ["name", "Index"], ["last", "Stand"], ["1T", "1 T"], ["1W", "1 W"], ["1M", "1 M"], ["YTD", "YTD"], ["1J", "1 J"], ["5J", "5 J"],
    ["pe", "KGV"], ["divYield", "Div. %"], ["vol30", "Vola 30T"], ["rsi14", "RSI"], ["vsSma200", "vs. 200T"], ["range", "52-W-Spanne"],
  ];
  const val = (x, k) => (k in x.perf ? x.perf[k] : k === "range" ? (x.last - x.low52) / (x.high52 - x.low52 || 1) : x[k]);
  function heatBg(v, scale) {
    if (v == null) return "";
    const a = Math.min(1, Math.abs(v) / scale) * 42 + 6;
    return `background:color-mix(in srgb, var(${v >= 0 ? "--up" : "--down"}) ${a.toFixed(0)}%, var(--surface));`;
  }
  const scaleOf = { "1T": 2, "1W": 4, "1M": 8, YTD: 20, "1J": 25, "5J": 80, "3M": 12, "3J": 50 };
  function renderTable() {
    const rows = [...I];
    if (state.sortKey) rows.sort((a, b) => { const va = val(a, state.sortKey), vb = val(b, state.sortKey); if (typeof va === "string") return va.localeCompare(vb) * state.sortDir; return ((va ?? -1e9) - (vb ?? -1e9)) * state.sortDir; });
    $("#tbl thead").innerHTML = "<tr>" + COLS.map(([k, n]) => `<th scope="col" data-k="${k}" ${state.sortKey === k ? `aria-sort="${state.sortDir > 0 ? "ascending" : "descending"}"` : ""}>${n}</th>`).join("") + "</tr>";
    $("#tbl tbody").innerHTML = rows.map((x) => {
      const pos = ((x.last - x.low52) / (x.high52 - x.low52 || 1)) * 100;
      return `<tr><td>${x.flag} <b>${esc(x.name)}</b></td><td class="num">${fmt(x.last, pxDec(x.last))}</td>` +
        ["1T", "1W", "1M", "YTD", "1J", "5J"].map((k) => `<td class="num heat" style="${heatBg(x.perf[k], scaleOf[k])}">${fmtP(x.perf[k])}</td>`).join("") +
        `<td class="num">${fmt(x.pe, 1)}</td><td class="num">${fmt(x.divYield, 2)}</td><td class="num">${x.vol30 != null ? fmt(x.vol30, 1) + " %" : "–"}</td>` +
        `<td class="num ${x.rsi14 >= 70 ? "down-t" : x.rsi14 <= 30 ? "up-t" : ""}">${fmt(x.rsi14, 0)}</td><td class="num ${cls(x.vsSma200)}-t">${fmtP(x.vsSma200)}</td>` +
        `<td><span class="mrange" title="${fmt(x.low52, 0)} – ${fmt(x.high52, 0)}"><i style="left:calc(${Math.max(0, Math.min(100, pos)).toFixed(0)}% - 1px)"></i></span></td></tr>`;
    }).join("");
  }
  $("#tbl thead").addEventListener("click", (e) => {
    const th = e.target.closest("th"); if (!th) return;
    const k = th.dataset.k; if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = k === "name" ? 1 : -1; }
    renderTable();
  });

  /* ---------- Heatmap ---------- */
  (function heatmap() {
    const P = ["1T", "1W", "1M", "3M", "YTD", "1J", "3J", "5J"];
    let h = `<div class="hm-grid"><div class="h"></div>${P.map((p) => `<div class="h">${p}</div>`).join("")}`;
    for (const x of I) h += `<div class="n">${x.flag} ${esc(x.name)}</div>` + P.map((p) => `<div class="num" style="${heatBg(x.perf[p], scaleOf[p])}">${fmtP(x.perf[p])}</div>`).join("");
    $("#heatmap").innerHTML = h + "</div>";
  })();

  /* ---------- Sektoren ---------- */
  segButtons($("#seg-sec"), ["1T", "1W", "1M", "YTD", "1J"], state.secPeriod, (v) => { state.secPeriod = v; renderSectors(); });
  function renderSectors() {
    const p = state.secPeriod; const S = [...(data.sectors || [])].sort((a, b) => (b.perf[p] ?? 0) - (a.perf[p] ?? 0));
    $("#sectors").innerHTML = S.map((s) => `<div class="sector" style="${heatBg(s.perf[p], scaleOf[p])}"><b>${esc(s.name)}</b><span class="num">${fmtP(s.perf[p])}</span></div>`).join("") || "<p>Keine Sektordaten.</p>";
  }

  /* ---------- Makro ---------- */
  (function macro() {
    const order = ["Volatilität", "Zinsen", "Währungen", "Rohstoffe", "Krypto"];
    const list = Object.values(M).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    $("#macro").innerHTML = list.map((m) => {
      const note = m.id === "curve" ? (m.last < 0 ? "Invertiert: historisch ein Rezessionssignal" : "Normal (positiv)") : m.id === "vix" ? (m.last < 15 ? "Ruhig" : m.last < 22 ? "Normal" : m.last < 30 ? "Erhöht" : "Stress") : `1 M ${fmtP(m.perf?.["1M"])} · YTD ${fmtP(m.perf?.YTD)}`;
      const inv = m.id === "vix" || m.id === "vstoxx";
      return `<div class="mc"><div class="g">${esc(m.group)}</div><div class="row"><span class="nm">${esc(m.name)}</span>${m.perf?.["1T"] != null ? `<span class="chg ${inv ? (m.perf["1T"] >= 0 ? "down" : "up") : cls(m.perf["1T"])}">${fmtP(m.perf["1T"], 2)}</span>` : ""}</div>
        <div class="v num">${fmt(m.last, m.dec)} <small style="font-size:12px;color:var(--muted)">${esc(m.unit)}</small></div>
        ${m.daily ? spark(m.daily, 200, 34, "var(--muted)") : ""}<div class="note">${note}</div></div>`;
    }).join("");
  })();

  /* ---------- Risiko-Radar ---------- */
  (function risks() {
    const R = data.risks || [];
    const LT = ["kein Thema", "niedrig", "erhöht", "hoch"];
    $("#risks").innerHTML = R.map((r, i) => `<details class="risk" ${i < 2 ? "open" : ""}><summary><span class="t">${esc(r.name)}</span><span class="cnt">${r.count} ${r.count === 1 ? "Meldung" : "Meldungen"}</span>
      <span style="display:flex;align-items:center;gap:8px"><span class="lvl" data-l="${r.level}"><i></i><i></i><i></i></span><span class="lvl-t">${LT[r.level]}</span></span></summary>
      ${r.headlines.length ? `<ul>${r.headlines.map((h) => `<li><a href="${esc(h.link)}" target="_blank" rel="noopener">${esc(h.title)}</a><small>${esc(h.source)}${h.date ? " · " + new Date(h.date).toLocaleString(LOC, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</small></li>`).join("")}</ul>` : `<ul><li><small>Derzeit keine relevanten Schlagzeilen.</small></li></ul>`}</details>`).join("");
    // Radar
    const n = R.length; if (n < 3) return;
    const cx = 170, cy = 165, rad = 112, mx = Math.max(...R.map((r) => r.score || 0), 1);
    const P = (i, f) => { const a = -Math.PI / 2 + (i / n) * 2 * Math.PI; return [cx + Math.cos(a) * rad * f, cy + Math.sin(a) * rad * f]; };
    let g = "";
    for (const f of [0.25, 0.5, 0.75, 1]) g += `<polygon points="${R.map((_, i) => P(i, f).join(",")).join(" ")}" fill="none" stroke="var(--line)"/>`;
    R.forEach((r, i) => { const [x, y] = P(i, 1); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)"/>`; const [lx, ly] = P(i, 1.2); g += `<text x="${lx}" y="${ly + 4}" text-anchor="${Math.abs(lx - cx) < 10 ? "middle" : lx < cx ? "end" : "start"}" font-size="11" fill="var(--muted)">${esc(r.name.split(" ")[0])}</text>`; });
    const poly = R.map((r, i) => P(i, 0.08 + 0.92 * ((r.score || 0) / mx)).join(",")).join(" ");
    $("#radar").innerHTML = `<svg viewBox="-35 0 410 330" class="radar" role="img" aria-label="Risiko-Radar">${g}<polygon points="${poly}" fill="var(--yellow)" fill-opacity=".55" stroke="var(--fg)" stroke-width="1.5"/></svg>`;
  })();

  /* ---------- Schlagzeilen ---------- */
  (function news() {
    const N = (data.news || []).slice(0, 24);
    $("#news").innerHTML = N.map((h) => `<a href="${esc(h.link)}" target="_blank" rel="noopener"><b>${esc(h.title)}</b><small>${esc(h.source)}${h.date ? " · " + new Date(h.date).toLocaleString(LOC, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</small></a>`).join("") || "<p>Keine Schlagzeilen verfügbar.</p>";
  })();

  /* ---------- Präsentationsmodus & Theme ---------- */
  $("#btn-present").onclick = () => { document.body.classList.toggle("present"); const on = document.body.classList.contains("present"); $("#btn-present").setAttribute("aria-pressed", on); if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  $("#btn-theme").onclick = () => { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; r.dataset.theme = dark ? "light" : "dark"; };

  renderCards(); renderDetail(); renderTable(); renderSectors();
})();
