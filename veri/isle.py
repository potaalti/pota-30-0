"""cek.py'nin önbelleğe aldığı TBF yanıtlarından oyun verisini üretir: site/veri/bsl.js ve site/veri/tbl.js.
Kullanım: python veri/isle.py [ham_klasor]

Her takım-sezon: ad, logo, gerçek normal sezon derecesi, oyuncular (sezon ortalamaları, uyruk, boy, mevki, güç).
Güç (g): VP ortalaması, az maç oynayanlarda yedek seviyesine çekilir ve sezonun VP ölçeğine göre normalleştirilir.
Takım gücünden galibiyet oranına giden eğri, gerçek takımların ilk beşlerinden (en çok süre alan 5) uydurulur."""
import json, math, os, re, sys, unicodedata, urllib.parse
from difflib import SequenceMatcher
from pathlib import Path

import cek  # noqa: E402  (önbellek okuma; ağ isteği yalnız önbellekte olmayanlar için)

KOK = Path(__file__).resolve().parent
SITE = KOK.parent / "site" / "veri"
YEDEK = 5.0          # az maç oynayanların çekildiği güç
GUVEN_MAC = 8        # bu kadar maçta güvenin yarısı
EN_AZ_MAC = 6         # kadroda görünmek için en az maç
# TBF bu sezonlarda yalnız sayı tutmuş (dakika, ribaund, asist yok): oyuna alınmaz
EKSIK_SEZON = {("bsl", "2004-2005"), ("bsl", "2006-2007")}
BETA = float(os.environ.get("BETA", "1.0"))  # takım averajından (maç başı sayı farkı × dakika/40) gelen pay
# Ağırlıklar geri testle seçildi (2026-11-17, veri/test_sonucu.json): BETA 0,6 → 1,0 takım değiştirenlerde tahmini
# BSL 0,56 → 0,60, TBL 0,46 → 0,49 yaptı. GAMMA (verimlilik) tahmini iyileştirmedi, 0'da bırakıldı.
GAMMA = float(os.environ.get("GAMMA", "0"))  # verimlilik katkısı: (TS% − sezon ortalaması) × 2 × şut hacmi
# Averaj eğrisi (2026-11-20, kullanıcı: "liderler ödüllendirilsin, geri kalan çok öldürülmesin"): doğrusal BETA × averaj
# yerine ligine göre eğri: sayılan = c + p×averaj + q×max(0, averaj−k) (averaj ≥ 0), c + s×max(−12, averaj) (averaj < 0).
# Hedef: 10 VP'li oyuncunun gücü takımının sırasına göre BSL lider 14,1 · 2.-4. 12,2 · 5.-8. 10 · orta 9 · son iki 8;
# TBL 12,5 · 11 · 10 · 9,5 · 8,5. Parametreler bu hedeflere veriden uyduruldu (BSL en büyük sapma 0,02, TBL 0,17).
# Önceki (BETA 1, alt sınır −8): BSL 14,1 · 12,2 · 9,5 · 7,2 · 5,2; TBL 13,1 · 11,7 · 10,0 · 7,6 · 5,4.
AVERAJ_EGRI = {"bsl": {"c": 1.5, "p": 0.55, "q": 0.5, "k": 4, "s": 0.35},
               "tbl": {"c": 1.8, "p": 0.2, "q": 1.1, "k": 6, "s": 0.3}}


def averaj_sayilan(lig, net):
    e = AVERAJ_EGRI[lig]
    if net >= 0:
        return e["c"] + e["p"] * net + e["q"] * max(0.0, net - e["k"])
    return e["c"] + e["s"] * max(-12.0, net)
