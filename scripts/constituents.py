"""Einzelwerte je Index (Yahoo-Ticker).

Die Zusammensetzung der Indizes ändert sich gelegentlich (meist quartalsweise).
Fehlende oder nicht mehr gelistete Ticker werden beim Laden übersprungen.
Bei S&P 500 und Nasdaq 100 sind nur die größten Werte erfasst; sie machen den
Großteil des Börsenwerts aus und reichen für Kennzahlen und Kachelkarte.
"""

CONSTITUENTS = {
    "atx": {
        "note": "alle Werte",
        "tickers": [
            "ANDR.VI", "ATS.VI", "BG.VI", "CAI.VI", "CPI.VI", "DOC.VI", "EBS.VI", "EVN.VI",
            "LNZ.VI", "MMK.VI", "POST.VI", "OMV.VI", "POS.VI", "RBI.VI", "SBO.VI", "STR.VI",
            "TKA.VI", "UQA.VI", "VER.VI", "VIG.VI", "VOE.VI", "WIE.VI", "PAL.VI",
        ],
    },
    "dax": {
        "note": "alle Werte",
        "tickers": [
            "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BEI.DE", "BMW.DE", "BNR.DE",
            "CBK.DE", "CON.DE", "DTG.DE", "DBK.DE", "DB1.DE", "DHL.DE", "DTE.DE", "EOAN.DE",
            "FRE.DE", "FME.DE", "G1A.DE", "HNR1.DE", "HEI.DE", "HEN3.DE", "IFX.DE", "MBG.DE",
            "MRK.DE", "MTX.DE", "MUV2.DE", "P911.DE", "QIA.DE", "RHM.DE", "RWE.DE", "SAP.DE",
            "SRT3.DE", "SIE.DE", "ENR.DE", "SHL.DE", "SY1.DE", "VNA.DE", "VOW3.DE", "ZAL.DE",
            "G24.DE",
        ],
    },
    "sx5e": {
        "note": "alle Werte",
        "tickers": [
            "ADS.DE", "ADYEN.AS", "AD.AS", "AI.PA", "AIR.PA", "ALV.DE", "ABI.BR", "ASML.AS",
            "CS.PA", "BAS.DE", "BAYN.DE", "BBVA.MC", "SAN.MC", "BMW.DE", "BNP.PA", "DB1.DE",
            "DHL.DE", "DTE.DE", "EL.PA", "ENEL.MI", "ENI.MI", "IBE.MC", "ITX.MC", "IFX.DE",
            "INGA.AS", "ISP.MI", "OR.PA", "MC.PA", "MBG.DE", "MUV2.DE", "NOKIA.HE", "PRX.AS",
            "RI.PA", "RMS.PA", "SAF.PA", "SAN.PA", "SAP.DE", "SU.PA", "SIE.DE", "STLAM.MI",
            "TTE.PA", "UCG.MI", "DG.PA", "VOW3.DE", "WKL.AS", "RACE.MI", "NDA-FI.HE", "BN.PA",
            "SGO.PA", "RHM.DE", "ENR.DE", "KER.PA",
        ],
    },
    "smi": {
        "note": "alle Werte",
        "tickers": [
            "NESN.SW", "NOVN.SW", "RO.SW", "UBSG.SW", "ZURN.SW", "ABBN.SW", "CFR.SW", "SIKA.SW",
            "LONN.SW", "ALC.SW", "GIVN.SW", "HOLN.SW", "PGHN.SW", "SLHN.SW", "SREN.SW",
            "SCMN.SW", "SOON.SW", "KNIN.SW", "GEBN.SW", "LOGN.SW",
        ],
    },
    "dji": {
        "note": "alle Werte",
        "tickers": [
            "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS", "GS", "HD",
            "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK", "MSFT", "NKE", "NVDA", "PG",
            "SHW", "TRV", "UNH", "V", "VZ", "WMT",
        ],
    },
    "spx": {
        "note": "die 50 größten Werte",
        "tickers": [
            "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "BRK-B", "JPM",
            "LLY", "V", "UNH", "XOM", "MA", "COST", "HD", "PG", "JNJ", "NFLX", "WMT", "ABBV",
            "BAC", "CRM", "ORCL", "KO", "CVX", "MRK", "AMD", "PEP", "TMO", "ADBE", "LIN", "CSCO",
            "MCD", "ACN", "WFC", "ABT", "IBM", "GE", "PM", "DIS", "INTU", "TXN", "QCOM", "CAT",
            "VZ", "NOW", "AMGN", "ISRG", "GS", "PLTR",
        ],
    },
    "ndx": {
        "note": "die 40 größten Werte",
        "tickers": [
            "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "COST", "NFLX",
            "AMD", "PEP", "ADBE", "CSCO", "TMUS", "QCOM", "INTU", "TXN", "AMGN", "ISRG", "PLTR",
            "AMAT", "BKNG", "HON", "CMCSA", "ARM", "LRCX", "MU", "ADP", "PANW", "KLAC", "GILD",
            "SBUX", "MELI", "INTC", "VRTX", "ADI", "CRWD", "MDLZ", "CEG",
        ],
    },
}

SECTOR_DE = {
    "Technology": "Technologie",
    "Financial Services": "Finanzen",
    "Healthcare": "Gesundheit",
    "Consumer Cyclical": "Zykl. Konsum",
    "Consumer Defensive": "Basiskonsum",
    "Industrials": "Industrie",
    "Energy": "Energie",
    "Utilities": "Versorger",
    "Basic Materials": "Grundstoffe",
    "Real Estate": "Immobilien",
    "Communication Services": "Kommunikation",
}

# Aktienanzahl für Werte, bei denen Yahoo keinen Börsenwert liefert
SHARES_FALLBACK = {
    "VER.VI": 347_415_686,
    "VIG.VI": 128_000_000,
    "TKA.VI": 664_500_000,
}
