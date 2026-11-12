#!/usr/bin/env python3
"""MarktPuls – holt täglich Marktdaten (Yahoo Finance via yfinance) und
Nachrichten (Google News RSS) und schreibt docs/data.json.

Kostenlos, kein API-Key nötig. Aufruf:
    python scripts/fetch_data.py            # echte Daten
    python scripts/fetch_data.py --demo     # synthetische Demo-Daten (offline)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import sys
import time
import urllib.parse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data.json"
HIST = ROOT / "docs" / "history.json"

# ---------------------------------------------------------------- Universum
# proxy = US-gelistetes ETF, aus dem KGV und Dividendenrendite gelesen werden
INDICES = [
    # id, Name, Symbol, Region, Flagge, ETF-Proxy
    ("atx", "ATX", "^ATX", "Europa", "🇦🇹", "EWO"),
    ("dax", "DAX", "^GDAXI", "Europa", "🇩🇪", "EWG"),
    ("sx5e", "Euro Stoxx 50", "^STOXX50E", "Europa", "🇪🇺", "FEZ"),
    ("stoxx600", "STOXX Europe 600", "^STOXX", "Europa", "🇪🇺", "VGK"),
    ("smi", "SMI", "^SSMI", "Europa", "🇨🇭", "EWL"),
    ("ftse", "FTSE 100", "^FTSE", "Europa", "🇬🇧", "EWU"),
    ("cac", "CAC 40", "^FCHI", "Europa", "🇫🇷", "EWQ"),
    ("spx", "S&P 500", "^GSPC", "Amerika", "🇺🇸", "SPY"),
    ("ndx", "Nasdaq 100", "^NDX", "Amerika", "🇺🇸", "QQQ"),
    ("dji", "Dow Jones", "^DJI", "Amerika", "🇺🇸", "DIA"),
    ("rut", "Russell 2000", "^RUT", "Amerika", "🇺🇸", "IWM"),
    ("nikkei", "Nikkei 225", "^N225", "Asien", "🇯🇵", "EWJ"),
    ("hsi", "Hang Seng", "^HSI", "Asien", "🇭🇰", "EWH"),
    ("csi", "Shanghai Comp.", "000001.SS", "Asien", "🇨🇳", "MCHI"),
    ("nifty", "Nifty 50", "^NSEI", "Asien", "🇮🇳", "INDA"),
    ("world", "MSCI World", "URTH", "Global", "🌍", "URTH"),
    ("em", "MSCI Emerging Mkts", "EEM", "Global", "🌏", "EEM"),
]

MACRO = [
    # id, Name, Symbol, Einheit, Dezimalstellen, Gruppe
    ("vix", "VIX (Angstbarometer)", "^VIX", "Pkt", 2, "Volatilität"),
    ("us10", "US-Rendite 10J", "^TNX", "%", 2, "Zinsen"),
    ("us3m", "US-Rendite 3M", "^IRX", "%", 2, "Zinsen"),
    ("eurusd", "EUR/USD", "EURUSD=X", "", 4, "Währungen"),
    ("eurchf", "EUR/CHF", "EURCHF=X", "", 4, "Währungen"),
    ("eurjpy", "EUR/JPY", "EURJPY=X", "", 2, "Währungen"),
    ("gold", "Gold", "GC=F", "USD", 0, "Rohstoffe"),
    ("brent", "Öl (Brent)", "BZ=F", "USD", 2, "Rohstoffe"),
    ("gas", "Erdgas (TTF)", "TTF=F", "EUR", 2, "Rohstoffe"),
    ("copper", "Kupfer", "HG=F", "USD", 3, "Rohstoffe"),
    ("btc", "Bitcoin", "BTC-EUR", "EUR", 0, "Krypto"),
]

SECTORS = [
    ("Technologie", "XLK"), ("Finanzen", "XLF"), ("Gesundheit", "XLV"),
    ("Energie", "XLE"), ("Industrie", "XLI"), ("Zykl. Konsum", "XLY"),
    ("Basiskonsum", "XLP"), ("Versorger", "XLU"), ("Grundstoffe", "XLB"),
    ("Immobilien", "XLRE"), ("Kommunikation", "XLC"),
]

# ---------------------------------------------------------------- Risiken
RISKS = [
    ("rates", "Zinsen & Notenbanken", "🏦",
     ["zins", "ezb", "fed ", "fed-", "notenbank", "leitzins", "powell", "lagarde",
      "anleihe", "rendite", "rate hike", "rate cut", "interest rate", "bond yield", "treasur"]),
    ("inflation", "Inflation", "🔥",
     ["inflation", "teuerung", "verbraucherpreis", "preisanstieg", "cpi", "stagflation"]),
    ("recession", "Konjunktur & Rezession", "📉",
     ["rezession", "konjunktur", "abschwung", "arbeitslos", "wachstum schw", "bip",
      "recession", "slowdown", "layoff", "unemployment", "einkaufsmanager", "pmi"]),
    ("geo", "Geopolitik & Konflikte", "🌐",
     ["krieg", "ukraine", "russland", "israel", "iran", "nahost", "taiwan", "konflikt",
      "sanktion", "angriff", "militär", "war ", "missile", "geopolit"]),
    ("trade", "Handel & Zölle", "🚢",
     ["zoll", "zölle", "handelsstreit", "handelskrieg", "strafz", "exportverbot", "exportbeschr",
      "lieferkette"]),
    ("energy", "Energie & Rohstoffe", "🛢️",
     ["ölpreis", "opec", "gaspreis", "energiepreis", "öl ", "erdgas", "oil price", "rohstoff"]),
    ("banks", "Banken & Kredit", "💳",
     ["bankenkrise", "pleite", "insolvenz", "kreditausfall", "zahlungsunfähig", "default",
      "schulden", "verschuldung", "herabgestuft", "herabstufung", "bankenbeben"]),
    ("valuation", "Bewertung & Blasen", "🫧",
     ["blase", "überbewertet", "bubble", "überhitz", "ki-hype", "ai bubble", "korrektur",
      "crash", "ausverkauf", "selloff", "sell-off", "einbruch"]),
    ("politics", "Politik & Wahlen", "🗳️",
     ["wahl", "regierung", "shutdown", "haushalt", "trump", "koalition", "neuwahl"]),
]

NEGATIVE = ["crash", "einbruch", "absturz", "verlust", "sorge", "angst", "risiko", "warn",
            "krise", "fällt", "fallen", "minus", "druck", "schwach", "rückgang", "panik",
            "drohen", "droht", "eskal", "plunge", "fear", "fall", "drop", "slump", "risk",
            "tumble", "warning", "worry", "concern"]

NEWS_QUERIES = [
    ("de", "AT", "Börse Aktien"),
    ("de", "AT", "Aktienmarkt Risiko"),
    ("de", "DE", "DAX Börse heute"),
    ("de", "AT", "Wiener Börse ATX"),
    ("de", "DE", "Wall Street Börse"),
    ("de", "DE", "EZB Fed Zinsen Börse"),
    ("de", "DE", "Inflation Konjunktur Börse"),
    ("de", "DE", "Ölpreis Gold Märkte"),
    ("de", "DE", "Zölle Handelsstreit Börse"),
    ("de", "DE", "Geopolitik Börse Anleger"),
]

# Schlagzeile muss erkennbar mit Märkten/Wirtschaft zu tun haben
MARKET_WORDS = ["börse", "aktie", "dax", "atx", "wall street", "anleger", "markt", "märkte", "kurs",
                "zins", "inflation", "konjunktur", "wirtschaft", "ezb", "fed", "notenbank", "ölpreis",
                "gold", "euro", "dollar", "rendite", "anleihe", "rezession", "zoll", "zölle", "nasdaq",
                "s&p", "dow", "nikkei", "investor", "bank", "preis", "handel", "export", "bip"]


# ---------------------------------------------------------------- Helfer
def r(x, n=2):
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return round(x, n)


def pct(a, b):
    if a is None or b is None or b == 0:
        return None
    return (a / b - 1) * 100


def value_at(s: pd.Series, days_back: int):
    """Schlusskurs am letzten Handelstag <= heute - days_back Kalendertage."""
    target = s.index[-1] - pd.Timedelta(days=days_back)
    sub = s[s.index <= target]
    return float(sub.iloc[-1]) if len(sub) else None


def ytd_base(s: pd.Series):
    year = s.index[-1].year
    sub = s[s.index.year < year]
    return float(sub.iloc[-1]) if len(sub) else float(s.iloc[0])


def rsi(s: pd.Series, n=14):
    d = s.diff().dropna()
    if len(d) < n + 1:
        return None
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up.iloc[-1] / dn.iloc[-1] if dn.iloc[-1] else np.inf
    return 100 - 100 / (1 + rs)


def analyse(s: pd.Series) -> dict:
    s = s.dropna()
    s = s[~s.index.duplicated(keep="last")]
    last = float(s.iloc[-1])
    prev = float(s.iloc[-2]) if len(s) > 1 else None
    year = s[s.index > s.index[-1] - pd.Timedelta(days=365)]
    ret = s.pct_change().dropna()
    sma200 = float(s.iloc[-200:].mean()) if len(s) >= 200 else None
    sma50 = float(s.iloc[-50:].mean()) if len(s) >= 50 else None
    peak = s.cummax()
    dd = (s / peak - 1) * 100
    perf = {
        "1T": pct(last, prev),
        "1W": pct(last, value_at(s, 7)),
        "1M": pct(last, value_at(s, 30)),
        "3M": pct(last, value_at(s, 91)),
        "YTD": pct(last, ytd_base(s)),
        "1J": pct(last, value_at(s, 365)),
        "3J": pct(last, value_at(s, 365 * 3)) if (s.index[-1] - s.index[0]).days > 365 * 3 - 10 else None,
        "5J": pct(last, value_at(s, 365 * 5)) if (s.index[-1] - s.index[0]).days > 365 * 5 - 10 else None,
        "10J": pct(last, value_at(s, 3652)) if (s.index[-1] - s.index[0]).days > 3652 - 10 else None,
        "Max": pct(last, float(s.iloc[0])),
    }
    daily = s.iloc[-272:]
    def resampled(series, rule):
        out = series.resample(rule).last().dropna()
        idx = out.index.tolist()
        idx[-1] = series.index[-1]  # letzter Punkt trägt das echte Datum, nicht das Periodenende
        out.index = pd.DatetimeIndex(idx)
        return out

    w_src = s[s.index >= s.index[-1] - pd.Timedelta(days=3652 + 7)]
    weekly = resampled(w_src, "W-FRI")
    # Seit Beginn: Monatswerte, der erste Kurs bleibt als Startpunkt erhalten
    monthly = resampled(s, "ME")
    if monthly.index[0] != s.index[0]:
        monthly = pd.concat([s.iloc[:1], monthly])
    return {
        "last": r(last, 4),
        "prev": r(prev, 4),
        "date": s.index[-1].strftime("%Y-%m-%d"),
        "perf": {k: r(v) for k, v in perf.items()},
        "high52": r(year.max()),
        "low52": r(year.min()),
        "distHigh52": r(pct(last, float(year.max()))),
        "sma50": r(sma50),
        "sma200": r(sma200),
        "vsSma200": r(pct(last, sma200)) if sma200 else None,
        "vol30": r(ret.iloc[-30:].std() * math.sqrt(252) * 100, 1) if len(ret) >= 30 else None,
        "rsi14": r(rsi(s), 0),
        "maxDD1J": r(dd[dd.index > s.index[-1] - pd.Timedelta(days=365)].min(), 1),
        "daily": [[d.strftime("%Y-%m-%d"), r(v, 4)] for d, v in daily.items()],
        "weekly": [[d.strftime("%Y-%m-%d"), r(v, 4)] for d, v in weekly.items()],
        "monthly": [[d.strftime("%Y-%m-%d"), r(v, 4)] for d, v in monthly.items()],
        "since": s.index[0].strftime("%Y-%m-%d"),
    }


# ---------------------------------------------------------------- Laden
def load_prices(symbols: list[str]) -> dict[str, pd.Series]:
    import yfinance as yf

    out: dict[str, pd.Series] = {}
    for attempt in range(3):
        missing = [s for s in symbols if s not in out]
        if not missing:
            break
        try:
            df = yf.download(missing, period="max", interval="1d", auto_adjust=False,
                             group_by="ticker", threads=True, progress=False)
        except Exception as e:  # noqa: BLE001
            print("download error", e, file=sys.stderr)
            time.sleep(5)
            continue
        for sym in missing:
            try:
                col = df[sym]["Close"] if isinstance(df.columns, pd.MultiIndex) else df["Close"]
                col = col.dropna()
                if len(col) > 20:
                    col.index = pd.to_datetime(col.index).tz_localize(None)
                    out[sym] = col.astype(float)
            except Exception:  # noqa: BLE001
                pass
        time.sleep(2)
    print(f"Kurse geladen: {len(out)}/{len(symbols)}", file=sys.stderr)
    return out


def load_fundamentals(proxies: list[str]) -> dict[str, dict]:
    import yfinance as yf

    res = {}
    for p in sorted(set(proxies)):
        try:
            info = yf.Ticker(p).info or {}
        except Exception as e:  # noqa: BLE001
            print("info error", p, e, file=sys.stderr)
            info = {}
        pe = info.get("trailingPE")
        # "yield" und "trailingAnnualDividendYield" sind Anteile (0.012),
        # "dividendYield" liefert Yahoo inzwischen in Prozent (1.2)
        dy = info.get("yield") or info.get("trailingAnnualDividendYield")
        if not dy and info.get("dividendYield"):
            dy = info["dividendYield"] / 100
        if dy and not 0 < dy < 0.25:
            dy = None
        pb = info.get("priceToBook")
        res[p] = {
            "pe": r(pe, 1) if pe and 0 < pe < 200 else None,
            "divYield": r(dy * 100, 2) if dy else None,
            "pb": r(pb, 2) if pb and 0 < pb < 100 else None,
        }
        time.sleep(0.4)
    return res


def load_news() -> list[dict]:
    import feedparser

    items, seen = [], set()
    for hl, gl, q in NEWS_QUERIES:
        url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(q + " when:3d")
               + f"&hl={hl}&gl={gl}&ceid={gl}:{hl}")
        try:
            feed = feedparser.parse(url, agent="Mozilla/5.0 (MarktPuls)")
        except Exception as e:  # noqa: BLE001
            print("news error", q, e, file=sys.stderr)
            continue
        for e in feed.entries[:40]:
            title = e.get("title", "").strip()
            src = ""
            if " - " in title:
                title, src = title.rsplit(" - ", 1)
            key = re.sub(r"\W+", "", title.lower())[:80]
            if not title or key in seen:
                continue
            if not any(w in title.lower() for w in MARKET_WORDS):
                continue
            # Einzelaktien-Meldungen und Analystenkommentare gehören nicht in den Marktüberblick
            if re.search(r"-aktie|aktie:|aktie [a-zäöü]+:|kursziel|analyse:|-analyse|stuft .* (ein|auf)|bewertet .* mit", title.lower()):
                continue
            seen.add(key)
            try:
                when = dt.datetime(*e.published_parsed[:6], tzinfo=dt.timezone.utc).isoformat()
            except Exception:  # noqa: BLE001
                when = None
            items.append({"title": title, "source": src or e.get("source", {}).get("title", ""),
                          "link": e.get("link"), "date": when, "lang": hl})
        time.sleep(0.5)
    print(f"Schlagzeilen: {len(items)}", file=sys.stderr)
    return items


# ---------------------------------------------------------------- Auswertung
def pick_headlines(items: list[dict], n=5, per_source=2) -> list[dict]:
    """Die wichtigsten Schlagzeilen, höchstens zwei je Quelle."""
    out, count = [], {}
    for h in items:
        src = h.get("source") or ""
        if count.get(src, 0) >= per_source:
            continue
        count[src] = count.get(src, 0) + 1
        out.append(h)
        if len(out) == n:
            break
    return out


def classify_news(news: list[dict]):
    now = dt.datetime.now(dt.timezone.utc)
    risks = []
    for rid, name, icon, kws in RISKS:
        hits = []
        for n in news:
            t = " " + n["title"].lower() + " "
            # Treffer nur am Wortanfang ("Wahl", nicht "Auswahl")
            if any(re.search(r"(?<![a-zäöüß])" + re.escape(k), t) for k in kws):
                neg = sum(1 for w in NEGATIVE if w in t)
                age_h = 48
                if n.get("date"):
                    age_h = max(0, (now - dt.datetime.fromisoformat(n["date"])).total_seconds() / 3600)
                weight = (1 + 0.6 * neg) * (1.0 if age_h < 24 else 0.6)
                hits.append((weight, n))
        hits.sort(key=lambda x: (-x[0], x[1].get("date") or ""), reverse=False)
        score = sum(w for w, _ in hits)
        risks.append({"id": rid, "name": name, "icon": icon, "count": len(hits),
                      "score": r(score, 1),
                      "headlines": pick_headlines([h for _, h in hits])})
        for _, n in hits:
            n.setdefault("tags", []).append(rid)
    mx = max([x["score"] or 0 for x in risks] + [1])
    for x in risks:
        rel = (x["score"] or 0) / mx
        x["level"] = 3 if rel > 0.7 and x["count"] >= 4 else 2 if rel > 0.4 else 1 if x["count"] else 0
    risks.sort(key=lambda x: -(x["score"] or 0))
    return risks


def market_mood(idx: list[dict], macro: dict) -> dict:
    """Einfacher Angst-Gier-Index (0 = extreme Angst, 100 = extreme Gier)."""
    comps = []

    def add(name, value, score, text):
        if value is None or score is None:
            return
        comps.append({"name": name, "value": value, "score": int(max(0, min(100, score))), "text": text})

    vix = macro.get("vix", {}).get("last")
    if vix:
        add("Volatilität (VIX)", r(vix, 1), 100 - (vix - 12) / (35 - 12) * 100,
            "niedrig = Sorglosigkeit, hoch = Angst")
    spx = next((i for i in idx if i["id"] == "spx"), None)
    if spx and spx.get("vsSma200") is not None:
        add("S&P 500 vs. 200-Tage-Linie", spx["vsSma200"], 50 + spx["vsSma200"] * 5,
            "Abstand zum langfristigen Trend")
    above = [i["vsSma200"] > 0 for i in idx if i.get("vsSma200") is not None]
    if above:
        share = sum(above) / len(above) * 100
        add("Indizes über 200-Tage-Linie", r(share, 0), share, "Breite des Aufwärtstrends weltweit")
    m1 = [i["perf"]["1M"] for i in idx if i["perf"].get("1M") is not None]
    if m1:
        avg = float(np.mean(m1))
        add("Momentum 1 Monat (Ø)", r(avg, 1), 50 + avg * 8, "Durchschnittliche Monatsperformance")
    rsis = [i["rsi14"] for i in idx if i.get("rsi14") is not None]
    if rsis:
        avg = float(np.mean(rsis))
        add("RSI 14 (Ø)", r(avg, 0), (avg - 30) / 40 * 100, "überkauft > 70, überverkauft < 30")
    gold = macro.get("gold", {}).get("perf", {}).get("1M")
    if gold is not None and spx and spx["perf"].get("1M") is not None:
        diff = spx["perf"]["1M"] - gold
        add("Aktien vs. Gold (1M)", r(diff, 1), 50 + diff * 6, "Flucht in sichere Häfen?")
    score = int(round(np.mean([c["score"] for c in comps]))) if comps else 50
    label = ("Extreme Angst" if score < 20 else "Angst" if score < 40 else "Neutral" if score < 60
             else "Gier" if score < 80 else "Extreme Gier")
    return {"score": score, "label": label, "components": comps}


def build(prices: dict, fund: dict, news: list[dict], demo=False) -> dict:
    indices = []
    for iid, name, sym, region, flag, proxy in INDICES:
        if sym not in prices:
            continue
        a = analyse(prices[sym])
        f = fund.get(proxy, {})
        indices.append({"id": iid, "name": name, "symbol": sym, "region": region, "flag": flag,
                        "proxy": proxy, "pe": f.get("pe"), "divYield": f.get("divYield"),
                        "pb": f.get("pb"), **a})
    macro = {}
    for mid, name, sym, unit, dec, group in MACRO:
        if sym not in prices:
            continue
        a = analyse(prices[sym])
        macro[mid] = {"id": mid, "name": name, "symbol": sym, "unit": unit, "dec": dec,
                      "group": group, **a}
    if "us10" in macro and "us3m" in macro:
        spread = macro["us10"]["last"] - macro["us3m"]["last"]
        macro["curve"] = {"id": "curve", "name": "Zinskurve 10J–3M", "unit": "%-Pkt", "dec": 2,
                          "group": "Zinsen", "last": r(spread, 2),
                          "perf": {}, "note": "negativ = inverse Zinskurve (Rezessionssignal)"}
    sectors = []
    for name, sym in SECTORS:
        if sym in prices:
            a = analyse(prices[sym])
            sectors.append({"name": name, "symbol": sym, "perf": a["perf"]})
    risks = classify_news(news)
    news.sort(key=lambda n: n.get("date") or "", reverse=True)
    mood = market_mood(indices, macro)

    # Historie des Stimmungsindex fortschreiben
    hist = []
    if HIST.exists():
        try:
            hist = json.loads(HIST.read_text())
        except Exception:  # noqa: BLE001
            hist = []
    today = dt.date.today().isoformat()
    hist = [h for h in hist if h.get("date") != today]
    hist.append({"date": today, "mood": mood["score"]})
    hist = hist[-400:]

    return {
        "name": "MarktPuls",
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "demo": demo,
        "indices": indices,
        "macro": macro,
        "sectors": sectors,
        "mood": mood,
        "moodHistory": hist,
        "risks": risks,
        "news": news[:60],
    }, hist


# ---------------------------------------------------------------- Demo
def demo_data():
    rng = np.random.default_rng(42)
    end = pd.Timestamp(dt.date.today())
    idx = pd.bdate_range(end - pd.Timedelta(days=365 * 14), end)
    starts = {"^ATX": 3000, "^GDAXI": 13000, "^STOXX50E": 3600, "^STOXX": 410, "^SSMI": 10800,
              "^FTSE": 7000, "^FCHI": 5800, "^GSPC": 3600, "^NDX": 12000, "^DJI": 30000,
              "^RUT": 1900, "^N225": 26000, "^HSI": 26000, "000001.SS": 3300, "^NSEI": 13500,
              "URTH": 100, "EEM": 50, "^VIX": 20, "^V2TX": 22, "^TNX": 1.0, "^IRX": 0.1,
              "EURUSD=X": 1.2, "EURCHF=X": 1.08, "EURJPY=X": 125, "GC=F": 1850, "BZ=F": 50,
              "TTF=F": 15, "HG=F": 3.5, "BTC-EUR": 15000}
    for _, s in SECTORS:
        starts[s] = 60
    prices = {}
    for sym, st in starts.items():
        drift = rng.normal(0.0003, 0.0002)
        vol = 0.012 if sym not in ("^VIX", "^V2TX", "BTC-EUR", "TTF=F") else 0.035
        if sym in ("^TNX", "^IRX"):
            path = st + np.cumsum(rng.normal(0.0025, 0.03, len(idx)))
            path = np.clip(path, 0.05, None)
        elif sym in ("^VIX", "^V2TX"):
            x = np.zeros(len(idx)); x[0] = st
            for i in range(1, len(idx)):
                x[i] = x[i - 1] + 0.05 * (17 - x[i - 1]) + rng.normal(0, 1.1)
            path = np.clip(x, 10, 60)
        else:
            path = st * np.exp(np.cumsum(rng.normal(drift, vol, len(idx))))
        prices[sym] = pd.Series(path, index=idx)
    fund = {p: {"pe": r(rng.uniform(11, 32), 1), "divYield": r(rng.uniform(0.6, 4.5), 2),
                "pb": r(rng.uniform(1.2, 6), 2)} for *_, p in INDICES}
    now = dt.datetime.now(dt.timezone.utc)
    samples = [
        ("EZB signalisiert vorsichtige Haltung bei weiteren Zinsschritten", "Demo-Quelle"),
        ("Inflation in der Eurozone sinkt langsamer als erwartet", "Demo-Quelle"),
        ("Neue Zölle: Sorge um Handelsstreit belastet Exportwerte", "Demo-Quelle"),
        ("Ölpreis steigt nach OPEC-Entscheidung deutlich", "Demo-Quelle"),
        ("Experten warnen vor KI-Blase an der Wall Street", "Demo-Quelle"),
        ("Konjunktur: Einkaufsmanagerindex fällt unter 50 Punkte", "Demo-Quelle"),
        ("Geopolitische Spannungen im Nahost-Konflikt drücken auf die Stimmung", "Demo-Quelle"),
        ("Fed: Powell sieht keine Eile bei Zinssenkungen", "Demo-Quelle"),
        ("Wiener Börse: ATX schließt fester, Bankwerte gefragt", "Demo-Quelle"),
        ("US-Haushaltsstreit: Droht erneut ein Shutdown?", "Demo-Quelle"),
        ("Rating-Agentur stuft Staatsanleihen herab", "Demo-Quelle"),
        ("Arbeitslosigkeit in den USA steigt leicht – Rezessionsangst wächst", "Demo-Quelle"),
    ]
    news = [{"title": t, "source": s, "link": "#", "date": (now - pd.Timedelta(hours=3 * i)).isoformat(),
             "lang": "de"} for i, (t, s) in enumerate(samples)]
    return prices, fund, news


# ---------------------------------------------------------------- Main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true")
    args = ap.parse_args()
    if args.demo:
        prices, fund, news = demo_data()
    else:
        symbols = [s for _, _, s, *_ in INDICES] + [m[2] for m in MACRO] + [s for _, s in SECTORS]
        prices = load_prices(symbols)
        if len(prices) < 5:
            print("Zu wenige Kurse geladen – data.json bleibt unverändert.", file=sys.stderr)
            sys.exit(1)
        fund = load_fundamentals([p for *_, p in INDICES])
        news = load_news()
    data, hist = build(prices, fund, news, demo=args.demo)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    if not args.demo:
        HIST.write_text(json.dumps(hist, ensure_ascii=False))
    print(f"geschrieben: {OUT} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
