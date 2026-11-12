# MarktPuls

Marktüberblick auf einen Blick: Indizes weltweit, KGV, Dividendenrendite, Volatilität,
Entwicklung über mehrere Zeiträume, Zinsen, Währungen, Rohstoffe und ein Risiko-Radar aus
aktuellen Schlagzeilen.

- `docs/` – die Website (statisch, wird über GitHub Pages ausgeliefert)
- `scripts/fetch_data.py` – holt die Daten (Yahoo Finance, Google News; kein API-Key nötig)
- `.github/workflows/update.yml` – aktualisiert werktags morgens und abends und veröffentlicht

Einmalig einrichten: Repository → Settings → Pages → Source: **GitHub Actions**.

Lokal testen:

```
pip install -r requirements.txt
python scripts/fetch_data.py        # echte Daten
python -m http.server -d docs 8000  # http://localhost:8000
```
