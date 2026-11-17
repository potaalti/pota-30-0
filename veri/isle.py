"""cek.py'nin önbelleğe aldığı TBF yanıtlarından oyun verisini üretir: site/veri/bsl.js ve site/veri/tbl.js.
Kullanım: python veri/isle.py [ham_klasor]

Her takım-sezon: ad, logo, gerçek normal sezon derecesi, oyuncular (sezon ortalamaları, uyruk, boy, mevki, güç).
Güç (g): VP ortalaması, az maç oynayanlarda yedek seviyesine çekilir ve sezonun VP ölçeğine göre normalleştirilir.
Takım gücünden galibiyet oranına giden eğri, gerçek takımların ilk beşlerinden (en çok süre alan 5) uydurulur."""
import json, math, os, re, sys, unicodedata
from difflib import SequenceMatcher
from pathlib import Path

import cek  # noqa: E402  (önbellek okuma; ağ isteği yalnız önbellekte olmayanlar için)

KOK = Path(__file__).resolve().parent
SITE = KOK.parent / "site" / "veri"
YEDEK = 5.0          # az maç oynayanların çekildiği güç
GUVEN_MAC = 8        # bu kadar maçta güvenin yarısı
# TBF bu sezonlarda yalnız sayı tutmuş (dakika, ribaund, asist yok): oyuna alınmaz
EKSIK_SEZON = {("bsl", "2004-2005"), ("bsl", "2006-2007")}
BETA = float(os.environ.get("BETA", "1.0"))  # takım averajından (maç başı sayı farkı × dakika/40) gelen pay
# Ağırlıklar geri testle seçildi (2026-11-17, veri/test_sonucu.json): BETA 0,6 → 1,0 takım değiştirenlerde tahmini
# BSL 0,56 → 0,60, TBL 0,46 → 0,49 yaptı. GAMMA (verimlilik) tahmini iyileştirmedi, 0'da bırakıldı.
GAMMA = float(os.environ.get("GAMMA", "0"))  # verimlilik katkısı: (TS% − sezon ortalaması) × 2 × şut hacmi
# Top kullanımı çakışması: güç sabitken ilk beşin toplam kullanımı (şut + 0,44 serbest atış + top kaybı) arttıkça galibiyet
# düşüyor (birim başına ~0,5 güç; BSL ve TBL'de aynı yönde). Gerçek ilk beşlerin üst çeyreğini aşan her birim cezalı.
KULLANIM_KATSAYI = 0.5


def sayi(x):
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def dakika(s):
    p = [int(x) for x in str(s or "0:0").split(":") if x.isdigit()]
    if len(p) == 3:
        return p[0] * 60 + p[1] + p[2] / 60
    if len(p) == 2:
        return p[0] + p[1] / 60
    return 0.0


def buyuk(s, turkce=True):
    """Büyük harf; Türkçe adlarda i→İ, yabancı adlarda i→I."""
    s = s or ""
    return (s.replace("i", "İ").replace("ı", "I") if turkce else s).upper().strip()


# ---- Wikidata eşleştirme (veri/wikidata.py çıktısı) ----
# Beş mevki: 1 oyun kurucu, 2 şutör gard, 3 kısa forvet, 4 uzun forvet, 5 pivot
WD_MEVKI = {"point guard": [1], "shooting guard": [2], "combo guard": [1, 2], "guard": [1, 2], "swingman": [2, 3],
            "small forward": [3], "power forward": [4], "forward": [3, 4], "center": [5], "centre": [5]}


def sade(ad):
    """Karşılaştırma için: Türkçe harfler ASCII'ye, aksanlar atılır, yalnız harf ve boşluk, büyük harf."""
    ad = (ad or "").replace("ı", "i").replace("İ", "I")
    ad = unicodedata.normalize("NFKD", ad).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z ]", " ", ad.upper()).split()


def wikidata_dizini():
    yol = KOK / "wikidata" / "oyuncular.json"
    dizin = {}
    if yol.exists():
        for w in json.loads(yol.read_text(encoding="utf-8")):
            if w.get("dob"):
                dizin.setdefault(w["dob"], []).append(w)
    return dizin


