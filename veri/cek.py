"""TBF resmi API'sinden oyun verisini çeker. Ham yanıtlar önbelleğe (varsayılan: veri/ham) yazılır, tekrar çalıştırınca
çekilmiş istekler atlanır. Kullanım: python veri/cek.py [ham_klasor]"""
import json, os, sys, time, hashlib, urllib.request, urllib.error
from pathlib import Path

KOK = Path(__file__).resolve().parent
HAM = Path(sys.argv[1]) if len(sys.argv) > 1 else KOK / "ham"
HAM.mkdir(parents=True, exist_ok=True)
API = "https://www.tbf.org.tr/api"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
BEKLE = 0.3
SEZONLAR = {"bsl": [f"{y}-{y+1}" for y in range(2001, 2026)], "tbl": [f"{y}-{y+1}" for y in range(2015, 2026)]}


def getir(yol):
    dosya = HAM / (hashlib.md5(yol.encode()).hexdigest() + ".json")
    if dosya.exists():
        return json.loads(dosya.read_text(encoding="utf-8"))
    if os.environ.get("CEVRIMDISI"):  # yalnız önbellek: eksik istek boş döner
        return {"yol": yol, "yanit": None}
    for deneme in range(4):
        try:
            req = urllib.request.Request(API + yol, headers={"User-Agent": UA, "Accept": "application/json", "Referer": "https://www.tbf.org.tr/"})
            with urllib.request.urlopen(req, timeout=30) as y:
                veri = json.load(y)
            time.sleep(BEKLE)
            dosya.write_text(json.dumps({"yol": yol, "yanit": veri}, ensure_ascii=False), encoding="utf-8")
            return {"yol": yol, "yanit": veri}
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                dosya.write_text(json.dumps({"yol": yol, "yanit": None, "hata": e.code}), encoding="utf-8")
                return {"yol": yol, "yanit": None}
            time.sleep(2 * (deneme + 1))
        except Exception:  # noqa: BLE001
            time.sleep(2 * (deneme + 1))
    print("ALINAMADI", yol, flush=True)
    return {"yol": yol, "yanit": None}


def veri(yol):
    y = getir(yol)["yanit"]
    return (y or {}).get("data") if isinstance(y, dict) else None


def main():
    oyuncular = set()
    for lig, sezonlar in SEZONLAR.items():
        ligler = {x["sezon"]: x for x in json.loads((KOK / f"{lig}_ligler.json").read_text(encoding="utf-8"))}
        for s in sezonlar:
            L = ligler[s]
            fid, sid = L["faaliyet_ID"], L["sezon_ID"]
            veri(f"/League/get-standings-table?LeagueId={fid}&SeasonId={sid}&prefix={lig}")
            takimlar = veri(f"/Team/get-teams-by-leauge?leaugeId={fid}") or []
            for t in takimlar:
                st = veri(f"/Team/get-team-detail-statistic?TeamProcessId={t['teamProcessId']}&SeasonId={sid}&LeagueId={fid}&prefix={lig}") or {}
                for p in st.get("playersAverage") or []:
                    oyuncular.add(p["code"])
            print(lig, s, len(takimlar), "takım; toplam oyuncu", len(oyuncular), flush=True)
    for i, kod in enumerate(sorted(oyuncular)):
        veri(f"/Player/get-player-detail-profile-and-career-info/{kod}")
        if i % 200 == 0:
            print("profil", i, "/", len(oyuncular), flush=True)
    print("BİTTİ", flush=True)


if __name__ == "__main__":
    main()
