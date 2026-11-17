# MarktPuls

Marktüberblick auf einen Blick: Indizes weltweit mit Tagesverlauf, Bewertung (KGV,
Forward-KGV, Dividende, KBV) im Vergleich, Einzelwerte als Kachelkarte nach Börsenwert,
Chartanalyse (gleitende Durchschnitte, Bollinger, RSI, MACD u. a.), Euro-Zinsen der EZB
(Leitzinsen, Euribor, Zinskurve), Währungen, Rohstoffe sowie Meldungen und Marktrisiken.

- `docs/` – die Website (statisch, wird über GitHub Pages ausgeliefert)
- `scripts/fetch_data.py` – holt die Daten (Yahoo Finance, EZB, Google News; kein API-Key nötig, Laufzeit ca. 2–4 Minuten)
- `scripts/constituents.py` – Einzelwerte je Index (bei Indexänderungen anpassen)
- `.github/workflows/update.yml` – aktualisiert werktags morgens und abends und veröffentlicht

Einmalig einrichten: Repository → Settings → Pages → Source: **GitHub Actions**.

Lokal testen:

```
pip install -r requirements.txt
python scripts/fetch_data.py        # echte Daten
python -m http.server -d docs 8000  # http://localhost:8000
```