def wikidata_bul(dizin, ad, dogum):
    """Aynı doğum tarihli adaylar içinde adı en çok benzeyeni döndürür (yoksa None)."""
    if not dogum or dogum.startswith("0001") or dogum[:10] not in dizin:
        return None
    t = sade(ad)
    en_iyi, puan = None, 0.0
    for w in dizin[dogum[:10]]:
        for wad in (w.get("ad"), w.get("trad")):
            wt = sade(wad)
            if not wt or not t:
                continue
            ortak = sum(1 for x in t if len(x) >= 3 and x in wt)
            benzer = SequenceMatcher(None, " ".join(t), " ".join(wt)).ratio()
            p = ortak + benzer
            if (ortak >= 1 or benzer >= 0.7) and p > puan:
                en_iyi, puan = w, p
    return en_iyi


def mevki_sayisi(boy, rib, ast, bl, u3, dk):
    """Tahmini mevki numarası (1-5, kesirli). Katsayılar, Wikidata'da mevkisi yazılı 4.358 oyuncu-sezona en küçük kareler
    ile uyduruldu (2026-11-17). Boylu model: isabet %85, ortalama 1,46 mevki; yalnız istatistik: %83, 1,93 mevki."""
    log_oran = math.log2(ast / (rib + 0.5) + 0.01)
    if boy:
        x = -18.2653 + 0.1048 * boy - 0.2342 * log_oran + 0.3277 * bl - 0.0821 * u3
    else:
        x = 1.2464 - 0.4618 * log_oran + 0.4371 * bl - 0.1641 * u3 + 0.2125 * rib / max(dk, 5) * 30
    return max(1.0, min(5.0, x))


def mevki(boy, rib, ast, bl, u3, dk, wd_mevkiler=None):
    """Oynayabildiği mevkiler (1-5 listesi) ve kaynağı (w: Wikidata, b: boy + istatistik, o: yalnız istatistik).
    Wikidata'da yazılı mevkiler aynen; tahminde sınırdakilere komşu mevki de eklenir (yalnız istatistikle her zaman)."""
    if wd_mevkiler:
        m = sorted({x for ad in wd_mevkiler for x in WD_MEVKI.get(ad, [])})
        if m:
            return m, "w"
    x = mevki_sayisi(boy, rib, ast, bl, u3, dk)
    k = max(1, min(5, int(round(x))))
    komsu = k + (1 if x > k else -1)
    m = {k}
    if (not boy or abs(x - k) > 0.25) and 1 <= komsu <= 5:   # boysuzda her zaman komşu mevki de
        m.add(komsu)
    return sorted(m), ("b" if boy else "o")


# Beşin karakteri (oyun tasarımı tercihi; veriyle sınandığında galibiyeti güce ek olarak açıklamadı):
# - Hücum ve savunma eksenleri: beş, gerçek ilk beşlerin ortancasından ne kadar iyi/kötüyse (çeyrekler arası açıklık
#   birimiyle) EKSEN_KATSAYI kadar artı/eksi alır, en çok ±EKSEN_SINIR. Bir eksende çok iyi olan, diğerindeki eksiyi kapatabilir.
# - Rol eksikliği: asist ya da ribaund gerçek ilk beşlerin en alt %10'unun altındaysa eksik birim başına ceza.
EKSENLER = {
    "hucum": {"ad": "Hücum", "formul": {"sy": 1.0, "as": 1.5, "u3": 1.0, "tk": -1.0}},
    "savunma": {"ad": "Savunma", "formul": {"st": 2.0, "bl": 2.0, "rb": 0.5}},
}
EKSEN_KATSAYI, EKSEN_SINIR = 3.0, 4.0
DENGE = {"rb": 0.6}