# Top kullanımı çakışması: güç sabitken ilk beşin toplam kullanımı (şut + 0,44 serbest atış + top kaybı) arttıkça galibiyet
# düşüyor (birim başına ~0,5 güç; BSL ve TBL'de aynı yönde). Gerçek ilk beşlerin üst %10'unu aşan her birim cezalı
# (2026-11-18: üst çeyrekten yükseltildi). Ceza en çok KULLANIM_SINIR: veride ~79'un üstünde neredeyse takım yok
# (eşik + ~11 birim ≈ −5,5), ötesi kanıtsız; beş skorer yan yana tek başına takımı çökertmesin.
KULLANIM_KATSAYI = 0.5
KULLANIM_SINIR = 99.0  # klasik sistem dünkü hâliyle: eşik üst çeyrek, tavan yok (2026-11-18, kullanıcı)
# Cezasız bant (2026-11-19, kullanıcı: BSL 58–67): eşiğin (gerçek ilk beşlerin üst çeyreği, BSL 63,7) 0,9105 ile 1,0518
# katı arası; üstünü aşan her birim "Top yetmiyor", altında kalan her birim "Şut yaratan yok" −0,5 güç.
# BSL 58,5–67,5, TBL 58,8–67,8 (kullanıcı; önce ±%7: 59,2–68,2, sonra 58–67).
KULLANIM_ALT_ORAN, KULLANIM_UST_ORAN = 58.5 / 63.7, 67.5 / 63.7
# Oyun eğrisi: gerçek takımlardan uydurulan eğri bu kat dikleştirilir (2026-11-18, kullanıcıyla: gerçekçi eğri iyi
# kurulan beşi ~%70'te tutuyordu). Zayıf beşler neredeyse aynı kalır, güçlüler daha çok kazanır. 1 = gerçekçi.
OYUN_DIKLIK = 1.0  # klasik sistemde eğri dikleştirilmez; kolaylık KLASIK_KOLAY ile
# Klasik sistem ~%6-7 kolay (2026-11-18, kullanıcı; önce %10 denendi, fazla geldi): eğrinin ortası bu kadar güç aşağı
# kayar; akıllı kurulan beşin (her tur en yüksek güç × mevki uyumu) ortalama galibiyeti ~%6-7 artar.
# Kullanım bandı (±%7) tek başına güçle kurulan beşi BSL'de 20,1 → 21,0, TBL'de 20,6 → 21,1 yapıyor; kalan kayma toplamı
# ~%6-7'de tutar: BSL → ~21,45 / 30 (+%6,7), TBL → ~21,9 / 32 (+%6,5).
# 2026-11-20: averaj eğrisinden (AVERAJ_EGRI) sonra oyun düne göre ~%17 kolaylaştı; kullanıcı ~%12 istedi: güçle kurulan
# beş BSL 20,1 → ~22,5 / 30, TBL 20,6 → ~23,1 / 32 (Lig modu da ~22,7 / ~23,1).
KLASIK_KOLAY = {"bsl": -1.25, "tbl": -0.5}
# Tek lig (2026-11-19): sezon gerçek takımlara karşı ikili oynanınca rakiplerin güç dağılımı yüzünden güçle kurulan beş
# BSL 21,5 → 20,7, TBL 22,0 → 21,5 oluyordu; kurulan beşe bu kadar güç eklenince kolaylık yine ~%6-7.
KLASIK_LIG_EK = {"bsl": 2.8, "tbl": 1.8}
# Maç motoru (site/motor.js): motorun beklenen farkları gerçek takımlarınkinden dar; galibiyet oranlarına sıralama
# eşleştirmesiyle bakıldığında lig başına bu kat açılınca gerçeğe oturuyor (2026-11-18 ölçümü).
MOTOR_GERCEK = {"bsl": 1.03, "tbl": 0.94}  # rol sinerjisiyle birlikte yeniden ölçüldü (2026-11-18)
# Oyun ayarı (yalnız kurulan beşler): farklar ×1,15, beşin oyuncuları en az 34 dk oynar (en çok %35 fazla), rol sinerjisi
# ×2. Taslak ölçümü (BSL, ortalama galibiyet / 30): VP'ye göre 20,7, skora göre 17,4, rolleri tamamlayarak 21,8; en iyi
# %10'un 30-0 şansı VP'de ~%6, rolleri tamamlayanda ~%10. Sinerji beşlerin %80'inde −3…+14 sayı/maç arası
# (×3'te AI'nın rolleri tam beşi +19 buluyordu: yeteneği bastırıyordu).
MOTOR_OYUN = {"bsl": 1.15, "tbl": 1.15}
MOTOR_OYUN_DAKIKA = 34
MOTOR_OYUN_SINERJI = 2
# Maç motoru (site/motor.js) için oyuncunun maç başı ham kutu istatistikleri. Dönem farkı sezonun lig ortalamasına
# bölünüp bütün sezonların ortalamasıyla çarpılarak giderilir; isabet yüzdeleri az denemede lig ortalamasına çekilir.
MOTOR_ALAN = [("a2", "puan21Ortalama"), ("m2", "puan20Ortalama"), ("a3", "puan31Ortalama"), ("m3", "puan30Ortalama"),
              ("fa", "sA1Ortalama"), ("fm", "sA0Ortalama"), ("or", "hrOrtalama"), ("dr", "drOrtalama"), ("as", "asistOrtalama"),
              ("st", "topCalmaOrtalama"), ("bl", "blokOrtalama"), ("tk", "topKaybiOrtalama"), ("pf", "faulOrtalama")]
