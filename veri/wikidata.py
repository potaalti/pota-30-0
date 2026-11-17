"""Wikidata'dan Türkiye kulüplerinde oynamış basketbolcuların doğum tarihi, boyu ve mevkisini çeker (CC0 veri).
Çıktı: veri/wikidata/oyuncular.json. Kullanım: python veri/wikidata.py"""
import json, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

KOK = Path(__file__).resolve().parent
HEDEF = KOK / "wikidata"
UA = "PotaAlti30-0/0.1 (yerel basketbol oyunu)"
# Wikidata'nın kendi sorgu hizmeti (WDQS) arızada dakikada 1 isteğe düşünce aynı veriyi sunan QLever'a geçildi
URLLER = ["https://qlever.cs.uni-freiburg.de/api/wikidata", "https://query.wikidata.org/sparql"]
ONEKLER = """PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""

SORGU = """
SELECT ?p ?ad ?trad ?dob ?h ?unit ?posLabel WHERE {
  ?p wdt:P106 wd:Q3665646 .
  ?p wdt:P54 ?team . ?team wdt:P17 wd:Q43 ; wdt:P641 wd:Q5372 .
  OPTIONAL { ?p wdt:P569 ?dob }
  OPTIONAL { ?p p:P2048/psv:P2048 [ wikibase:quantityAmount ?h ; wikibase:quantityUnit ?unit ] }
  OPTIONAL { ?p wdt:P413 ?pos . ?pos rdfs:label ?posLabel . FILTER(LANG(?posLabel) = "en") }
  OPTIONAL { ?p rdfs:label ?ad . FILTER(LANG(?ad) = "en") }
  OPTIONAL { ?p rdfs:label ?trad . FILTER(LANG(?trad) = "tr") }
}
"""


# İkinci sorgu: kulüp kaydı Wikidata'da eksik olanlar için 1960 sonrası doğumlu, boyu ya da mevkisi bilinen tüm basketbolcular
SORGU_GENIS = """
SELECT ?p ?ad ?trad ?dob ?h ?unit ?posLabel WHERE {
  ?p wdt:P106 wd:Q3665646 ; wdt:P569 ?dob .
  FILTER(?dob >= "1960-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>)
  { ?p wdt:P2048 [] } UNION { ?p wdt:P413 [] }
  OPTIONAL { ?p p:P2048/psv:P2048 [ wikibase:quantityAmount ?h ; wikibase:quantityUnit ?unit ] }
  OPTIONAL { ?p wdt:P413 ?pos . ?pos rdfs:label ?posLabel . FILTER(LANG(?posLabel) = "en") }
  OPTIONAL { ?p rdfs:label ?ad . FILTER(LANG(?ad) = "en") }
  OPTIONAL { ?p rdfs:label ?trad . FILTER(LANG(?trad) = "tr") }
}
"""


def sorgula(q):
    for url in URLLER:
        try:
            return sorgula_url(url, ONEKLER + q)
        except Exception as e:  # noqa: BLE001
            print(url, "olmadı:", e, flush=True)
    raise SystemExit("Wikidata sorgusu yapılamadı")


def sorgula_url(url, q):
    istek = urllib.request.Request(url + "?" + urllib.parse.urlencode({"query": q}),
                                   headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    for deneme in range(2):
        try:
            with urllib.request.urlopen(istek, timeout=180) as y:
                return json.load(y)["results"]["bindings"]
        except urllib.error.HTTPError as e:
            if e.code != 429 or deneme == 1:
                raise
            print("Wikidata hız sınırı, 70 sn bekleniyor", flush=True)
            time.sleep(70)


def main():
    HEDEF.mkdir(exist_ok=True)
    satirlar = sorgula(SORGU) + sorgula(SORGU_GENIS)
    oyuncular = {}
    for s in satirlar:
        q = s["p"]["value"].rsplit("/", 1)[1]
        o = oyuncular.setdefault(q, {"q": q, "ad": None, "trad": None, "dob": None, "boy": None, "mevkiler": []})
        for k, a in (("ad", "ad"), ("trad", "trad")):
            if s.get(a) and not o[k]:
                o[k] = s[a]["value"]
        if s.get("dob") and not o["dob"]:
            o["dob"] = s["dob"]["value"][:10]
        if s.get("h") and not o["boy"]:
            h, birim = float(s["h"]["value"]), s.get("unit", {}).get("value", "")
            cm = h * 100 if birim.endswith("Q11573") else h if birim.endswith("Q174728") else h * 2.54 if birim.endswith("Q218593") else None
            if cm and 150 < cm < 240:
                o["boy"] = round(cm)
        if s.get("posLabel"):
            m = s["posLabel"]["value"]
            if m not in o["mevkiler"]:
                o["mevkiler"].append(m)
    (HEDEF / "oyuncular.json").write_text(json.dumps(list(oyuncular.values()), ensure_ascii=False, indent=0), encoding="utf-8")
    hepsi = list(oyuncular.values())
    print(len(hepsi), "oyuncu;", sum(1 for o in hepsi if o["boy"]), "boylu;", sum(1 for o in hepsi if o["mevkiler"]), "mevkili;",
          sum(1 for o in hepsi if o["dob"]), "doğum tarihli")


if __name__ == "__main__":
    main()