# Uyum kuralları (oyun tasarımı; 2026-11-17'de gerçek ilk beşlerle sınandı: güç sabitken hiçbiri galibiyeti artırmadı,
# bazıları ters yönde çıktı; NBA'deki benzer oyunlar gibi oyun hissi için). Her kural: oyuncu koşulları (hepsi sağlanmalı),
# bunu sağlayan oyuncu sayısı en_az / en_cok sınırına uyarsa puan. Toplam etki ±UYUM_SINIR.
UYUM = [
    {"ad": "Oyun kurucu var", "aciklama": "biri maç başı ≥5,5 asist", "kosul": [["as", ">=", 5.5]], "en_az": 1, "puan": 2},
    {"ad": "Top dağıtacak kimse yok", "aciklama": "kimse ≥3 asist yapmıyor", "kosul": [["as", ">=", 3]], "en_cok": 0, "puan": -3},
    {"ad": "Pota koruyucu var", "aciklama": "biri ≥1,3 blok", "kosul": [["bl", ">=", 1.3]], "en_az": 1, "puan": 2},
    {"ad": "Pota boş", "aciklama": "kimse ≥0,6 blok yapmıyor", "kosul": [["bl", ">=", 0.6]], "en_cok": 0, "puan": -2},
    {"ad": "Dış şut bol", "aciklama": "en az 3 kişi ≥1,2 üçlük", "kosul": [["u3", ">=", 1.2]], "en_az": 3, "puan": 2},
    {"ad": "Şutör yok", "aciklama": "kimse ≥1,2 üçlük atmıyor", "kosul": [["u3", ">=", 1.2]], "en_cok": 0, "puan": -3},
    {"ad": "Yıldız ikilisi", "aciklama": "en az 2 kişi ≥16 VP", "kosul": [["vp", ">=", 16]], "en_az": 2, "puan": 2},
    {"ad": "Boyalı alan kalabalık", "aciklama": "en az 3 kişi üçlük atmayan (<0,3) ribaundçu (≥5)", "kosul": [["u3", "<", 0.3], ["rb", ">=", 5]], "en_az": 3, "puan": -3},
]
UYUM_SINIR = 5.0


def uyum_kurallari(oyuncular):
    """Sağlanan uyum kuralları ve toplam etkisi (±UYUM_SINIR)."""
    tutan = []
    for k in UYUM:
        n = sum(1 for o in oyuncular if all((o.get(a) or 0) >= e if op == ">=" else (o.get(a) or 0) < e for a, op, e in k["kosul"]))
        if ("en_az" in k and n >= k["en_az"]) or ("en_cok" in k and n <= k["en_cok"]):
            tutan.append(k)
    return tutan, max(-UYUM_SINIR, min(UYUM_SINIR, sum(k["puan"] for k in tutan)))


def toplam(oyuncular, k):
    return sum(p.get(k) or 0 for p in oyuncular)


def eksen_degeri(oyuncular, ad):
    return sum(c * toplam(oyuncular, k) for k, c in EKSENLER[ad]["formul"].items())