MOTOR_SIRA = ["dk"] + [k for k, _ in MOTOR_ALAN]
ISABET_GUVEN = {"m2": ("a2", 60), "m3": ("a3", 60), "fm": ("fa", 40)}  # bu kadar denemede yarı yarıya lig ortalamasına çekilir


def motor_vektor(o, Ls, La):
    m = o.pop("_m")
    if m["or"] + m["dr"] <= 0 and o["rb"] > 0:  # hücum/savunma ayrımı yoksa lig oranıyla böl
        pay = Ls["or"] / max(1e-9, Ls["or"] + Ls["dr"])
        m["or"], m["dr"] = o["rb"] * pay, o["rb"] * (1 - pay)
    cikis = {}
    for k, _ in MOTOR_ALAN:
        if k not in ISABET_GUVEN:
            cikis[k] = m[k] * (La[k] / Ls[k] if Ls[k] > 0 else 1.0)
    if Ls["or"] <= 1e-6:  # BSL 2008-09: TBF hücum ribaundunu tutmamış, savunma alanında toplam var → toplamı lig oranıyla böl
        toplam_rb = (m["or"] + m["dr"]) * (La["or"] + La["dr"]) / max(1e-9, Ls["or"] + Ls["dr"])
        pay = La["or"] / (La["or"] + La["dr"])
        cikis["or"], cikis["dr"] = toplam_rb * pay, toplam_rb * (1 - pay)
    for mm, (a, K) in ISABET_GUVEN.items():
        ps, pa = Ls[mm] / max(1e-9, Ls[a]), La[mm] / max(1e-9, La[a])
        yuzde = (m[mm] * o["mac"] + K * ps) / (m[a] * o["mac"] + K)
        cikis[mm] = cikis[a] * max(0.0, min(1.0, yuzde - ps + pa))
    return [round(o["dk"], 1)] + [round(cikis[k], 2) for k, _ in MOTOR_ALAN]


# Roller (Basketball GM'nin beceri etiketlerinden esinle): oyuncunun 40 dakikaya vurulmuş, dönem farkı giderilmiş, az
# maçta lig ortalamasına çekilmiş istatistiğinden altı rol puanı (0-1). Düzenli oyuncuların (15+ dk) üst çeyreği 0,5,
# üst %10'u ~0,9 alır. Motor beşteki rol sayılarından sinerji hesaplar (site/motor.js).
ROLLER = ["sut", "ok", "ic", "pota", "cevre", "rib"]


def rol_ham(r40):
    p3, p3L = r40["m3"] / max(0.1, r40["a3"]), r40["_p3L"]
    return {"sut": r40["m3"] * max(0.7, min(1.3, p3 / p3L)), "ok": r40["as"] - 0.3 * r40["tk"], "ic": r40["m2"] + 0.4 * r40["fm"],
            "pota": r40["bl"] + 0.1 * r40["dr"], "cevre": r40["st"], "rib": r40["or"] + r40["dr"]}


