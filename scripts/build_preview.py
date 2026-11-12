#!/usr/bin/env python3
"""Baut eine einzelne HTML-Datei (CSS, JS und Daten eingebettet) für die Vorschau."""
import re
import sys
from pathlib import Path

docs = Path(__file__).resolve().parent.parent / "docs"
out = Path(sys.argv[1])
html = (docs / "index.html").read_text()
body = re.search(r"<!--BODY-->(.*)<!--/BODY-->", html, re.S).group(1)
data = (docs / "data.json").read_text().replace("</", "<\\/")
page = f"""<title>MarktPuls</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap">
<style>
{(docs / "style.css").read_text()}
</style>
{body}
<script>window.__DATA__ = {data};</script>
<script>
{(docs / "app.js").read_text()}
</script>
"""
out.write_text(page)
print(out, len(page) // 1024, "KB")