def esikler(takimlar):
    """Gerçek ilk beşlerden (en çok süre alan 5): rol eşikleri (alt %10) ve eksenlerin ortanca / çeyrekler arası açıklığı."""
    ilk5 = [t["oyuncular"][:5] for t in takimlar]
    e = {"rol": {}, "eksen": {}}
    v = sorted(toplam(b, "kul") for b in ilk5)
    e["kullanim"] = round(v[3 * len(v) // 4], 1)
    for k in DENGE:
        v = sorted(toplam(b, k) for b in ilk5)
        e["rol"][k] = round(v[len(v) // 10], 1)
    for ad in EKSENLER:
        v = sorted(eksen_degeri(b, ad) for b in ilk5)
        e["eksen"][ad] = {"med": round(v[len(v) // 2], 2), "iqr": round(v[3 * len(v) // 4] - v[len(v) // 4], 2)}
    return e


def denge(oyuncular, esik):
    """Hücum/savunma artı-eksisi + uyum kuralları + ribaund eksikliği cezası (güç puanı cinsinden)."""
    d = 0.0
    for ad, ek in esik["eksen"].items():
        z = (eksen_degeri(oyuncular, ad) - ek["med"]) / ek["iqr"]
        d += max(-EKSEN_SINIR, min(EKSEN_SINIR, EKSEN_KATSAYI * z))
    d -= sum(max(0.0, esik["rol"][k] - toplam(oyuncular, k)) * c for k, c in DENGE.items())
    d -= max(0.0, toplam(oyuncular, "kul") - esik["kullanim"]) * KULLANIM_KATSAYI
    return d + uyum_kurallari(oyuncular)[1]


def mevki_tutarla(cikti):
    """Tahmini mevkiyi oyuncu başına teke indirir (iki ligin bütün sezonlarının dakika × maç ağırlıklı ortalamasından),
    sonra veri/mevki_duzeltme.json'daki elle düzeltmeleri uygular (kaynak 'e')."""
    toplam_ = {}
    for takimlar in cikti.values():
        for t in takimlar:
            for o in t["oyuncular"]:
                if o["pk"] == "w":
                    continue
                a = toplam_.setdefault(o["k"], {"w": 0.0, "rb": 0.0, "as": 0.0, "bl": 0.0, "u3": 0.0, "dk": 0.0, "boy": None})
                w = o["dk"] * o["mac"]
                a["w"] += w
                for k in ("rb", "as", "bl", "u3", "dk"):
                    a[k] += o[k] * w
                a["boy"] = a["boy"] or o["boy"]
    tek = {}
    for k, a in toplam_.items():
        w = a["w"] or 1.0
        tek[k] = mevki(a["boy"], a["rb"] / w, a["as"] / w, a["bl"] / w, a["u3"] / w, a["dk"] / w)
    yol = KOK / "mevki_duzeltme.json"
    duzeltme = {int(k): v for k, v in json.loads(yol.read_text(encoding="utf-8")).items() if not k.startswith("_")} if yol.exists() else {}
    degisen = 0
    for takimlar in cikti.values():
        for t in takimlar:
            for o in t["oyuncular"]:
                if o["k"] in tek:
                    if o["p"] != tek[o["k"]][0]:
                        degisen += 1
                    o["p"], o["pk"] = tek[o["k"]]
                d = duzeltme.get(o["k"])
                if d:
                    o["p"], o["pk"] = sorted(d["p"]), "e"
                    if d.get("boy"):
                        o["boy"] = d["boy"]
    print("Mevki: tahminler oyuncu başına teke indi (" + str(degisen) + " oyuncu-sezon değişti); elle düzeltme:", len(duzeltme), "oyuncu", flush=True)


def geri_test(cikti, esik=None):
    """Dürüst sınama: takımın gerçek galibiyet oranını, ilk beşinin (en çok süre alan 5) ÖNCEKİ sezondaki güçlerinden tahmin et.
    Oyun oyuncuları başka takımlarla birleştirdiği için asıl ölçü budur. 'transfer': yalnız önceki sezon başka kulüpte olanlar.
    En az 2 oyuncusu önceki sezonda bulunan takımlar; eksik oyuncular bulunanların ortalamasıyla doldurulur. Sonuç: veri/test_sonucu.json"""
    def korelasyon(x, y):
        n = len(x); mx, my = sum(x) / n, sum(y) / n
        sx = math.sqrt(sum((a - mx) ** 2 for a in x)); sy = math.sqrt(sum((b - my) ** 2 for b in y))
        return sum((a - mx) * (b - my) for a, b in zip(x, y)) / (sx * sy) if sx and sy else 0.0
    sonuc = {"BETA": BETA, "GAMMA": GAMMA, "tarih": "2026-11-17"}
    for lig, takimlar in cikti.items():
        sezonlar = sorted({t["sezon"] for t in takimlar})
        onceki = {s: sezonlar[i - 1] for i, s in enumerate(sezonlar) if i > 0}
        deger = {}
        for t in takimlar:
            for o in t["oyuncular"]:
                k = (o["k"], t["sezon"])
                if k not in deger or o["dk"] * o["mac"] > deger[k][2]:
                    deger[k] = (o["g"], t["kulup"], o["dk"] * o["mac"], o)
        for ad, transfer in (("herkes", False), ("transfer", True)):
            x, y = [], []
            for t in takimlar:
                if t["sezon"] not in onceki or not t["gercek"]:
                    continue
                v = []
                for o in t["oyuncular"][:5]:
                    d = deger.get((o["k"], onceki[t["sezon"]]))
                    if d and not (transfer and d[1] == t["kulup"]):
                        v.append(d[0])
                if len(v) < 2:
                    continue
                g, m = map(int, t["gercek"].split("-"))
                x.append(sum(v) / len(v) * 5); y.append(g / (g + m))
            sonuc[f"{lig}_{ad}"] = {"r": round(korelasyon(x, y), 3), "n": len(x)}
        if esik:  # tam takım gücü (denge, uyum, kullanım dahil): ilk beşin beşi de önceki sezonda bulunan takımlar
            x, y = [], []
            for t in takimlar:
                if t["sezon"] not in onceki or not t["gercek"]:
                    continue
                d = [deger.get((o["k"], onceki[t["sezon"]])) for o in t["oyuncular"][:5]]
                if not all(d):
                    continue
                bes = [z[3] for z in d]
                g, m = map(int, t["gercek"].split("-"))
                x.append(sum(z[0] for z in d) + denge(bes, esik[lig])); y.append(g / (g + m))
            if len(x) > 2:
                sonuc[f"{lig}_tam"] = {"r": round(korelasyon(x, y), 3), "n": len(x)}
    print("Geri test (önceki sezon gücü → bu sezon galibiyet oranı):",
          ", ".join(f"{k} r={v['r']} (n={v['n']})" for k, v in sonuc.items() if isinstance(v, dict)), flush=True)
    (KOK / "test_sonucu.json").write_text(json.dumps(sonuc, ensure_ascii=False, indent=1), encoding="utf-8")
    return sonuc


def main():
    profiller = {}
    wd_dizin = wikidata_dizini()
    wd_esles = {}
    isabet = []
    ornek = []
    cikti = {}
    kalibrasyon = []
    esik = {}
    for lig, sezonlar in cek.SEZONLAR.items():
        ligler = {x["sezon"]: x for x in json.loads((KOK / f"{lig}_ligler.json").read_text(encoding="utf-8"))}
        kayitlar = []
        for s in sezonlar:
            L = ligler[s]
            fid, sid = L["faaliyet_ID"], L["sezon_ID"]
            tablo = cek.veri(f"/League/get-standings-table?LeagueId={fid}&SeasonId={sid}&prefix={lig}") or []
            derece = {}
            for grup in tablo:
                for r in grup.get("standings") or []:
                    o = r["o"] or (r["g"] + r["m"]) or 1
                    derece[r["takimIslemId"]] = {"g": r["g"], "m": r["m"], "sira": r["sira"], "net": (sayi(r["a"]) - sayi(r["y"])) / o}
            takimlar = cek.veri(f"/Team/get-teams-by-leauge?leaugeId={fid}") or []
            sezon_kayit = []
            if (lig, s) in EKSIK_SEZON:
                takimlar = []
            for t in takimlar:
                st = cek.veri(f"/Team/get-team-detail-statistic?TeamProcessId={t['teamProcessId']}&SeasonId={sid}&LeagueId={fid}&prefix={lig}") or {}
                oyuncular = []
                for p in st.get("playersAverage") or []:
                    if p["code"] not in profiller:
                        pr = (cek.veri(f"/Player/get-player-detail-profile-and-career-info/{p['code']}") or {}).get("playerProfile") or {}
                        profiller[p["code"]] = pr
                    pr = profiller[p["code"]]
                    mac = int(p.get("macSayisi") or 0)
                    dk = dakika(p.get("sureOrtalama"))
                    if mac < 3 or dk < 4:
                        continue
                    rb, ast = sayi(p.get("trOrtalama")), sayi(p.get("asistOrtalama"))
                    if p["code"] not in wd_esles:
                        wd_esles[p["code"]] = wikidata_bul(wd_dizin, pr.get("fullName") or f"{p.get('firstName', '')} {p.get('lastName', '')}", pr.get("birthDate"))
                    wd = wd_esles[p["code"]]
                    boy = pr.get("height") or (wd or {}).get("boy") or None
                    bl, u3 = sayi(p.get("blokOrtalama")), sayi(p.get("puan30Ortalama"))
                    mk, mk_kaynak = mevki(boy, rb, ast, bl, u3, dk, (wd or {}).get("mevkiler"))
                    if wd and wd.get("mevkiler"):  # tahmin isabetini Wikidata'ya karşı ölç
                        tah, _ = mevki(boy, rb, ast, bl, u3, dk)
                        tah_boysuz, _ = mevki(None, rb, ast, bl, u3, dk)
                        isabet.append((bool(set(tah) & set(mk)), bool(set(tah_boysuz) & set(mk)), len(tah), len(tah_boysuz), bool(boy)))
                        ornek.append({"boy": boy, "rb": rb, "as": ast, "bl": bl, "u3": u3, "dk": dakika(p.get("sureOrtalama")), "m": mk})
                    oyuncular.append({
                        "k": p["code"], "ad": buyuk(f"{p.get('firstName', '')} {p.get('lastName', '')}", buyuk(pr.get("country")) == "TÜRKİYE"),
                        "tr": 1 if buyuk(pr.get("country")) == "TÜRKİYE" else 0, "ulke": buyuk(pr.get("country")) or None,
                        "boy": boy, "mac": mac, "dk": round(dk, 1),
                        "sy": round(sayi(p.get("sayiOrtalama")), 1), "rb": round(rb, 1), "as": round(ast, 1),
                        "st": round(sayi(p.get("topCalmaOrtalama")), 1), "bl": round(sayi(p.get("blokOrtalama")), 1),
                        "tk": round(sayi(p.get("topKaybiOrtalama")), 1),
                        "fga": round(sayi(p.get("agDeneme")), 2), "fta": round(sayi(p.get("sA1Ortalama")), 2),
                        "u3": round(sayi(p.get("puan30Ortalama")), 1), "vp": round(sayi(p.get("vpOrtalama")), 1),
                        "p": mk, "pk": mk_kaynak,
                    })
                if len(oyuncular) < 5:
                    continue
                oyuncular.sort(key=lambda o: -o["dk"] * o["mac"])
                d = derece.get(t["teamProcessId"])
                sezon_kayit.append({"id": f"{lig}{s[2:4]}{s[7:9]}-{t['teamProcessId']}", "lig": lig, "sezon": f"{s[:4]}-{s[7:9]}", "kulup": t.get("teamId"),
                                    "ad": buyuk(t["teamName"]), "logo": t.get("teamLogoUrl") or "",
                                    "gercek": f"{d['g']}-{d['m']}" if d else None, "sira": d["sira"] if d else None,
                                    "net": round(d["net"], 1) if d else 0,
                                    "oyuncular": oyuncular})
            # şut verimliliği (TS%) ve top kullanımı; sezonun lig ortalaması TS%'ine göre verim katkısı
            hacim = lambda o: o["fga"] + 0.44 * o["fta"]
            pay_ = sum(o["sy"] * o["mac"] for tk in sezon_kayit for o in tk["oyuncular"])
            payda = sum(2 * hacim(o) * o["mac"] for tk in sezon_kayit for o in tk["oyuncular"]) or 1
            ts_sezon = pay_ / payda
            for tk in sezon_kayit:
                for o in tk["oyuncular"]:
                    o["ts"] = round(o["sy"] / (2 * hacim(o)), 3) if hacim(o) > 0 else None
                    o["kul"] = round(hacim(o) + o["tk"], 1)
                    o["verim"] = round(((o["ts"] or ts_sezon) - ts_sezon) * 2 * hacim(o), 2)  # ortalama isabete göre maç başı fazla sayı
            # güç: güvenle büzülmüş VP; sezon ölçeği sonradan normalleştirilir
            for tk in sezon_kayit:
                for o in tk["oyuncular"]:
                    o["_ham"] = (o["mac"] * o["vp"] + GUVEN_MAC * YEDEK) / (o["mac"] + GUVEN_MAC)
            ilk5 = [sum(o["_ham"] for o in tk["oyuncular"][:5]) for tk in sezon_kayit]
            if sezon_kayit:
                kayitlar.append((s, sezon_kayit, sum(ilk5) / len(ilk5)))
            print(lig, s, len(sezon_kayit), "takım", flush=True)

        if not kayitlar:
            continue
        genel = sum(k[2] for k in kayitlar) / len(kayitlar)
        esik[lig] = esikler([tk for _, sk, _ in kayitlar for tk in sk])
        print(lig, "denge eşikleri", esik[lig], flush=True)
        takimlar_hepsi = []
        for s, sezon_kayit, ort in kayitlar:
            olcek = genel / ort
            for tk in sezon_kayit:
                for o in tk["oyuncular"]:
                    guven = o["mac"] / (o["mac"] + GUVEN_MAC)
                    o["g"] = round(o.pop("_ham") * olcek + (BETA * max(-8.0, tk["net"]) * o["dk"] / 40 + GAMMA * o["verim"]) * guven, 2)
                bes = tk["oyuncular"][:5]
                R = sum(o["g"] for o in bes) + denge(bes, esik[lig])
                if tk["gercek"]:
                    g, m = map(int, tk["gercek"].split("-"))
                    if g + m >= 10:
                        kalibrasyon.append((lig, R, g / (g + m)))
                takimlar_hepsi.append(tk)
        cikti[lig] = takimlar_hepsi

    mevki_tutarla(cikti)
    geri_test(cikti, esik)

    # galibiyet eğrisi: p = 1 / (1 + exp(-(R - orta) / olcek)). Güç ölçümündeki gürültü eğimi düzleştirmesin diye
    # sıralama eşleştirmesiyle uydurulur: k. en güçlü ilk beş, k. en yüksek galibiyet oranıyla eşlenir.
    parametreler = {}
    for lig in cikti:
        ham_nokta = [(R, w) for l, R, w in kalibrasyon if l == lig]
        r_ham = [R for R, _ in ham_nokta]
        if len(ham_nokta) > 2:
            ort_r, ort_w = sum(r_ham) / len(r_ham), sum(w for _, w in ham_nokta) / len(ham_nokta)
            kov = sum((R - ort_r) * (w - ort_w) for R, w in ham_nokta)
            sr = math.sqrt(sum((R - ort_r) ** 2 for R in r_ham)); sw = math.sqrt(sum((w - ort_w) ** 2 for _, w in ham_nokta))
            print(lig, "ilk beş gücü ~ galibiyet oranı korelasyonu", round(kov / (sr * sw), 3), flush=True)
        nokta = list(zip(sorted(r_ham), sorted(w for _, w in ham_nokta)))
        en_iyi = None
        for orta10 in range(200, 1200, 5):
            for olcek10 in range(10, 300, 2):
                orta, olcek = orta10 / 10, olcek10 / 10
                hata = sum((w - 1 / (1 + math.exp(-(R - orta) / olcek))) ** 2 for R, w in nokta)
                if en_iyi is None or hata < en_iyi[0]:
                    en_iyi = (hata, orta, olcek)
        Rler = sorted(R for R, _ in nokta)
        parametreler[lig] = {"orta": en_iyi[1], "olcek": en_iyi[2], "n": len(nokta),
                             "rmse": round(math.sqrt(en_iyi[0] / len(nokta)), 3), "Rmax": round(Rler[-1], 1), "Rmed": round(Rler[len(Rler) // 2], 1)}
        print(lig, parametreler[lig], flush=True)

    bulunan = [w for w in wd_esles.values() if w]
    print("Wikidata eşleşmesi:", len(bulunan), "/", len(wd_esles), "oyuncu;", sum(1 for w in bulunan if w["mevkiler"]), "mevkili,",
          sum(1 for w in bulunan if w["boy"]), "boylu", flush=True)
    boylu = [i for i in isabet if i[4]]
    if isabet:
        print("Mevki tahmini, Wikidata'ya göre isabet (tahmin kümesi gerçek mevkilerden birini içeriyor):",
              f"boy+istatistik %{100 * sum(i[0] for i in boylu) / max(1, len(boylu)):.0f} (ort. {sum(i[2] for i in boylu) / max(1, len(boylu)):.2f} mevki),",
              f"yalnız istatistik %{100 * sum(i[1] for i in isabet) / len(isabet):.0f} (ort. {sum(i[3] for i in isabet) / len(isabet):.2f} mevki)", flush=True)
    if os.environ.get("MEVKI_ORNEK"):
        Path(os.environ["MEVKI_ORNEK"]).write_text(json.dumps(ornek), encoding="utf-8")
    SITE.mkdir(parents=True, exist_ok=True)
    mac_sayisi = {"bsl": 30, "tbl": 32}
    for takimlar in cikti.values():  # yalnız ara hesap için gereken alanlar dosyaya yazılmaz
        for t in takimlar:
            for o in t["oyuncular"]:
                for k in ("fga", "fta", "verim", "mk"):
                    o.pop(k, None)
    for lig, takimlar in cikti.items():
        veri = {"lig": lig, "mac": mac_sayisi[lig], "egri": parametreler[lig], "esik": esik[lig], "denge": DENGE,
                "eksenler": EKSENLER, "eksenKatsayi": EKSEN_KATSAYI, "eksenSinir": EKSEN_SINIR,
                "uyum": UYUM, "uyumSinir": UYUM_SINIR, "kullanimKatsayi": KULLANIM_KATSAYI, "takimlar": takimlar}
        (SITE / f"{lig}.js").write_text("window.VERI=window.VERI||{};window.VERI." + lig + "=" + json.dumps(veri, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
        oy = sum(len(t["oyuncular"]) for t in takimlar)
        tr = sum(o["tr"] for t in takimlar for o in t["oyuncular"])
        print(lig, len(takimlar), "takım-sezon,", oy, "oyuncu-sezon,", tr, "Türk;", (SITE / f"{lig}.js").stat().st_size // 1024, "KB", flush=True)


if __name__ == "__main__":
    main()