def rol_hesapla(takimlar, La):
    p3L = La["m3"] / La["a3"]

    def r40(o):
        m = dict(zip(MOTOR_SIRA, o["m"])); dk = max(1.0, m["dk"]); w = o["mac"] / (o["mac"] + GUVEN_MAC)
        x = {k: w * m[k] / dk * 40 + (1 - w) * La[k] * 40 for k in MOTOR_SIRA if k != "dk"}
        x["_p3L"] = p3L
        return x
    ham = [(o, rol_ham(r40(o))) for t in takimlar for o in t["oyuncular"]]
    duzenli = [h for o, h in ham if o["dk"] >= 15]
    esik = {}
    for k in ROLLER:
        v = sorted(h[k] for h in duzenli)
        esik[k] = (v[int(0.75 * len(v))], max(1e-6, v[int(0.9 * len(v))] - v[int(0.75 * len(v))]))

    def puan(h):
        return [round(1 / (1 + math.exp(-2.2 * (h[k] - esik[k][0]) / esik[k][1])), 2) for k in ROLLER]
    for o, h in ham:
        o["r"] = puan(h)
    ort = {k: La[k] * 40 for k in MOTOR_SIRA if k != "dk"}
    ort["_p3L"] = p3L
    return puan(rol_ham(ort))


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
# 2026-11-20 (kullanıcı: her barem bir kez hesaplansın): eksenler kaldırıldı. Bileşenleri (top çalma, ribaund, asist,
# top kaybı) zaten kendi baremlerinde, sayı da VP'de sayılıyordu; üçlük ve blok 2026-11-19'dan beri yalnız uyum
# kurallarında. Önceki tanım: Hücum = sy + 1,5×as − tk, Savunma = 2×st + 0,5×rb.
EKSENLER = {}
EKSEN_KATSAYI, EKSEN_SINIR = 3.0, 4.0
# Rol eksikliği: beşin TOPLAMI gerçek ilk beşlerin alt %10'unun altındaysa eksik birim başına ceza. Asist toplamdan bakılır:
# topu birden çok oyuncu paylaşabilir (2026-11-18, kullanıcı önerisi; eski "kimse ≥3 asist yapmıyor −3" kuralının yerine).
DENGE = {"rb": 0.6, "as": 1.0}

# Uyum kuralları (oyun tasarımı; 2026-11-17'de gerçek ilk beşlerle sınandı: güç sabitken hiçbiri galibiyeti artırmadı,
# bazıları ters yönde çıktı; NBA'deki benzer oyunlar gibi oyun hissi için). Her kural: oyuncu koşulları (hepsi sağlanmalı),
# bunu sağlayan oyuncu sayısı en_az / en_cok sınırına uyarsa puan. Toplam etki ±UYUM_SINIR.
# 2026-11-19 (kullanıcı): uyum kuralları başka kuralın baktığı istatistiğe bakmaz. Asist (asist baremi), top çalma, top
# kaybı, ribaund, top kullanımı, şut verimi ve VP (oyuncu gücü) kendi kurallarında; uyum yalnız blok, üçlük ve mevkiye bakar.
# Çıkanlar: "Oyun kurucu var" (asist), "Yıldız ikilisi" (VP). "Boyalı alan kalabalık" ribaund yerine mevkiye bakar.
UYUM = [
    {"ad": "Pota koruyucu var", "aciklama": "biri ≥1,2 blok", "kosul": [["bl", ">=", 1.2]], "en_az": 1, "puan": 2},
    {"ad": "Pota boş", "aciklama": "kimse ≥0,5 blok yapmıyor", "kosul": [["bl", ">=", 0.5]], "en_cok": 0, "puan": -2},  # 2026-11-20 kullanıcı: 0,6 → 0,5
    {"ad": "Dış şut bol", "aciklama": "en az 3 kişi ≥1,2 üçlük", "kosul": [["u3", ">=", 1.2]], "en_az": 3, "puan": 2},
    {"ad": "Şutör yok", "aciklama": "kimse ≥1,2 üçlük atmıyor", "kosul": [["u3", ">=", 1.2]], "en_cok": 0, "puan": -3},
    {"ad": "Boyalı alan kalabalık", "aciklama": "en az 3 uzun (mevki 4-5) üçlük atmıyor (<0,3)", "kosul": [["uz", ">=", 1], ["u3", "<", 0.3]], "en_az": 3, "puan": -3},
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
    kul = toplam(oyuncular, "kul")
    d -= min(KULLANIM_SINIR, max(0.0, kul - esik["kullanim"] * KULLANIM_UST_ORAN) * KULLANIM_KATSAYI)
    d -= min(KULLANIM_SINIR, max(0.0, esik["kullanim"] * KULLANIM_ALT_ORAN - kul) * KULLANIM_KATSAYI)
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


LOGO_GENEL = {"logo", "logosu", "yeni", "renkli", "beyaz", "zemin", "kopya", "copy", "basketbol", "basket", "spor", "kulubu",
              "kulup", "belediye", "belediyesi", "belediyespor", "buyuksehir", "orjinal", "cmyk", "png", "jpg", "gif", "jpeg", "fsbin"}


def _kelimeler(x):
    x = urllib.parse.unquote(x or "").replace("ı", "i").replace("İ", "I")
    x = unicodedata.normalize("NFKD", x).encode("ascii", "ignore").decode().lower()
    return {k for k in re.findall(r"[a-z]{4,}", x) if k not in LOGO_GENEL}


def _ad_bicimleri(ad):
    """Takım adı kelimeleri iki biçimde: Türkçe harfler sadeleşmiş (bahcesehir) ve düşmüş (baheehir); dosya adlarında ikisi de var."""
    a = (ad or "").lower().replace("ı", "i").replace("i̇", "i")
    sade = unicodedata.normalize("NFKD", a).encode("ascii", "ignore").decode()
    dusuk = re.sub(r"[^a-z ]", "", "".join(ch if ch.isascii() else "" for ch in a))
    return {k for k in re.findall(r"[a-z]{6,}", sade + " " + dusuk) if k not in LOGO_GENEL}


def _dosya_metni(url):
    x = urllib.parse.unquote((url or "").rsplit("/", 1)[-1]).replace("ı", "i").replace("İ", "I")
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", x).encode("ascii", "ignore").decode().lower())


def vatandaslik_uygula(cikti):
    """TBF profili bugünkü uyruğu verir; sonradan vatandaş olanlar her sezonda Türk görünür. veri/vatandaslik.json'daki
    sezon aralıkları dışında bu oyuncular yabancı sayılır (2026-11-19, kullanıcı)."""
    yol = KOK / "vatandaslik.json"
    if not yol.exists():
        return
    liste = {int(k): v for k, v in json.loads(yol.read_text(encoding="utf-8")).items() if not k.startswith("_")}
    degisen = 0
    for takimlar in cikti.values():
        for t in takimlar:
            for o in t["oyuncular"]:
                v = liste.get(o["k"])
                if not v:
                    continue
                turk = any(a <= t["sezon"] and (b is None or t["sezon"] <= b) for a, b in v["turk"])
                if o["tr"] != (1 if turk else 0):
                    degisen += 1
                o["tr"] = 1 if turk else 0
                o["ulke"] = "TÜRKİYE" if turk else v.get("ulke")
                o["ad"] = v["ad"] if turk else v.get("ad_yabanci", v["ad"])
    print("Vatandaşlık:", len(liste), "oyuncu,", degisen, "oyuncu-sezon yabancıya döndü", flush=True)


def logo_duzelt(cikti):
    """TBF bazı eski sezonlarda kulübün başka dönemine ya da başka kulübe ait logoyu veriyor (ör. Banvit sezonlarında
    "bandirma-bk-logo", Bandırma Kırmızı'da "Sigortam.net"). Kural: logo dosyasının adındaki bir kelime başka bir takımın
    adında geçiyor ama o sezonun takım adında geçmiyorsa logo yanlış sayılır; yerine aynı kulübün aynı adlı en yakın sezonunun
    doğru logosu konur, yoksa logo boş kalır (oyun baş harfleri gösterir). veri/logo_duzeltme.json elle düzeltmedir:
    {"<takım-sezon id>": "<logo adresi ya da boş>"} ve her kuralın önüne geçer."""
    yol = KOK / "logo_duzeltme.json"
    elle = {k: v for k, v in json.loads(yol.read_text(encoding="utf-8")).items() if not k.startswith("_")} if yol.exists() else {}
    hepsi = [t for takimlar in cikti.values() for t in takimlar]
    ad_kelimeleri = set().union(*(_ad_bicimleri(t["ad"]) for t in hepsi))
    def yanlis(t):
        metin = _dosya_metni(t["logo"])
        a = (t["ad"] or "").lower().replace("ı", "i").replace("i̇", "i")
        sade = unicodedata.normalize("NFKD", a).encode("ascii", "ignore").decode()
        dusuk = "".join(ch if ch.isascii() else "" for ch in a)  # dosya adlarında Türkçe harf düşmüş olabilir (KARIYAKA)
        kendi = set(re.findall(r"[a-z]{4,}", sade + " " + dusuk)) - LOGO_GENEL
        if any(k[:5] in metin for k in kendi):  # dosya adı kendi adından bir kelime içeriyorsa doğru sayılır
            return False
        return any(k in metin for k in ad_kelimeleri)
    duzelen, bos = 0, 0
    for t in hepsi:
        if t["id"] in elle:
            t["logo"] = elle[t["id"]]; continue
        if not t["logo"] or not yanlis(t):
            continue
        yil = int(t["sezon"][:4])
        adaylar = [x for x in hepsi if x["kulup"] == t["kulup"] and x["ad"] == t["ad"] and x["logo"] and not yanlis(x) and x["id"] != t["id"]]
        eski = t["logo"]
        if adaylar:
            t["logo"] = min(adaylar, key=lambda x: abs(int(x["sezon"][:4]) - yil))["logo"]; duzelen += 1
        else:
            t["logo"] = ""; bos += 1
        if os.environ.get("LOGO_RAPOR"):
            print("  logo:", t["lig"], t["sezon"], t["ad"], "|", urllib.parse.unquote(eski.rsplit("/", 1)[-1])[-40:], "→", urllib.parse.unquote(t["logo"].rsplit("/", 1)[-1])[-40:] or "(baş harf)")
    print("Logo: yanlış görünen", duzelen + bos, "takım-sezon;", duzelen, "en yakın doğru logoyla değişti,", bos, "boş (baş harf); elle:", len(elle), flush=True)


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
    motor_lig = {}
    for lig, sezonlar in cek.SEZONLAR.items():
        ligler = {x["sezon"]: x for x in json.loads((KOK / f"{lig}_ligler.json").read_text(encoding="utf-8"))}
        kayitlar = []
        lig_top = {k: 0.0 for k in MOTOR_SIRA}
        for s in sezonlar:
            sezon_top = {k: 0.0 for k in MOTOR_SIRA}
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
                    ham_m = {k: sayi(p.get(f)) for k, f in MOTOR_ALAN}
                    for k in ham_m:
                        sezon_top[k] += ham_m[k] * mac
                    sezon_top["dk"] += dk * mac
                    if mac < EN_AZ_MAC or dk < 4:  # az oynayanlar kadroda gösterilmez (kullanıcı isteği, 2026-11-17)
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
                        "p": mk, "pk": mk_kaynak, "_m": ham_m, "uz": 1 if max(mk) >= 4 else 0,
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
                Ls = {k: sezon_top[k] / max(1e-9, sezon_top["dk"]) for k in MOTOR_SIRA if k != "dk"}
                for k in MOTOR_SIRA:
                    lig_top[k] += sezon_top[k]
                kayitlar.append((s, sezon_kayit, sum(ilk5) / len(ilk5), Ls))
            print(lig, s, len(sezon_kayit), "takım", flush=True)

        if not kayitlar:
            continue
        genel = sum(k[2] for k in kayitlar) / len(kayitlar)
        La = {k: lig_top[k] / max(1e-9, lig_top["dk"]) for k in MOTOR_SIRA if k != "dk"}
        dk_or = sum(sum(o["dk"] * o["mac"] for tk in sk for o in tk["oyuncular"]) for _, sk, _, L_ in kayitlar if L_["or"] > 1e-6)
        if dk_or:  # hücum ribaundu ortalaması yalnız onu tutan sezonlardan
            for k in ("or", "dr"):
                La[k] = sum(L_[k] * sum(o["dk"] * o["mac"] for tk in sk for o in tk["oyuncular"])
                            for _, sk, _, L_ in kayitlar if L_["or"] > 1e-6) / dk_or
        motor_lig[lig] = {"sira": MOTOR_SIRA, "L": {k: round(v, 5) for k, v in La.items()}, "diklik": MOTOR_GERCEK[lig], "oyunDiklik": MOTOR_OYUN[lig],
                          "oyunDakika": MOTOR_OYUN_DAKIKA, "oyunSinerji": MOTOR_OYUN_SINERJI}
        esik[lig] = esikler([tk for _, sk, _, _ in kayitlar for tk in sk])
        print(lig, "denge eşikleri", esik[lig], flush=True)
        takimlar_hepsi = []
        for s, sezon_kayit, ort, Ls in kayitlar:
            olcek = genel / ort
            for tk in sezon_kayit:
                for o in tk["oyuncular"]:
                    guven = o["mac"] / (o["mac"] + GUVEN_MAC)
                    o["m"] = motor_vektor(o, Ls, La)
                    o["nt"] = round(max(-8.0, tk["net"]) * o["dk"] / 40 * guven, 2)  # takım averajından dakika payı (sayı/maç)
                    o["g"] = round(o.pop("_ham") * olcek + (BETA * averaj_sayilan(lig, tk["net"]) * o["dk"] / 40 + GAMMA * o["verim"]) * guven, 2)
                bes = tk["oyuncular"][:5]
                R = sum(o["g"] for o in bes) + denge(bes, esik[lig])
                if tk["gercek"]:
                    g, m = map(int, tk["gercek"].split("-"))
                    if g + m >= 10:
                        kalibrasyon.append((lig, R, g / (g + m)))
                takimlar_hepsi.append(tk)
        motor_lig[lig]["roller"] = ROLLER
        motor_lig[lig]["rolOrt"] = rol_hesapla(takimlar_hepsi, La)
        cikti[lig] = takimlar_hepsi

    mevki_tutarla(cikti)
    vatandaslik_uygula(cikti)
    for takimlar_ in cikti.values():  # uzun (mevki 4-5): "Boyalı alan kalabalık" kuralı için, kesinleşen mevkiden
        for t in takimlar_:
            for o in t["oyuncular"]:
                o["uz"] = 1 if max(o["p"]) >= 4 else 0
    logo_duzelt(cikti)
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
        veri = {"lig": lig, "mac": mac_sayisi[lig], "egri": dict(parametreler[lig], olcekGercek=parametreler[lig]["olcek"], diklik=OYUN_DIKLIK,
                                                                   olcek=round(parametreler[lig]["olcek"] / OYUN_DIKLIK, 2),
                                                                   ortaGercek=parametreler[lig]["orta"], kolay=KLASIK_KOLAY[lig], ligEk=KLASIK_LIG_EK[lig],
                                                                   orta=round(parametreler[lig]["orta"] - KLASIK_KOLAY[lig], 2)), "esik": esik[lig], "denge": DENGE,
                "eksenler": EKSENLER, "eksenKatsayi": EKSEN_KATSAYI, "eksenSinir": EKSEN_SINIR,
                "uyum": UYUM, "uyumSinir": UYUM_SINIR, "kullanimKatsayi": KULLANIM_KATSAYI, "kullanimSinir": KULLANIM_SINIR, "kullanimAlt": round(esik[lig]["kullanim"] * KULLANIM_ALT_ORAN, 1), "kullanimUst": round(esik[lig]["kullanim"] * KULLANIM_UST_ORAN, 1),
                "motor": motor_lig[lig], "takimlar": takimlar}
        (SITE / f"{lig}.js").write_text("window.VERI=window.VERI||{};window.VERI." + lig + "=" + json.dumps(veri, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
        oy = sum(len(t["oyuncular"]) for t in takimlar)
        tr = sum(o["tr"] for t in takimlar for o in t["oyuncular"])
        print(lig, len(takimlar), "takım-sezon,", oy, "oyuncu-sezon,", tr, "Türk;", (SITE / f"{lig}.js").stat().st_size // 1024, "KB", flush=True)


if __name__ == "__main__":
    main()
