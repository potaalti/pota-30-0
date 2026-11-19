/* Pota Altı 30-0 — takım+sezon çevir, beşini kur, sezonu oyna; tek başına, AI'ya karşı ya da aynı cihazda iki kişi. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  // Sürüm: oyun.js'nin ?v= değeri. Çevrim içi odada iki telefon aynı sürümde değilse sonuçlar (seri, sezonlar) farklı
  // hesaplanır: odaya yazılır, farklıysa uyarılır (2026-11-19).
  const SURUM = ((document.currentScript && document.currentScript.src.match(/[?&]v=([^&]+)/)) || [])[1] || "yerel";

  // ---- sabitler ----
  const MEVKI_AD = { 1: "Oyun kurucu", 2: "Şutör", 3: "Kısa forvet", 4: "Uzun forvet", 5: "Pivot" };
  const DIZILISLER = {
    "2-3": { ad: "2 Arka 3 Ön", yerler: [[1], [2], [3], [4], [5]] },
    "3-2": { ad: "3 Arka 2 Ön", yerler: [[1], [2], [1, 2], [4], [5]] },
  };
  // TBL'de mevki verisi zayıf (Wikidata kapsamı %31): orada yalnız Arka (1-2) / Ön (3-5) kullanılır
  const DIZILISLER_AO = {
    "2-3": { ad: "2 Arka 3 Ön", yerler: [["A"], ["A"], ["O"], ["O"], ["O"]] },
    "3-2": { ad: "3 Arka 2 Ön", yerler: [["A"], ["A"], ["A"], ["O"], ["O"]] },
  };
  const AO_DISI = 0.88; // Arka/Ön sisteminde mevki dışı
  const DZ = () => (S && S.sistem === "ao" ? DIZILISLER_AO : DIZILISLER);
  const KONUM = [[50, 80], [83, 58], [17, 58], [68, 33], [32, 33]]; // sahada yerlerin konumu (% x, % y), dizilişteki sırayla
  const UYUM_CARPAN = [1, 0.92, 0.8]; // mevki uzaklığı 0 / 1 / 2+
  const MIN_TR_LIG = { bsl: 1, tbl: 3 };
  const YZ_AD = { kolay: "Kolay", orta: "Orta", zor: "Zor" };
  const AI_GOSTER_MS = 2600; // AI seçince onun beşi sahada bu kadar görünür
  const ALANLAR = ["sy", "rb", "as", "st", "bl", "tk", "kul", "vp"];
  const BASLIK = { sy: "Sayı", rb: "Rib", as: "Ast", st: "TÇ", bl: "Blk", tk: "TK", kul: "Kul", vp: "VP" };
  const BASLIK_UZUN = { sy: "Sayı", rb: "Ribaund", as: "Asist", st: "Top çalma", bl: "Blok", tk: "Top kaybı",
    kul: "Top kullanımı: şut + 0,44×serbest atış + top kaybı (maç başı)", vp: "Verimlilik puanı" };
  const SIRALAR = { vp: "VP", dk: "Süre", sy: "Sayı", rb: "Ribaund", as: "Asist", kul: "Kullanım" }; // ilki varsayılan
  const ILK_GUN = Date.UTC(2026, 10, 17);
  const MK_KAYNAK = { w: "Wikidata", b: "boy ve istatistikten tahmin (bütün sezonlarından)", o: "istatistikten tahmin (bütün sezonlarından)", e: "elle düzeltme" };
  const MODLAR = ["serbest", "yz", "iki"]; // "gunluk" şimdilik kapalı (2026-11-17); kodu duruyor, buraya ve index.html'e eklenince geri gelir
  const dar = () => window.innerWidth < 900;

  // ---- küçük kalıcı tercihler (tarayıcıda) ----
  function oku(k, v) { try { const x = localStorage.getItem("p300:" + k); return x === null ? v : JSON.parse(x); } catch (e) { return v; } }
  function yaz(k, v) { try { localStorage.setItem("p300:" + k, JSON.stringify(v)); } catch (e) { /* yok */ } }
  const ayar = { lig: oku("lig", "bsl"), mod: oku("mod", "serbest"), zor: +oku("zor", 0), sim: oku("sim", "klasik"), yzZorluk: oku("yzZorluk", "orta"), yzKaynak: oku("yzKaynak", "cark") };
  if (!window.VERI || !window.VERI[ayar.lig]) ayar.lig = window.VERI && window.VERI.bsl ? "bsl" : "tbl";
  if (MODLAR.indexOf(ayar.mod) < 0) ayar.mod = "serbest";

  // ---- tohumlu rastgelelik ----
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function bugun() { const d = new Date(Date.now() + 3 * 3600 * 1000); return { y: d.getUTCFullYear(), a: d.getUTCMonth(), g: d.getUTCDate(), str: d.toISOString().slice(0, 10) }; }
  function gunNo() { const b = bugun(); return Math.floor((Date.UTC(b.y, b.a, b.g) - ILK_GUN) / 864e5) + 1; }

  // ---- küçük yardımcılar ----
  function kac(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  // kulüp logosu; TBF'de doğru logosu olmayan takım-sezonlarda (veri/isle.py logo_duzelt) baş harf rozeti
  function basHarf(ad) {
    const k = (ad || "").split(/\s+/).filter((x) => x && !/^(SPOR|SK|BK|BASKETBOL|BASKET|BLD\.?|BŞB\.?)$/.test(x));
    return k.slice(0, 2).map((x) => x[0]).join("") || "?";
  }
  function logo(url, ad) {
    if (!url) return '<span class="bas-harf" title="' + kac(ad || "") + '">' + kac(basHarf(ad)) + "</span>";
    return '<img alt="" referrerpolicy="no-referrer" src="' + kac(url) + '" onerror="this.style.visibility=\'hidden\'">';
  }
  // ad / soyad ayrımı: JR, II gibi ekler soyad sayılmaz ("TARONTATE DE SHAWN CROCKETT JR" → "TARONTATE DE SHAWN" / "CROCKETT")
  const EKLER = /^(JR\.?|SR\.?|II|III|IV)$/;
  function adParca(ad) {
    const p = ad.split(/\s+/).filter(Boolean);
    while (p.length > 1 && EKLER.test(p[p.length - 1])) p.pop();
    return p.length > 1 ? [p.slice(0, -1).join(" "), p[p.length - 1]] : ["", p[0] || ad];
  }
  function soyad(ad) { return adParca(ad)[1]; }
  function adEtiketi(ad) { const a = adParca(ad); return (a[0] ? '<small>' + kac(a[0]) + "</small>" : "") + "<b>" + kac(a[1]) + "</b>"; }
  function kisa(ad) { return ad.split(/\s+/).slice(0, 2).join(" "); }
  function trRozet(o) { return o.tr ? '<span class="rozet-tr">TR</span>' : ""; }
  function sayi1(x) { return x === undefined || x === null ? "–" : (+x).toFixed(1); }

  // ---- mevki ----
  const aoMu = (yer) => typeof yer[0] === "string";
  function kat(o) { const k = []; if (o.p.some((x) => x <= 2)) k.push("A"); if (o.p.some((x) => x >= 3)) k.push("O"); return k; } // Arka / Ön
  function mevkiYaz(o) { return S.sistem === "ao" ? kat(o).map((x) => (x === "A" ? "A" : "Ö")).join("/") : o.p.join("-"); }
  function mevkiUzun(o) { return S.sistem === "ao" ? kat(o).map((x) => (x === "A" ? "Arka" : "Ön")).join(" / ") : o.p.map((x) => MEVKI_AD[x]).join(" / "); }
  function yerKisa(yer) { return aoMu(yer) ? (yer[0] === "A" ? "A" : "Ö") : yer.join("/"); }
  function uyumSoz(c) { return S.sistem === "bes" && c === UYUM_CARPAN[1] ? "komşu mevki" : "mevki dışı"; }
  function yerAdi(yer) {
    if (aoMu(yer)) return yer[0] === "A" ? "Arka" : "Ön";
    if (yer.length === 1) return MEVKI_AD[yer[0]];
    if (yer[yer.length - 1] <= 2) return "Gard";
    return yer.join("-");
  }
  function mesafe(o, yer) { let m = 9; o.p.forEach((a) => yer.forEach((b) => { m = Math.min(m, Math.abs(a - b)); })); return m; }
  function uyumCarpan(o, yer) { return aoMu(yer) ? (kat(o).indexOf(yer[0]) >= 0 ? 1 : AO_DISI) : UYUM_CARPAN[Math.min(mesafe(o, yer), 2)]; }
  function mkRozet(o) {
    return '<span class="mk" title="' + mevkiUzun(o) + " · " + (MK_KAYNAK[o.pk] || "") + '">' + mevkiYaz(o) + "</span>";
  }

  // ---- oyun durumu ----
  // taraflar[0] her zaman ilk oyuncu (tek başına "Sen"); iki taraflı modlarda taraflar[1] AI ya da ikinci oyuncu.
  // gorunen: sahada beşi gösterilen taraf; AI seçince birkaç saniye onunki, iki kişide sırası gelenin.
  let S;
  function yeniTaraf(ad, yz, dizilis) { return { ad: ad, yz: yz, bes: [null, null, null, null, null], dizilis: DIZILISLER[dizilis] ? dizilis : "2-3", atla: { takim: 1, sezon: 1 }, atlaHak: 1 }; }

  function yeniOyun() {
    const veri = window.VERI[ayar.lig];
    const yz = ayar.mod === "yz", iki = ayar.mod === "iki", cift = yz || iki;
    const tohum = ayar.mod === "gunluk" ? "gun:" + bugun().str + ":" + ayar.lig : ayar.mod + ":" + Math.random();
    clearTimeout(S && S.tutZ);
    if (S && S.cevrim && S.cevrim.kapat) S.cevrim.kapat();
    S = {
      veri: veri, tohum: tohum, rng: mulberry(hash(tohum)), cekilen: {}, takim: null, secili: null, bitti: false, cevriliyor: false,
      taraflar: [yeniTaraf(iki ? oku("ad1", "Oyuncu 1") : "Sen", false, oku("dizilis", "2-3"))], cift: cift, yzMod: yz, iki: iki,
      sistem: ayar.lig === "tbl" ? "ao" : "bes", sim: ayar.sim, tur: 0, turdaSecen: [], alinan: {}, son: null, bosCevir: 0, gorunen: 0, tut: false, tutZ: null,
      kaynak: ayar.yzKaynak, zorluk: ayar.yzZorluk, sabit: null, basladi: !cift, minTrOzel: null,
      ara: "", suzgec: 0, sirala: "vp", panelElle: null, cevrim: null, ikiTur: oku("ikiTur", "uzak"),
    };
    if (cift) S.taraflar.push(yz ? yeniTaraf("AI", true, "2-3") : yeniTaraf(oku("ad2", "Oyuncu 2"), false, oku("dizilis2", "2-3")));
    $("baslik").textContent = veri.mac + "-0";
    $("yzBes").classList.toggle("gizli", !cift);
    kuralYaz();
    $("sonuc").classList.add("gizli");
    makaraCiz(null);
    const kayit = ayar.mod === "gunluk" ? oku("gunluk:" + tohum, null) : null;
    if (kayit && kayit.bes && kayit.bes.every((p) => p && p.o && p.o.p)) { // eski sürümün kaydı yok sayılır
      S.taraflar[0].bes = kayit.bes; S.taraflar[0].atla = kayit.atla || S.taraflar[0].atla; S.taraflar[0].dizilis = kayit.dizilis || "2-3";
      S.bitti = true; ciz(); sezonuOyna(true); return;
    }
    ciz();
  }

  function adlar() { return S.taraflar.map((t) => t.ad); }
  function kuralYaz() {
    const sz = Array.from(new Set(S.veri.takimlar.map((t) => t.sezon))).sort();
    const a = adlar();
    $("kural").innerHTML = (S.cift
      ? kac(a[0]) + " ve " + kac(a[1]) + " " + (S.kaynak === "sabit" ? "aynı takım-sezondan" : "her tur çarktan çıkan takım-sezondan") + " <b>sırayla</b> oyuncu seçer (her tur ilk seçen değişir); seçilen oyuncu rakibe kalmaz. " +
        (S.iki ? "Aynı cihazda oynanır: sıra kimdeyse saha onun beşini gösterir, telefon ona geçer. " : "")
      : "Her turda " + S.veri.lig.toUpperCase() + " " + sz[0] + " … " + sz[sz.length - 1] + " arasından rastgele bir kulüp ve sezon çıkar; kadrodan <b>bir</b> oyuncu seç, sahada bir yere koy. ") +
      (S.sistem === "ao" ? "Mevki: Arka (oyun kurucu, şutör) ya da Ön (forvet, pivot); ikisine uyan iki tarafa da konabilir, mevki dışı ×" + AO_DISI + ". "
        : "Beş mevki: 1 oyun kurucu, 2 şutör, 3 kısa forvet, 4 uzun forvet, 5 pivot; komşu mevki ×" + UYUM_CARPAN[1] + ", daha uzağı ×" + UYUM_CARPAN[2] + ". ") +
      "En az <b>" + minTr() + " Türk</b>, aynı oyuncu bir kez" + (S.cift ? (S.kaynak === "sabit" ? "" : ", herkesin oyun başına 1 <b>atlama</b> hakkı (başka takım ya da sezon; yalnız turun ilk seçimini yaparken)") : ", bir <b>başka takım</b> ve bir <b>başka sezon</b> hakkı") + ". Hedef: <b>" + S.veri.mac + "-0</b>.";
  }

  function minTr() { return S.minTrOzel !== null ? S.minTrOzel : (MIN_TR_LIG[S.veri.lig] || 2); }
  function trSayisi(taraf) { return taraf.bes.filter((p) => p && p.o.tr).length; }
  function bosSayisi(taraf) { return taraf.bes.filter((p) => !p).length; }
  function trZorunlu(taraf) { return minTr() - trSayisi(taraf) >= bosSayisi(taraf); }
  function alinanAnahtar(t, o) { return t.id + ":" + o.k; }
  function alanAdi(kim) { return S.taraflar[kim].ad === "Sen" ? "Sen aldın" : S.taraflar[kim].ad + " aldı"; }
  function secilebilir(taraf, o) {
    const kim = S.alinan[alinanAnahtar(S.takim, o)];
    if (kim !== undefined) return alanAdi(kim);
    if (taraf.bes.some((p) => p && p.o.k === o.k)) return "Zaten beşinde";
    if (trZorunlu(taraf) && !o.tr) return "Kalan yerlere Türk oyuncu gerekli";
    return "";
  }
  function siradaki() { // sırası gelen taraf ya da null (tur bitti)
    if (!S.cift) return bosSayisi(S.taraflar[0]) > 0 && S.turdaSecen.length === 0 ? 0 : null;
    const ilk = (S.tur + (S.oyunNo || 0)) % 2 === 0 ? 0 : 1;
    const kalan = [ilk, 1 - ilk].filter((x) => bosSayisi(S.taraflar[x]) > 0 && S.turdaSecen.indexOf(x) < 0);
    return kalan.length ? kalan[0] : null;
  }
  function aktif() { // seçim yapacak insan (çevrim içide yalnız bu telefonun sahibi)
    const s = siradaki();
    if (s === null || S.taraflar[s].yz || !S.takim || S.cevriliyor || S.bitti) return null;
    return S.cevrim && s !== S.cevrim.ben ? null : s;
  }
  function hepsiDolu() { return S.taraflar.every((t) => bosSayisi(t) === 0); }

  // sahada gösterilen beşi değiştir (AI'nın seçimini gösterirken beklemeyi keser)
  function gorunenYap(i) { S.gorunen = i; }
  function tutmayiBitir() { if (S.tut) { S.tut = false; clearTimeout(S.tutZ); } }

  // ---- çark ----
  function cek(filtre) {
    const t = S.veri.takimlar.filter((x) => !S.cekilen[x.id] && (!filtre || filtre(x)));
    if (!t.length) return null;
    const x = t[Math.floor(S.rng() * t.length)];
    S.cekilen[x.id] = 1;
    return x;
  }
  function baskaSezonVar() {
    return !!S.takim && S.veri.takimlar.some((x) => x.kulup === S.takim.kulup && x.id !== S.takim.id && !S.cekilen[x.id]);
  }
  function atlamaSerbest(tur) {
    if (S.bitti || S.cevriliyor || !S.takim) return false;
    if (S.cift) { // iki taraflı: turun ilk seçimini yapacak insan (turda henüz kimse seçmediyse), oyun başına 1 hak
      const a = aktif();
      if (a === null || S.tut || S.kaynak === "sabit" || S.taraflar[a].atlaHak < 1 || S.turdaSecen.length > 0) return false;
    } else if (S.taraflar[0].atla[tur] < 1) return false;
    return tur === "takim" || baskaSezonVar();
  }

  function makaraCiz(t, akiyor) {
    const lg = $("mkLogo");
    if (t) { lg.src = t.logo || ""; lg.classList.toggle("gizli", !t.logo); lg.style.visibility = ""; } else lg.classList.add("gizli");
    $("mkKulup").textContent = t ? t.ad : "?";
    $("mkSezon").textContent = t ? t.sezon : "?";
    $("mkGercek").textContent = t && !akiyor && t.gercek ? "Gerçek: " + t.gercek + (t.sira ? " (" + t.sira + ".)" : "") : "";
    $("mkLig").textContent = t && !akiyor ? t.lig.toUpperCase() : "";
    ["makaraKulup", "makaraSezon"].forEach((id) => { $(id).classList.toggle("akiyor", !!akiyor); $(id).classList.toggle("kilit", !!t && !akiyor); });
  }

  function cevir(atlama) {
    if (S.cevriliyor || S.bitti) return;
    if (S.cevrim) { cevrimCevir(atlama || false); return; }
    if (atlama) { if (!atlamaSerbest(atlama)) return; if (S.cift) S.taraflar[aktif()].atlaHak--; else S.taraflar[0].atla[atlama]--; }
    cevirYap(atlama);
  }
  function cevirYap(atlama) { // izinler denetlendikten sonra çark
    let hedef;
    if (atlama === "sezon") { const k = S.takim.kulup; hedef = cek((x) => x.kulup === k); }
    else hedef = cek();
    if (!hedef) { toast("Çekilecek takım kalmadı"); return; }
    S.secili = null; S.cevriliyor = true; S.takim = null; S.panelElle = null;
    const havuz = atlama === "sezon" ? S.veri.takimlar.filter((x) => x.kulup === hedef.kulup) : S.veri.takimlar;
    let adim = 0;
    ciz();
    const tik = setInterval(() => {
      adim++;
      if (adim < 12) makaraCiz(havuz[Math.floor(Math.random() * havuz.length)], true);
      else { clearInterval(tik); S.cevriliyor = false; makaraCiz(hedef, false); takimGeldi(hedef); }
    }, 75);
  }

  function takimGeldi(t) { S.takim = t; S.ara = ""; S.suzgec = 0; S.panelElle = null; makaraCiz(t, false); turuSurdur(); }

  // sırayı yürüt: AI'ysa onun beşini gösterip seçtir; insansa sahada onun beşini göster
  function turuSurdur() {
    if (S.bitti || !S.takim) { ciz(); return; }
    const sira = siradaki();
    if (sira === null) { ciz(); return; }
    const taraf = S.taraflar[sira];
    if (taraf.yz) { tutmayiBitir(); gorunenYap(sira); ciz(); setTimeout(yzSec, 900); return; }
    if (!S.tut) gorunenYap(sira);
    if (S.iki && S.turdaSecen.length === 0 || S.iki && S.turdaSecen.length === 1) toast("Sıra: " + taraf.ad);
    ciz();
    if (S.takim.oyuncular.some((o) => !secilebilir(taraf, o))) return;
    if (S.cift && S.kaynak === "sabit") { // tek kadroda uygun Türk kalmadıysa Türk kuralı gevşer
      S.minTrOzel = trSayisi(taraf); kuralYaz(); toast("Kadroda uygun Türk kalmadı, Türk kuralı gevşetildi"); ciz(); return;
    }
    if (++S.bosCevir > 25) return;
    toast("Bu kadroda " + (taraf.ad === "Sen" ? "sana" : taraf.ad + " için") + " uygun oyuncu yok, yeniden çevriliyor");
    if (S.cift && S.turdaSecen.length) { // öbür taraf bu kadrodan seçtiyse yalnız bu tarafa yeni kadro çekilir
      setTimeout(() => { const t = cek(); if (t) takimGeldi(t); }, 700); return;
    }
    S.takim = null; setTimeout(() => cevir(false), 700);
  }

  function yerlestir(i) {
    const a = aktif();
    if (a === null || a !== S.gorunen || !S.secili || S.taraflar[a].bes[i]) return;
    if (S.cevrim) { hamleGonder({ tip: "sec", kim: a, k: S.secili.k, id: S.takim.id, i: i }); S.secili = null; bakiyorGonder(null); ciz(); return; }
    secimYap(a, S.secili, i);
  }

  function secimYap(tarafNo, o, i) {
    const taraf = S.taraflar[tarafNo], t = S.takim;
    taraf.bes[i] = { o: o, t: { id: t.id, ad: t.ad, sezon: t.sezon, logo: t.logo } };
    S.alinan[alinanAnahtar(t, o)] = tarafNo;
    S.turdaSecen.push(tarafNo);
    S.son = { taraf: tarafNo, i: i };
    S.secili = null; S.panelElle = null;
    if (taraf.yz) { // AI'nın beşi birkaç saniye sahada kalsın, sonra sıra kimdeyse onunkine dön
      toast("AI: " + o.ad + " → " + yerAdi(DZ()[taraf.dizilis].yerler[i]) + (S.yzNot || ""), S.yzNot ? 3200 : 0); S.yzNot = "";
      S.tut = true; clearTimeout(S.tutZ);
      S.tutZ = setTimeout(() => { S.tut = false; const a = aktif(); gorunenYap(a !== null ? a : 0); ciz(); }, AI_GOSTER_MS);
    }
    turSonu();
  }

  function turSonu() {
    if (hepsiDolu()) { S.takim = null; ciz(); return; }
    if (siradaki() === null) { // tur bitti
      S.tur++; S.turdaSecen = []; S.bosCevir = 0;
      if (S.cift && S.kaynak === "sabit") { turuSurdur(); return; }
      S.takim = null;
      ciz(); return;
    }
    turuSurdur();
  }

  // ---- AI ----
  // Üç seviye (2026-11-19, kullanıcı isteğiyle yeniden):
  //  Kolay: yalnız oyuncuya bakar (güç × mevki uyumu), en iyi 5 aday arasından rastgele; diziliş sabit, atlama yok.
  //  Orta: beşin bütününe bakar (adayı beşe koyunca beşin gücü; boş yerler ortalama ilk beş oyuncusu), en iyi 2 arasından;
  //        iki dizilişi de dener; atlama hakkını yalnız gelen kadro çok kötüyse kullanır.
  //  Zor: Orta gibi ama hep en iyisini alır ve atlama hakkını gelen kadro beklenenden belirgin kötüyse kullanır.
  // Atlama yalnız turun ilk seçimini yaparken (insanla aynı kural), oyun başına bir kez.
  const YZ_SEVIYE = {
    kolay: { havuz: 5, bes: false, diz: false, atla: null },
    orta: { havuz: 2, bes: true, diz: true, atla: { klasik: 7, motor: 5 } },
    zor: { havuz: 1, bes: true, diz: true, atla: { klasik: 2.5, motor: 1.2 } }
  };
  const ortOyuncuOnbellek = {};
  function ortalamaOyuncu() { // gerçek ilk beşlerin ortalama oyuncusu (boş yerleri doldurmak için)
    const lig = S.veri.lig;
    if (!ortOyuncuOnbellek[lig]) {
      const alanlar = ["g", "vp", "sy", "rb", "as", "st", "bl", "tk", "u3", "kul", "dk"], o = { p: [1, 2, 3, 4, 5] };
      let n = 0; alanlar.forEach((k) => { o[k] = 0; });
      S.veri.takimlar.forEach((t) => t.oyuncular.slice().sort((a, b) => b.dk * b.mac - a.dk * a.mac).slice(0, 5).forEach((x) => { n++; alanlar.forEach((k) => { o[k] += x[k] || 0; }); }));
      alanlar.forEach((k) => { o[k] /= n; });
      ortOyuncuOnbellek[lig] = o;
    }
    return ortOyuncuOnbellek[lig];
  }
  function besDegeri(bes, diz) { // boş yerler ortalama oyuncuyla doldurulmuş beşin değeri (Klasik: güç, Motor: sayı farkı)
    const yerler = DZ()[diz].yerler;
    if (klasik()) {
      const ort = ortalamaOyuncu();
      return klasikDeger(bes.map((p) => (p ? p.o : ort)), bes.map((p, i) => (p ? uyumCarpan(p.o, yerler[i]) : 1))).R;
    }
    return motorFark(motorKisiler(bes, yerler));
  }
  function yzAdaylar(yz, takim, seviye, kuralli) {
    const a = [], dizler = seviye.diz ? Object.keys(DIZILISLER) : [yz.dizilis];
    const eskiTakim = S.takim; S.takim = takim; // secilebilir() o anki kadroya bakar
    takim.oyuncular.forEach((o) => {
      if (kuralli ? secilebilir(yz, o) : (S.alinan[alinanAnahtar(takim, o)] !== undefined || yz.bes.some((p) => p && p.o.k === o.k))) return;
      dizler.forEach((diz) => {
        const yerler = DZ()[diz].yerler;
        yz.bes.forEach((p, i) => {
          if (p) return;
          let v;
          if (!seviye.bes) v = o.g * uyumCarpan(o, yerler[i]);
          else { const b = yz.bes.slice(); b[i] = { o: o }; v = besDegeri(b, diz); }
          a.push({ o: o, i: i, diz: diz, v: v });
        });
      });
    });
    S.takim = eskiTakim;
    a.sort((x, y) => y.v - x.v);
    const goruldu = {};
    return a.filter((x) => (goruldu[x.o.k] ? false : (goruldu[x.o.k] = 1))); // oyuncu başına en iyi yer ve diziliş
  }
  // Atlama: gelen kadronun en iyi seçeneği, rastgele başka bir kadronunkinden (örnekle tahmin) belirgin kötüyse
  function yzAtlamaKarari(yz, seviye) {
    if (!seviye.atla || !S.cift || yz.atlaHak < 1 || S.kaynak === "sabit" || S.turdaSecen.length > 0) return null;
    const enIyi = (t) => { const a = yzAdaylar(yz, t, seviye, true); return a.length ? a[0].v : -1e9; };
    const simdi = enIyi(S.takim), esik = seviye.atla[klasik() ? "klasik" : "motor"];
    const ornek = (liste) => { const x = liste.slice(); const n = Math.min(12, x.length); let t = 0;
      for (let k = 0; k < n; k++) { const j = k + Math.floor(Math.random() * (x.length - k)); const g = x[j]; x[j] = x[k]; x[k] = g; t += enIyi(g); }
      return n ? t / n : -1e9; };
    const bos = S.veri.takimlar.filter((x) => !S.cekilen[x.id]);
    const takim = ornek(bos), sezon = ornek(bos.filter((x) => x.kulup === S.takim.kulup));
    const en = sezon > takim ? ["sezon", sezon] : ["takim", takim];
    return en[1] - simdi > esik ? en[0] : null;
  }
  function yzSec() {
    if (S.bitti || !S.takim) return;
    const sira = siradaki();
    if (sira === null || !S.taraflar[sira].yz) return;
    const yz = S.taraflar[sira], seviye = YZ_SEVIYE[S.zorluk] || YZ_SEVIYE.orta;
    const atla = yzAtlamaKarari(yz, seviye);
    if (atla) {
      yz.atlaHak--;
      toast("AI " + (atla === "sezon" ? "başka sezon" : "başka takım") + " hakkını kullandı");
      cevirYap(atla);
      return;
    }
    let aday = yzAdaylar(yz, S.takim, seviye, true);
    if (!aday.length) aday = yzAdaylar(yz, S.takim, seviye, false); // Türk kuralı yüzünden seçemiyorsa kural dışı en iyisini alır
    if (!aday.length) { S.turdaSecen.push(sira); turSonu(); return; }
    const sec = aday[Math.floor(Math.random() * Math.min(seviye.havuz, aday.length))];
    if (sec.diz !== yz.dizilis) { yz.dizilis = sec.diz; S.yzNot = " (" + DZ()[sec.diz].ad + " dizilişine geçti)"; }
    secimYap(sira, sec.o, sec.i);
  }

  // ---- maç motoru (motor.js) ----
  // Beşin değeri: lig ortalaması bir rakibe karşı tarafsız sahada beklenen sayı farkı. Oyuncunun katkısı: yerine aynı
  // dakikada lig ortalaması bir oyuncu konunca bu farkın ne kadar düştüğü. Etkenler: bir istatistiği lig ortalamasına
  // çekince farkın ne kadar değiştiği (sayı / maç).
  function motorKisiler(bes, yerler) { return bes.map((p, i) => (p ? { o: p.o, uyum: uyumCarpan(p.o, yerler[i]), ad: p.o.ad } : { ortalama: true, dk: 28, ad: "" })); }
  function oyunSecenek() { const M = S.veri.motor; return { diklik: M.oyunDiklik, dakika: M.oyunDakika, sinerji: M.oyunSinerji }; }
  // beşteki rol sayıları (yalnız seçilenler): sahanın altındaki rol şeridi ve sonuç ekranı için
  function rolDurumu(taraf) {
    const M = S.veri.motor; if (!M.roller) return null;
    const yerler = DZ()[taraf.dizilis].yerler, kis = [];
    taraf.bes.forEach((p, i) => { if (p) kis.push({ o: p.o, uyum: uyumCarpan(p.o, yerler[i]) }); });
    const n = Motor.sinerji(kis, M).n;
    return M.roller.map((k) => ({ k: k, ad: Motor.ROL_AD[k], n: n[k], hedef: Motor.ROL_HEDEF[k] }));
  }
  function rolCipleri(taraf) {
    const d = rolDurumu(taraf); if (!d || ayar.zor || klasik()) return "";
    return d.map((x) => '<span class="cip ' + (x.n >= x.hedef * 0.75 ? "tamam" : "eksik") + '" title="Beşte ' + kac(x.ad.toLocaleLowerCase("tr")) +
      " rolü: " + x.n.toFixed(1).replace(".", ",") + " (hedef " + x.hedef + "; ilk oyuncu çok, sonrakiler daha az değerli)\">" + kac(x.ad) + " " +
      (x.n >= x.hedef * 0.75 ? "✓" : x.n.toFixed(1).replace(".", ",") + "/" + x.hedef) + "</span>").join("");
  }
  // kurulan beş: top çalması lig ortalamasının altındaysa eksi yok (kirpSt); baremin üstündeyse rakibin top kaybı artar
  function motorCalma(A, kisiler) { // + top kaybı baremi: beşin top kaybı üst çeyrekteyse kendi top kaybı oranı artar
    const L = S.veri.motor.L, top = (k) => kisiler.reduce((x, y) => x + (y.ortalama ? L[k] * y.dk : (y.o[k] || 0)), 0), b = calmaBaremi();
    const st = top("st"), tk = top("tk");
    A.kirpSt = true; A.calmaTov = st >= b.st ? calmaArtisi(st, b.st).tov : 0; A.kayipTov = tk >= b.tk ? calmaArtisi(tk, b.tk).tov : 0;
    return A;
  }
  function motorFark(kisiler) {
    const M = S.veri.motor; Motor.havuz(S.veri); // havuz sinerji tabanını da kurar
    return Motor.beklenenFark(motorCalma(Motor.takimKur(kisiler, M, oyunSecenek()), kisiler), { r: Motor.ligTakimi(M).r }, M, 0);
  }
  function hesapM(taraf) {
    Motor.havuz(S.veri);
    const M = S.veri.motor, yerler = DZ()[taraf.dizilis].yerler, kisiler = motorKisiler(taraf.bes, yerler);
    const A = motorCalma(Motor.takimKur(kisiler, M, oyunSecenek()), kisiler), R = motorFark(kisiler);
    const satirlar = taraf.bes.map((p, i) => {
      const yerine = kisiler.slice(); yerine[i] = { ortalama: true, dk: p.o.m[0], ad: "" };
      let kayip = 0;
      if (kisiler[i].uyum < 1) { const tam = kisiler.slice(); tam[i] = Object.assign({}, kisiler[i], { uyum: 1 }); kayip = motorFark(tam) - R; }
      return { p: p, yer: yerler[i], uyum: kisiler[i].uyum, guc: R - motorFark(yerine), kayip: kayip };
    });
    const etkiler = Motor.katkilar(A, M).map((e) => ({ ad: e.ad, aciklama: e.deger + (e.lig !== "0" ? " (lig " + e.lig + ")" : "") + " · " + e.ipucu, d: e.d }));
    return { A: A, satirlar: satirlar, etkiler: etkiler, R: R, p: Motor.olasilik(R) };
  }

  function tarafTohumu(taraf) { return S.tohum + "|" + taraf.dizilis + "|" + taraf.bes.map((p) => p.o.k + "@" + p.t.id).join(","); }
  function kutuTopla(kutular, n) { // maç maç kutu → sezon ortalaması
    const t = kutular[0].map(() => ({ sy: 0, rb: 0, as: 0, st: 0, bl: 0, tk: 0 }));
    kutular.forEach((k) => k.forEach((x, i) => { Object.keys(x).forEach((a) => { t[i][a] += x[a] / n; }); }));
    return t;
  }
  function simuleM(taraf, h) { // gerçek takımlara karşı sezon: her rakiple bir iç saha bir deplasman
    const V = S.veri, rng = mulberry(hash(tarafTohumu(taraf)));
    return Motor.takvim(V, rng).map((m) => {
      const s = Motor.mac(h.A, m.rakip.A, V.motor, rng, m.ev);
      return { g: s.a > s.b, biz: s.a, onlar: s.b, uz: s.uzatma, ev: m.ev, rakip: m.rakip.t, kutu: s.kA, p: Motor.olasilik(Motor.beklenenFark(h.A, m.rakip.A, V.motor, m.ev)) };
    });
  }
  function seriM(hA, hB) { // 7 maçlık seri, 4 alan kazanır; saha düzeni 2-2-1-1-1
    const M = S.veri.motor, rng = mulberry(hash(tarafTohumu(S.taraflar[0]) + "#" + tarafTohumu(S.taraflar[1])));
    const baski = calmaBaskisi(), A0 = Object.assign({}, hA.A), B0 = Object.assign({}, hB.A); // baskı: kurbanın top kaybı oranı artar
    if (baski[0]) B0.ekTov = baski[0].tov; if (baski[1]) A0.ekTov = baski[1].tov;
    hA = Object.assign({}, hA, { A: A0 }); hB = Object.assign({}, hB, { A: B0 });
    const p = Motor.olasilik(Motor.beklenenFark(hA.A, hB.A, M, 0)), evler = [1, 1, -1, -1, 1, -1, 1];
    let a = 0, b = 0; const maclar = [];
    while (a < 4 && b < 4) {
      const ev = evler[maclar.length], s = Motor.mac(hA.A, hB.A, M, rng, ev), g = s.a > s.b;
      if (g) a++; else b++;
      maclar.push({ g: g, biz: s.a, onlar: s.b, uz: s.uzatma, ev: ev });
    }
    return { a: a, b: b, p: p, maclar: maclar, baski: baski };
  }
  // Top çalma baremi (ikili seri: 1'e 1 ve AI'ya karşı; 2026-11-19, kullanıcı isteği). Bir beşin maç başı toplam top çalması
  // gerçek ilk beşlerin üst çeyreğindeyse ve rakibin toplam top kaybı da üst çeyrekteyse çalıcılar rakibi cezalandırır:
  // baskı = (çalma − barem) + (rakibin kaybı − barem); Klasik'te +1 + 1,5 × baskı güç (en çok 5), Maç motorunda rakibin
  // top kaybı oranı +%1 + %1 × baskı (en çok %4; ~0,8 sayı/maç başına).
  const baremOnbellek = {};
  function calmaBaremi() {
    const lig = S.veri.lig;
    if (!baremOnbellek[lig]) {
      const st = [], tk = [];
      S.veri.takimlar.forEach((t) => { const b = t.oyuncular.slice().sort((a, c) => c.dk * c.mac - a.dk * a.mac).slice(0, 5);
        st.push(b.reduce((x, o) => x + (o.st || 0), 0)); tk.push(b.reduce((x, o) => x + (o.tk || 0), 0)); });
      const ceyrek = (v) => { v.sort((a, c) => a - c); return v[Math.floor(v.length * 0.75)]; };
      baremOnbellek[lig] = { st: ceyrek(st), tk: ceyrek(tk) };
    }
    return baremOnbellek[lig];
  }
  function calmaArtisi(st, barem) { // baremin üstündeki beşe artı (Klasik güç, motor: rakibin top kaybı oranı)
    const f = Math.max(0, st - barem);
    return { guc: Math.min(4, 1 + 1.5 * f), tov: Math.min(0.03, 0.008 + 0.008 * f) };
  }
  function calmaBaskisi() { // [0'ın baskısı, 1'in baskısı] ya da null
    const b = calmaBaremi(), top = (t, k) => t.bes.reduce((x, p) => x + ((p && p.o[k]) || 0), 0);
    return [0, 1].map((kim) => {
      const ben = S.taraflar[kim], rakip = S.taraflar[1 - kim];
      const st = top(ben, "st"), tk = top(rakip, "tk");
      if (st < b.st || tk < b.tk) return null;
      const baski = (st - b.st) + (tk - b.tk);
      return { kim: kim, st: st, tk: tk, barem: b, guc: Math.min(5, 1 + 1.5 * baski), tov: Math.min(0.04, 0.01 + 0.01 * baski) };
    });
  }


  // ---- Klasik simülasyon (2026-11-17 sistemi: güç + galibiyet eğrisi; asist ve ribaund kuralı beşin toplamından) ----
  function hesapK(taraf) {
    const yerler = DZ()[taraf.dizilis].yerler;
    const satirlar = taraf.bes.map((p, i) => {
      const uyum = uyumCarpan(p.o, yerler[i]);
      return { p: p, yer: yerler[i], uyum: uyum, guc: p.o.g * uyum, kayip: p.o.g * (1 - uyum) };
    });
    const k = klasikDeger(taraf.bes.map((p) => p.o), satirlar.map((x) => x.uyum));
    return { satirlar: satirlar, etkiler: k.etkiler, R: k.R, p: 1 / (1 + Math.exp(-(k.R - S.veri.egri.orta) / S.veri.egri.olcek)) };
  }
  // beşin klasik gücü: oyuncu güçleri × mevki uyumu + eksenler + uyum kuralları + rol eksikliği + top kullanımı
  function klasikDeger(os, uyumlar) {
    const V = S.veri;
    const top = (k) => os.reduce((a, o) => a + (o[k] || 0), 0);
    const etkiler = [];
    Object.keys(V.eksenler).forEach((ad) => {
      const f = V.eksenler[ad].formul; let deger = 0;
      Object.keys(f).forEach((k) => { deger += f[k] * top(k); });
      const ek = V.esik.eksen[ad], z = (deger - ek.med) / ek.iqr;
      const d = Math.max(-V.eksenSinir, Math.min(V.eksenSinir, V.eksenKatsayi * z));
      const soz = z >= 1 ? "çok iyi" : z >= 0.3 ? "iyi" : z > -0.3 ? "ortalama" : z > -1 ? "zayıf" : "çok zayıf";
      etkiler.push({ ad: V.eksenler[ad].ad + " " + soz, aciklama: deger.toFixed(1) + " (gerçek ilk beş ortancası " + ek.med.toFixed(1) + ")", d: d });
    });
    let uyumTop = 0;
    (V.uyum || []).forEach((k) => {
      const n = os.filter((o) => k.kosul.every((c) => (c[1] === ">=" ? (o[c[0]] || 0) >= c[2] : (o[c[0]] || 0) < c[2]))).length;
      if ((k.en_az !== undefined && n >= k.en_az) || (k.en_cok !== undefined && n <= k.en_cok)) { etkiler.push({ ad: k.ad, aciklama: k.aciklama, d: k.puan }); uyumTop += k.puan; }
    });
    if (Math.abs(uyumTop) > V.uyumSinir) etkiler.push({ ad: "Uyum sınırı", aciklama: "uyum kurallarının toplamı en çok ±" + V.uyumSinir, d: Math.sign(uyumTop) * V.uyumSinir - uyumTop });
    const ROL_AD = { rb: ["Ribaund alan yok", "beşin ribaundu"], as: ["Top paylaşımı zayıf", "beşin toplam asisti"] };
    Object.keys(V.denge).forEach((k) => {
      const v = top(k);
      if (v < V.esik.rol[k]) etkiler.push({ ad: (ROL_AD[k] || [k])[0], aciklama: (ROL_AD[k] || [k, "beşin " + k])[1] + " " + v.toFixed(1) + " < " + V.esik.rol[k], d: -(V.esik.rol[k] - v) * V.denge[k] });
    });
    // Top çalma baremi (2026-11-19, kullanıcı): beşin toplam top çalması gerçek ilk beşlerin üst çeyreğindeyse artı,
    // altındaysa eksi yok; sezonda (gerçek takımlara karşı) da geçerli.
    const st = top("st"), stB = calmaBaremi().st;
    if (st >= stB) etkiler.push({ ad: "Top çalma baremi", aciklama: "beşin top çalması " + st.toFixed(1) + " ≥ " + stB.toFixed(1) + " (gerçek ilk beşlerin üst çeyreği)", d: calmaArtisi(st, stB).guc });
    // Top kaybı baremi (2026-11-19, kullanıcı): beşin toplam top kaybı gerçek ilk beşlerin üst çeyreğindeyse eksi, altındaysa artı yok
    const tk = top("tk"), tkB = calmaBaremi().tk;
    if (tk >= tkB) etkiler.push({ ad: "Top kaybı baremi", aciklama: "beşin top kaybı " + tk.toFixed(1) + " ≥ " + tkB.toFixed(1) + " (gerçek ilk beşlerin üst çeyreği)", d: -calmaArtisi(tk, tkB).guc });
    const kul = top("kul");
    const bant = V.kullanimBant || 0, ust = V.esik.kullanim * (1 + bant), alt = V.esik.kullanim * (1 - bant);
    if (V.esik.kullanim && kul > ust) {
      etkiler.push({ ad: "Top yetmiyor", aciklama: "beşin top kullanımı " + kul.toFixed(1) + " > " + ust.toFixed(1) + " (gerçek ilk beşlerin üst çeyreği +%" + Math.round(bant * 100) + ")", d: -(kul - ust) * V.kullanimKatsayi });
    } else if (V.esik.kullanim && bant && kul < alt) {
      etkiler.push({ ad: "Şut yaratan yok", aciklama: "beşin top kullanımı " + kul.toFixed(1) + " < " + alt.toFixed(1) + " (gerçek ilk beşlerin üst çeyreği −%" + Math.round(bant * 100) + ")", d: -(alt - kul) * V.kullanimKatsayi });
    }
    const R = os.reduce((a, o, i) => a + o.g * uyumlar[i], 0) + etkiler.reduce((a, e) => a + e.d, 0);
    return { etkiler: etkiler, R: R };
  }

  function macUret(rng, logit, g) {
    const fark = Math.max(1, Math.round(Math.abs(logit) * 4 + rng() * 9)), biz = Math.round(74 + rng() * 18 + (g ? fark / 2 : -fark / 2));
    return { g: g, biz: biz, onlar: g ? biz - fark : biz + fark };
  }
  function simuleK(taraf, h) {
    const rng = mulberry(hash(tarafTohumu(taraf))), sonuc = [];
    for (let i = 0; i < S.veri.mac; i++) {
      const logit = Math.log(h.p / (1 - h.p)) + (rng() + rng() + rng() - 1.5) * 1.2; // rakip gücü maçtan maça değişir
      sonuc.push(macUret(rng, logit, rng() < 1 / (1 + Math.exp(-logit))));
    }
    return sonuc;
  }
  function seriK(hA, hB) { // 7 maçlık seri, 4 alan kazanır
    const rng = mulberry(hash(tarafTohumu(S.taraflar[0]) + "#" + tarafTohumu(S.taraflar[1])));
    const baski = calmaBaskisi(), ek = baski.reduce((x, b) => x + (b ? (b.kim === 0 ? 1 : -1) * b.guc : 0), 0);
    const p = 1 / (1 + Math.exp(-(hA.R - hB.R + ek) / S.veri.egri.olcek)), taban = Math.log(p / (1 - p));
    let a = 0, b = 0; const maclar = [];
    while (a < 4 && b < 4) {
      const logit = taban + (rng() + rng() + rng() - 1.5) * 1.2, g = rng() < 1 / (1 + Math.exp(-logit));
      if (g) a++; else b++;
      maclar.push(macUret(rng, logit, g));
    }
    return { a: a, b: b, p: p, maclar: maclar, baski: baski };
  }
  function enIyiSecimK(h) { const e = h.satirlar.slice().sort((a, b) => b.guc - a.guc)[0]; return e.p.o.ad + " · " + e.p.t.ad + " " + e.p.t.sezon + " (güç " + e.guc.toFixed(1) + ")"; }
  function enZayifK(h) {
    const adaylar = h.etkiler.filter((e) => e.d < 0).map((e) => ({ metin: e.ad + " (" + e.aciklama + ")", d: e.d }));
    h.satirlar.forEach((s) => { if (s.uyum < 1) adaylar.push({ metin: s.p.o.ad + " mevkisi dışında (" + mevkiYaz(s.p.o) + " → " + yerAdi(s.yer) + ")", d: -s.kayip }); });
    if (adaylar.length) { adaylar.sort((a, b) => a.d - b.d); return adaylar[0].metin + " · " + adaylar[0].d.toFixed(1); }
    const z = h.satirlar.slice().sort((a, b) => a.guc - b.guc)[0];
    return "Belirgin bir eksik yok; en zayıf halka " + z.p.o.ad + " (güç " + z.guc.toFixed(1) + ")";
  }

  function klasik() { return S.sim !== "motor"; }
  function hesap(t) { return klasik() ? hesapK(t) : hesapM(t); }
  // ---- tek lig (2026-11-19, kullanıcı): kurulan beş(ler) + gerçek takımlar aynı ligde, çift devreli; BSL 16, TBL 17 takım ----
  function ligSezonu(hesaplar) {
    const V = S.veri, T = V.mac / 2 + 1, rng = mulberry(hash(S.tohum + "|lig|" + S.taraflar.map(tarafTohumu).join("#")));
    const gercek = V.takimlar.map((t, i) => i);
    for (let i = gercek.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = gercek[i]; gercek[i] = gercek[j]; gercek[j] = x; }
    const havuz = klasik() ? null : Motor.havuz(V);
    const takimlar = S.taraflar.map((t, j) => ({ ad: t.ad, sezon: "", logo: "", biz: true, j: j, R: hesaplar[j].R + (klasik() ? (V.egri.kolay || 0) + (V.egri.ligEk || 0) : 0), A: hesaplar[j].A }))
      .concat(gercek.slice(0, T - S.taraflar.length).map((i) => {
        const t = V.takimlar[i], bes = t.oyuncular.slice().sort((a, b) => b.dk * b.mac - a.dk * a.mac || a.k - b.k).slice(0, 5);
        return { ad: t.ad, sezon: t.sezon, logo: t.logo, t: t, R: klasik() ? klasikDeger(bes, [1, 1, 1, 1, 1]).R : 0, A: havuz ? havuz[i].A : null };
      }));
    takimlar.forEach((x) => { x.g = 0; x.m = 0; x.at = 0; x.ye = 0; });
    const maclar = S.taraflar.map(() => []);
    // çember yöntemiyle devreler (tek sayıda takımda her devre biri dinlenir)
    const sira = takimlar.map((x, i) => i); if (sira.length % 2) sira.push(-1);
    const n = sira.length, devreler = [];
    for (let d = 0; d < n - 1; d++) {
      const dv = []; for (let k = 0; k < n / 2; k++) { const a = sira[k], b = sira[n - 1 - k]; if (a >= 0 && b >= 0) dv.push(d % 2 ? [b, a] : [a, b]); }
      devreler.push(dv); sira.splice(1, 0, sira.pop());
    }
    const hepsi = devreler.concat(devreler.map((dv) => dv.map(([a, b]) => [b, a]))); // ikinci devre: saha değişir
    hepsi.forEach((dv) => dv.forEach(([ev, dep]) => {
      const A = takimlar[ev], B = takimlar[dep];
      let as, bs, p, kutuA, kutuB, uz = 0;
      if (klasik()) {
        p = 1 / (1 + Math.exp(-(A.R - B.R) / V.egri.olcek));
        const logit = Math.log(p / (1 - p)) + (rng() + rng() + rng() - 1.5) * 1.2, g = rng() < 1 / (1 + Math.exp(-logit)), m = macUret(rng, logit, g);
        as = m.biz; bs = m.onlar;
      } else {
        p = Motor.olasilik(Motor.beklenenFark(A.A, B.A, V.motor, 1));
        const m = Motor.mac(A.A, B.A, V.motor, rng, 1); as = m.a; bs = m.b; kutuA = m.kA; kutuB = m.kB; uz = m.uzatma;
      }
      A.at += as; A.ye += bs; B.at += bs; B.ye += as;
      if (as > bs) { A.g++; B.m++; } else { B.g++; A.m++; }
      const rakipBilgi = (x) => ({ ad: x.ad, sezon: x.sezon || (x.biz ? "kurulan beş" : ""), logo: x.logo || "" });
      if (A.biz) maclar[A.j].push({ g: as > bs, biz: as, onlar: bs, uz: uz, ev: 1, rakip: rakipBilgi(B), kutu: kutuA, p: p });
      if (B.biz) maclar[B.j].push({ g: bs > as, biz: bs, onlar: as, uz: uz, ev: -1, rakip: rakipBilgi(A), kutu: kutuB, p: 1 - p });
    }));
    const tablo = takimlar.slice().sort((a, b) => b.g - a.g || (b.at - b.ye) - (a.at - a.ye));
    return { tablo: tablo, maclar: maclar };
  }
  function seri(a, b) { return klasik() ? seriK(a, b) : seriM(a, b); }
  function enIyiSecim(h) { return klasik() ? enIyiSecimK(h) : enIyiSecimM(h); }
  function enZayif(h) { return klasik() ? enZayifK(h) : enZayifM(h); }

  function harfNotu(g, n) {
    if (g === n) return "A+";
    const w = g / n;
    for (const [s, h] of [[0.93, "A"], [0.87, "A-"], [0.8, "B+"], [0.72, "B"], [0.65, "B-"], [0.58, "C+"], [0.5, "C"], [0.43, "C-"], [0.33, "D"]]) if (w >= s) return h;
    return "F";
  }
  function unvan(g, n) {
    if (g === n) return "Kusursuz sezon!";
    const w = g / n;
    if (n - g <= 2) return "Efsane sezon";
    if (w >= 0.8) return "Şampiyonluk adayı";
    if (w >= 0.6) return "Play-off takımı";
    if (w >= 0.45) return "Orta sıra";
    if (w >= 0.3) return "Zor bir sezon";
    return "Küme hattı";
  }
  function isaretli(x) { return (x > 0.05 ? "+" : x < -0.05 ? "−" : "") + Math.abs(x).toFixed(1).replace(".", ","); }
  function enIyiSecimM(h) { const e = h.satirlar.slice().sort((a, b) => b.guc - a.guc)[0]; return e.p.o.ad + " · " + e.p.t.ad + " " + e.p.t.sezon + " (katkı " + isaretli(e.guc) + " sayı/maç)"; }
  function enZayifM(h) {
    const adaylar = h.etkiler.filter((e) => e.d < -0.3).map((e) => ({ metin: e.ad + " (" + e.aciklama.split(" · ")[0].split(" (lig")[0] + ")", d: e.d }));
    h.satirlar.forEach((s) => { if (s.uyum < 1) adaylar.push({ metin: s.p.o.ad + " mevkisi dışında (" + mevkiYaz(s.p.o) + " → " + yerAdi(s.yer) + ")", d: -s.kayip }); });
    h.satirlar.forEach((s) => { if (s.guc < -0.3) adaylar.push({ metin: s.p.o.ad + " lig ortalamasının altında", d: s.guc }); });
    if (adaylar.length) { adaylar.sort((a, b) => a.d - b.d); return adaylar[0].metin + " · " + isaretli(adaylar[0].d) + " sayı/maç"; }
    const z = h.satirlar.slice().sort((a, b) => a.guc - b.guc)[0];
    return "Belirgin bir eksik yok; en az katkı " + z.p.o.ad + " (" + isaretli(z.guc) + ")";
  }
  function hucreler(o, alanlar) { return alanlar.map((k) => "<td>" + sayi1(o[k]) + "</td>").join(""); }
  function basliklar(alanlar) { return alanlar.map((k) => '<th title="' + BASLIK_UZUN[k] + '">' + BASLIK[k] + "</th>").join(""); }
  function modAdi() { return ayar.mod === "gunluk" ? "Günlük #" + gunNo() : S.yzMod ? "vs AI (" + YZ_AD[S.zorluk] + ")" : S.iki ? "2 kişi" : "Serbest"; }
  function macYazi(m, i) {
    return (i + 1) + ". maç · " + (m.rakip ? m.rakip.ad + " " + m.rakip.sezon + " · " : "") + (m.ev > 0 ? "iç saha · " : m.ev < 0 ? "deplasman · " : "") +
      m.biz + "-" + m.onlar + (m.uz ? " (" + (m.uz > 1 ? m.uz + " " : "") + "uzatma)" : "");
  }

  // ---- sonuç ----
  function sezonuOyna(hemen) {
    if (!S.taraflar.every((t) => t.bes.every((p) => p && p.o))) return; // beşler dolmadan oynanmaz
    tutmayiBitir();
    S.bitti = true; S.takim = null; S.gorunen = S.cevrim ? S.cevrim.ben : 0; ciz();
    const hesaplar = S.taraflar.map((t) => hesap(t)), lig = ligSezonu(hesaplar);
    const sonuclar = S.taraflar.map((t, j) => { const m = lig.maclar[j]; return { taraf: t, h: hesaplar[j], maclar: m, g: m.filter((x) => x.g).length }; });
    if (ayar.mod === "gunluk") { const b = S.taraflar[0]; yaz("gunluk:" + S.tohum, { bes: b.bes, atla: b.atla, dizilis: b.dizilis }); }
    const sr = S.cift ? seri(sonuclar[0].h, sonuclar[1].h) : null;
    const ligTablo = '<details class="dokum-kap" open><summary>lig tablosu (' + lig.tablo.length + " takım, çift devre)</summary><div class=\"yatay\"><table class=\"lig-tablo\"><thead><tr><th>#</th><th>Takım</th><th>G</th><th>M</th><th>Av.</th></tr></thead><tbody>" +
      lig.tablo.map((x, i) => '<tr class="' + (x.biz ? "biz" : "") + '"><td>' + (i + 1) + "</td><td>" + kac(x.ad) + (x.sezon ? ' <span class="ipucu">' + kac(x.sezon) + "</span>" : "") + "</td><td>" + x.g + "</td><td>" + x.m +
        "</td><td>" + isaretli((x.at - x.ye) / (x.g + x.m)) + "</td></tr>").join("") + "</tbody></table></div></details>";
    const el = $("sonuc"), n = S.veri.mac, a = adlar();
    el.classList.remove("gizli");
    const skorbord = (r, j) =>
      '<div class="skorbord">' + (S.cift ? "<h2>" + kac(r.taraf.ad) + "</h2>" : "") +
      '<div class="skor"><span id="sg' + j + '">0</span><span class="tire">-</span><span id="sm' + j + '">0</span></div>' +
      '<div class="not-sat"><span class="harf">' + harfNotu(r.g, n) + '</span><span class="unvan" id="unvan' + j + '">&nbsp;</span></div>' +
      '<div class="skor-alt">' + S.veri.lig.toUpperCase() + " · " + modAdi() + " · " + DZ()[r.taraf.dizilis].ad + (klasik() ? " · maç başı ~%" + Math.round(r.h.p * 100) : " · ortalama rakibe " + isaretli(r.h.R) + " sayı") + " · bu fikstürde beklenen " + r.maclar.reduce((x, m) => x + m.p, 0).toFixed(1).replace(".", ",") + " galibiyet</div>" +
      '<div class="isiklar">' + r.maclar.map((m, i) => '<i class="isik" id="m' + j + "_" + i + '" title="' + kac(macYazi(m, i)) + '"></i>').join("") + "</div></div>";
    const satirlar = (r) => '<div class="satirlar">' + r.h.satirlar.map((s) =>
      '<div class="sat' + (s.uyum < 1 ? " disi" : "") + '"><div class="no">' + yerKisa(s.yer) + "</div>" + logo(s.p.t.logo, s.p.t.ad) +
      '<div><div class="isim">' + kac(s.p.o.ad) + trRozet(s.p.o) + '</div><div class="ust">' + kac(s.p.t.ad) + " " + s.p.t.sezon + " · " + mevkiYaz(s.p.o) +
      (s.uyum < 1 ? " → " + yerAdi(s.yer) + " ×" + s.uyum : "") + " · " + sayi1(s.p.o.sy) + " sy · " + sayi1(s.p.o.rb) + " rb · " + sayi1(s.p.o.as) + " as</div></div>" +
      (klasik() ? '<div class="guc" title="Güç">' + s.guc.toFixed(1) : '<div class="guc" title="Katkı: yerine aynı dakikada lig ortalaması bir oyuncu konsa beşin beklenen farkı bu kadar değişirdi (sayı/maç)">' + isaretli(s.guc)) + "</div></div>").join("") + "</div>";
    const ozet = (r) => '<div class="ozet"><div><b>En iyi seçim</b>' + kac(enIyiSecim(r.h)) + "</div><div><b>En büyük zayıflık</b>" + kac(enZayif(r.h)) + "</div></div>" + (klasik()
      ? '<div class="etkiler">' + r.h.etkiler.map((e) => '<span class="' + (e.d >= 0 ? "arti" : "eksi") + '" title="' + kac(e.aciklama) + '">' + kac(e.ad) + " " + (e.d > 0 ? "+" : "") + e.d.toFixed(1) + "</span>").join("") + "</div>"
      : rolSatir(r));
    const rolSatir = (r) => { // beşin rolleri ve sinerjinin sayı katkısı
      const sin = r.h.etkiler.filter((e) => /sinerjisi$/.test(e.ad)), top = sin.reduce((x, e) => x + e.d, 0);
      return '<div class="etkiler rol-satir"><b>Roller</b>' + rolCipleri(r.taraf) + "</div>" +
        '<div class="etkiler rol-satir"><b>Sinerji ' + isaretli(top) + " sayı/maç</b>" + sin.map((e) => '<span class="' + (e.d >= 0 ? "arti" : "eksi") + '" title="' + kac(e.aciklama) + '">' +
        kac(e.ad.replace(" sinerjisi", "")) + " " + isaretli(e.d) + "</span>").join("") + "</div>";
    };
    const sezonKutu = (r) => {
      const k = kutuTopla(r.maclar.map((m) => m.kutu), r.maclar.length), kis = r.h.A.kisiler;
      const atilan = r.maclar.reduce((x, m) => x + m.biz, 0) / r.maclar.length, yenen = r.maclar.reduce((x, m) => x + m.onlar, 0) / r.maclar.length;
      const gercek = (i) => { const o = r.taraf.bes[i] && r.taraf.bes[i].o; return o ? '<div class="ipucu" style="margin:0">gerçekte ' + sayi1(o.sy) + " sy · " + sayi1(o.rb) + " rb · " + sayi1(o.as) + " as · " + sayi1(o.dk) + " dk</div>" : ""; };
      const satir = kis.map((p, i) => "<tr><td>" + kac(p.ad) + (p.yedek ? '<div class="ipucu" style="margin:0">lig ortalaması, ' + Math.round(p.v.dk) + " dk</div>" : gercek(i)) + "</td>" +
        ["sy", "rb", "as", "st", "bl", "tk"].map((a2) => "<td>" + k[i][a2].toFixed(1) + "</td>").join("") + "</tr>").join("");
      const top = {}; ["sy", "rb", "as", "st", "bl", "tk"].forEach((a2) => { top[a2] = k.reduce((x, y) => x + y[a2], 0); });
      return '<details class="dokum-kap"><summary>' + (S.cift ? kac(r.taraf.ad) + ": " : "") + "sezon istatistikleri (maç başı " + atilan.toFixed(1) + " – " + yenen.toFixed(1) + ")</summary>" +
        '<div class="yatay"><table><thead><tr><th>Oyuncu</th><th>Sayı</th><th>Rib</th><th>Ast</th><th>TÇ</th><th>Blk</th><th>TK</th></tr></thead><tbody>' + satir +
        '<tr class="toplam"><td>Takım</td>' + ["sy", "rb", "as", "st", "bl", "tk"].map((a2) => "<td>" + top[a2].toFixed(1) + "</td>").join("") + "</tr></tbody></table></div>" +
        '<p class="ipucu">Simüle edilen ' + r.maclar.length + " maçın ortalaması. Takım ribaundu yalnız oyunculara yazılanlar.</p></details>";
    };
    const macListesi = (r) => '<details class="dokum-kap"><summary>' + (S.cift ? kac(r.taraf.ad) + ": " : "") + "maç maç</summary><ol class=\"mac-liste\">" +
      r.maclar.map((m, i) => '<li class="' + (m.g ? "G" : "M") + '"><b>' + (m.g ? "G" : "M") + "</b> " + kac(m.rakip.ad) + " <span class=\"ipucu\">" + m.rakip.sezon + " · " + (m.ev > 0 ? "iç saha" : "deplasman") +
        "</span><span class=\"skr\">" + m.biz + "-" + m.onlar + (m.uz ? " (U)" : "") + "</span></li>").join("") + "</ol></details>";
    const dokum = (r) => {
      const satir = r.h.satirlar.map((s) =>
        "<tr><td>" + mkRozet(s.p.o) + " " + kac(s.p.o.ad) + '<div class="ipucu" style="margin:0">' + yerAdi(s.yer) + " · " + kac(s.p.t.ad) + " " + s.p.t.sezon +
        (s.uyum < 1 ? ' · <span class="eksi">' + uyumSoz(s.uyum) + " ×" + s.uyum + " (" + isaretli(-s.kayip) + ")</span>" : "") + "</div></td>" +
        hucreler(s.p.o, ALANLAR) + "<td><b>" + (klasik() ? s.guc.toFixed(1) : isaretli(s.guc)) + "</b></td></tr>").join("");
      const top = {}; ALANLAR.forEach((k) => { top[k] = r.taraf.bes.reduce((x, p) => x + (p.o[k] || 0), 0); });
      const etk = r.h.etkiler.map((e) => "<tr><td colspan=" + ALANLAR.length + ">" + kac(e.ad) + ' <span class="ipucu">' + kac(e.aciklama) + '</span></td><td class="' + (e.d >= 0 ? "arti" : "eksi") + '">' + isaretli(e.d) + "</td></tr>").join("");
      return '<details class="dokum-kap"><summary>' + (S.cift ? kac(r.taraf.ad) + ": " : "") + 'ayrıntılı döküm</summary><div class="yatay"><table><thead><tr><th>Oyuncu</th>' + basliklar(ALANLAR) + (klasik() ? "<th>Güç</th>" : '<th title="Katkı (sayı/maç)">Katkı</th>') + "</tr></thead><tbody>" + satir +
        '<tr class="toplam"><td>Beşin toplamı</td>' + hucreler(top, ALANLAR) + "<td></td></tr>" +
        (klasik() ? "" : '<tr class="toplam"><td colspan=' + (ALANLAR.length + 1) + ">Etkenler: istatistik lig ortalamasına çekilse fark ne kadar değişir (sayı/maç)</td></tr>") + etk +
        (klasik() ? "<tr><td colspan=" + ALANLAR.length + "><b>Takım gücü</b> (maç başı galibiyet olasılığı ~%" + Math.round(r.h.p * 100) + ")</td><td><b>" + r.h.R.toFixed(1) + "</b></td></tr>"
          : "<tr><td colspan=" + ALANLAR.length + "><b>Beklenen fark</b> (lig ortalaması rakibe, tarafsız saha; maç başı galibiyet olasılığı ~%" + Math.round(r.h.p * 100) + ")</td><td><b>" + isaretli(r.h.R) + "</b></td></tr>") + "</tbody></table></div></details>";
    };
    let html;
    if (S.cift) {
      html = '<div class="iki">' + sonuclar.map((r, j) => "<div>" + skorbord(r, j) + ozet(r) + "</div>").join("") + "</div>";
      const baskiYazi = (sr.baski || []).filter((x) => x).map((x) => "<br>Top çalma baskısı: " + kac(a[x.kim]) + " beşi maç başı " + x.st.toFixed(1).replace(".", ",") +
        " top çalıyor (barem " + x.barem.st.toFixed(1).replace(".", ",") + "), " + kac(a[1 - x.kim]) + " beşi " + x.tk.toFixed(1).replace(".", ",") + " top kaybediyor (barem " +
        x.barem.tk.toFixed(1).replace(".", ",") + "): " + (klasik() ? "+" + x.guc.toFixed(1).replace(".", ",") + " güç" : "rakibin top kaybı +%" + (x.tov * 100).toFixed(1).replace(".", ","))).join("");
      html += '<div class="seri">Seri: ' + kac(a[0]) + " " + sr.a + " – " + sr.b + " " + kac(a[1]) + " · " + kac(sr.a > sr.b ? a[0] : a[1]) + (sr.a > sr.b && a[0] === "Sen" ? " kazandın" : " kazandı") +
        "<small>Maç başı " + kac(a[0]) + " kazanma olasılığı ~%" + Math.round(sr.p * 100) + " · " + sr.maclar.map((m) => m.biz + "-" + m.onlar + (m.uz ? " (U)" : "")).join(", ") + baskiYazi +
        (S.cevrim ? "<br>Oda skoru: " + kac(a[0]) + " " + S.odaSkor[0] + " – " + S.odaSkor[1] + " " + kac(a[1]) + " · " + (S.oyunNo + 1) + ". oyun" : "") + "</small></div>";
      html += ligTablo + '<div class="iki">' + sonuclar.map((r) => "<div>" + satirlar(r) + (klasik() ? "" : sezonKutu(r)) + macListesi(r) + dokum(r) + "</div>").join("") + "</div>";
    } else html = skorbord(sonuclar[0], 0) + satirlar(sonuclar[0]) + ozet(sonuclar[0]) + ligTablo + (klasik() ? "" : sezonKutu(sonuclar[0])) + macListesi(sonuclar[0]) + dokum(sonuclar[0]);
    html += '<div class="dugmeler"><button class="ana-btn ikincil" id="paylas">Sonucu kopyala</button>' +
      (ayar.mod === "gunluk" ? '<button class="ana-btn" id="serbeste">Serbest oyna</button>'
        : S.cevrim ? '<button class="ana-btn" id="rovans">Rövanş (aynı oda)</button><button class="ana-btn ikincil" id="tekrar">Odadan çık</button>'
        : '<button class="ana-btn" id="tekrar">Yeni oyun</button>') + "</div>" +
      (klasik() ?
      '<p class="not">Güç: o sezonki VP ortalaması (az maç oynayanlarda kısılır, sezon ölçeğine göre ayarlanır) + takımının sayı averajından dakika payı; mevki uyumu ×' + (S.sistem === "ao" ? "1 / ×" + AO_DISI + " (TBL'de Arka/Ön)" : UYUM_CARPAN.join(" / ×")) +
      ". Hücum ve savunma eksenleri gerçek ilk beşlerin ortancasına göre (en çok ±" + S.veri.eksenSinir + "); top kullanımı gerçek ilk beşlerin üst çeyreğinin ±%" + Math.round((S.veri.kullanimBant || 0) * 100) + " bandı dışında kalan her birim −" + S.veri.kullanimKatsayi +
      "; uyum kuralları oyun hissi için (toplam en çok ±" + S.veri.uyumSinir + "). Galibiyet eğrisi " + S.veri.egri.n + " gerçek takımın ilk beşinden uyduruldu, oyun için ~%6-7 kolaylaştırıldı. Maç maç motor için üstten Maç motoru seçilebilir.</p>"
      :
      '<p class="not">Maçlar sahiplik sahiplik oynanır: top kaybı (rakibin top çalması artırır), serbest atış (rakibin faulü artırır), ' +
      "iki ya da üç sayılık şut (isabeti rakibin bloğu düşürür, asistli oyun artırır), kaçan şutta hücum ribaundu ile savunma ribaundunun çekişmesi. " +
      "Her oyuncu o sezonki kutu istatistikleri ve dakikasıyla oynar (dönem farkı giderilir, az maç oynayanlar lig ortalamasına çekilir); kalan dakikayı lig ortalaması yedekler oynar. " +
      "Takımının sayı averajından dakika payı kutuya yansımayan katkıyı taşır. Mevki dışı ×" + (S.sistem === "ao" ? AO_DISI : UYUM_CARPAN.slice(1).join(" / ×")) +
      ": ribaund, asist, savunma azalır, top kaybı artar. Rakipler ligin gerçek takımları (en çok süre alan beşleri); iç sahada +" + Motor.AYAR.ev + " sayı. " +
      "Roller (şutör, oyun kurucu, içeri skorer, pota koruyucu, top çalan, ribaundçu) sinerji verir: her rolün ilk oyuncusu çok, sonrakiler daha az değerli; eksik rol isabeti ve ribaundu düşürür. " +
      "Motor gerçek takımlarla sınandı. Oyun ayarı: kurduğun beşin oyuncuları en az " + S.veri.motor.oyunDakika + " dakika oynar, rol sinerjisi ×" + S.veri.motor.oyunSinerji + ", fark ×" + String(S.veri.motor.oyunDiklik).replace(".", ",") + ".</p>");
    el.innerHTML = html;
    const cizim = (S.sonucCizim = (S.sonucCizim || 0) + 1); // yeniden çizilince (ör. simülasyon değişti) eski canlandırma durur
    sonuclar.forEach((r, j) => {
      let i = 0, gs = 0;
      const goster = () => {
        if (cizim !== S.sonucCizim || i >= n) return;
        const m = r.maclar[i]; if (m.g) gs++;
        $("m" + j + "_" + i).className = "isik " + (m.g ? "G" : "M");
        $("sg" + j).textContent = gs; $("sm" + j).textContent = i + 1 - gs;
        i++;
        if (i < n) { if (!hemen) setTimeout(goster, 60); } else $("unvan" + j).textContent = unvan(r.g, n);
      };
      if (hemen) { while (i < n) goster(); } else goster();
    });
    $("paylas").onclick = () => paylas(sonuclar, sr);
    if ($("tekrar")) $("tekrar").onclick = () => { if (S.cevrim) odadanCik(); yeniOyun(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    if ($("serbeste")) $("serbeste").onclick = () => ayarla("mod", "serbest");
    if ($("rovans")) $("rovans").onclick = () => { $("rovans").disabled = true; hamleGonder({ tip: "yeni", kim: S.cevrim.ben }); window.scrollTo({ top: 0, behavior: "smooth" }); };
    if (!hemen) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }

  function paylas(sonuclar, sr) {
    const n = S.veri.mac, r = sonuclar[0];
    const kare = r.maclar.map((m) => (m.g ? "🟩" : "🟥")), satir = [];
    for (let i = 0; i < kare.length; i += 10) satir.push(kare.slice(i, i + 10).join(""));
    let metin = "Pota Altı " + n + "-0 · " + S.veri.lig.toUpperCase() + " " + modAdi() + (ayar.zor ? " · gizli istatistik" : "") + "\n" +
      (S.cift ? r.taraf.ad + ": " : "") + r.g + "-" + (n - r.g) + " (" + harfNotu(r.g, n) + ") 🏀\n" + satir.join("\n") + "\n" +
      r.taraf.bes.map((p, i) => yerKisa(DZ()[r.taraf.dizilis].yerler[i]) + " " + kisa(p.o.ad) + " (" + p.t.ad.split(" ")[0] + " " + p.t.sezon + ")").join("\n");
    if (sr) metin += "\n" + sonuclar[1].taraf.ad + ": " + sonuclar[1].g + "-" + (n - sonuclar[1].g) + " (" + harfNotu(sonuclar[1].g, n) + ") · seri " + sr.a + "-" + sr.b;
    const bitti = () => toast("Sonuç panoya kopyalandı");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(metin).then(bitti, () => { yedekKopya(metin); bitti(); });
    else { yedekKopya(metin); bitti(); }
  }
  function yedekKopya(t) { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch (e) { /* yok */ } a.remove(); }

  let toastZ;
  function toast(t, ms) { const e = $("toast"); e.textContent = t; e.classList.add("goster"); clearTimeout(toastZ); toastZ = setTimeout(() => e.classList.remove("goster"), ms || 2200); }

  // ---- çizim: üst bölüm, saha, öbür beş ----
  function sahaCiz() {
    const g = S.gorunen, taraf = S.taraflar[g], yerler = DZ()[taraf.dizilis].yerler;
    const yerlesebilir = aktif() === g && !S.tut;
    const sira = siradaki();
    const izlenen = S.cevrim && S.rakipBakiyor && g !== S.cevrim.ben && sira === g && S.takim && !S.tut
      ? S.takim.oyuncular.filter((x) => x.k === S.rakipBakiyor)[0] || null : null;
    $("sahaBaslik").innerHTML = S.cift
      ? kac(taraf.ad === "Sen" ? "Senin beşin" : taraf.ad + (taraf.yz ? " · beşi" : " · beşi")) + "<span>" +
        (S.bitti ? "" : S.tut && taraf.yz ? "seçimini yaptı" : sira === g && S.takim && !S.cevriliyor ? (taraf.yz ? "düşünüyor…" : "sıra burada") : "") + "</span>"
      : "";
    $("sahaBaslik").classList.toggle("rakip", S.cift && (taraf.yz || (S.iki && g === 1)));
    $("saha").classList.toggle("rakip", S.cift && (taraf.yz || (S.iki && g === 1)));
    $("pullar").innerHTML = taraf.bes.map((p, i) => {
      const yer = yerler[i], k = KONUM[i], stil = ' style="left:' + k[0] + "%;top:" + k[1] + '%"';
      if (!p) {
        const aday = S.secili && yerlesebilir ? S.secili : izlenen, hedef = !!aday, c = hedef ? uyumCarpan(aday, yer) : 1;
        return '<button class="pul' + (hedef ? " hedef" + (c < 1 ? " komsu" : "") : "") + '" data-i="' + i + '"' + stil + ' title="' + yerAdi(yer) +
          (hedef && c < 1 ? " · " + uyumSoz(c) + " ×" + c : "") + '">' +
          '<span class="daire">' + yerKisa(yer) + '</span><span class="etiket">' + (hedef && c < 1 ? "×" + c : yerAdi(yer)) + "</span></button>";
      }
      const c = uyumCarpan(p.o, yer), son = S.son && S.son.taraf === g && S.son.i === i && !S.bitti;
      return '<div class="pul dolu' + (c < 1 ? " disi" : "") + (son ? " son" : "") + '"' + stil + ' title="' + kac(p.o.ad + " · " + p.t.ad + " " + p.t.sezon + " · " + mevkiYaz(p.o) + (c < 1 ? " → " + yerAdi(yer) + " ×" + c : "")) + '">' +
        '<span class="daire">' + logo(p.t.logo, p.t.ad) + '<span class="no">' + yerKisa(yer) + "</span>" + (p.o.tr ? '<span class="tr">TR</span>' : "") + "</span>" +
        '<span class="etiket iki">' + adEtiketi(p.o.ad) + "</span></div>";
    }).join("");
    Array.prototype.forEach.call($("pullar").querySelectorAll("button.pul"), (b) => {
      b.onclick = () => {
        if (S.secili && aktif() !== null) { if (aktif() !== S.gorunen) { tutmayiBitir(); gorunenYap(aktif()); ciz(); return; } yerlestir(+b.dataset.i); }
        else if (aktif() !== null) { toast("Önce kadrodan bir oyuncu seç"); panelAc(); }
      };
    });
  }

  function ustCiz() {
    const g = S.gorunen, taraf = S.taraflar[g], secilen = 5 - bosSayisi(taraf);
    const tur = Math.min(5, secilen + (S.bitti || secilen === 5 ? 0 : 1));
    $("turAd").innerHTML = (S.bitti || hepsiDolu() ? (S.cift ? "Beşler hazır" : "Beşin hazır") : "Tur " + tur + " <span>/ 5</span>");
    $("cubuklar").innerHTML = [0, 1, 2, 3, 4].map((i) => '<i class="' + (i < secilen ? "dolu" : "") + '"></i>').join("");
    const tr = trSayisi(taraf), sira = siradaki();
    $("durum").innerHTML = '<span class="cip ' + (tr >= minTr() ? "tamam" : "eksik") + '">Türk ' + tr + "/" + minTr() + "</span>" + rolCipleri(taraf) +
      '<span class="cip">' + DZ()[taraf.dizilis].ad + "</span>" +
      (S.cift && !S.bitti && S.takim && !S.cevriliyor && sira !== null ? '<span class="cip sira">Sıra: ' + kac(S.taraflar[sira].ad) + "</span>" : "") +
      (S.secili ? '<span class="cip sira">Seçili: ' + kac(soyad(S.secili.ad)) + " → sahada bir yere dokun</span>" + '<button class="cip birak" data-birak="1">✕ Vazgeç</button>' : "") +
      (S.cevrim && S.rakipBakiyor && sira === 1 - S.cevrim.ben && S.takim && S.takim.oyuncular.some((x) => x.k === S.rakipBakiyor)
        ? '<span class="cip eksik">' + kac(S.taraflar[1 - S.cevrim.ben].ad) + " bakıyor: " + kac(soyad(S.takim.oyuncular.filter((x) => x.k === S.rakipBakiyor)[0].ad)) + "</span>" : "") +
      (S.cevrim && (S.odaSkor[0] + S.odaSkor[1]) > 0 ? '<span class="cip">Oda: ' + S.odaSkor[0] + "-" + S.odaSkor[1] + "</span>" : "");
    Array.prototype.forEach.call(document.querySelectorAll("[data-birak]"), (b) => { b.onclick = secimiBirak; });
    Array.prototype.forEach.call($("dizSec").children, (b) => { b.classList.toggle("aktif", b.dataset.diz === taraf.dizilis); b.disabled = S.bitti || taraf.yz; });
    const dolu = hepsiDolu(), sabit = S.cift && S.kaynak === "sabit";
    $("cevir").disabled = !S.basladi || S.cevriliyor || !!S.takim || dolu || S.bitti;
    const cevirenBen = !S.cevrim || sira === S.cevrim.ben;
    $("cevir").textContent = S.cevriliyor ? "Dönüyor…" : S.takim ? (sira !== null && S.taraflar[sira].yz ? "AI seçiyor…" : S.iki && sira !== null ? "Sıra: " + S.taraflar[sira].ad : "Oyuncunu seç")
      : cevirenBen ? "Çevir" : "Çarkı " + (sira !== null ? S.taraflar[sira].ad : "rakip") + " çevirecek";
    if (!cevirenBen) $("cevir").disabled = true;
    $("cevir").classList.toggle("gizli", dolu || S.bitti || sabit || (S.cift && !S.basladi));
    $("oyna").classList.toggle("gizli", !dolu || S.bitti);
    $("atlaTakim").disabled = !atlamaSerbest("takim");
    $("atlaSezon").disabled = !atlamaSerbest("sezon");
    const hakSahibi = S.cift ? S.taraflar[aktif() !== null ? aktif() : (S.cevrim ? S.cevrim.ben : g)] : null;
    $("atlaTakim").textContent = "Başka takım (" + (S.cift ? hakSahibi.atlaHak : S.taraflar[0].atla.takim) + ")";
    $("atlaSezon").textContent = "Başka sezon (" + (S.cift ? hakSahibi.atlaHak : S.taraflar[0].atla.sezon) + ")";
    $("atlaSezon").title = S.takim && !baskaSezonVar() ? "Bu kulübün başka sezonu yok" : S.cift ? "Oyun başına 1 atlama (kulüp ya da sezon), yalnız turun ilk seçimini yapan" : "Bir kez: aynı kulübün başka bir sezonu";
    $("atlaTakim").title = S.cift ? "Oyun başına 1 atlama (kulüp ya da sezon), yalnız turun ilk seçimini yapan" : "Bir kez: başka bir takım-sezon";
    $("atlaTakim").classList.toggle("gizli", S.cift && S.kaynak === "sabit"); $("atlaSezon").classList.toggle("gizli", S.cift && S.kaynak === "sabit");
    if (S.cift) { // sahada görünmeyen öbür beş: dokununca sahaya gelir
      const o = 1 - g, ot = S.taraflar[o], yerler = DZ()[ot.dizilis].yerler;
      $("digerAd").textContent = ot.ad === "Sen" ? "Senin beşin" : ot.ad;
      $("yzEtiket").textContent = (ot.yz ? YZ_AD[S.zorluk] + " · " : "") + "sahada göster";
      $("yzMini").innerHTML = ot.bes.map((p, i) => p
        ? '<div class="' + (S.son && S.son.taraf === o && S.son.i === i && !S.bitti ? "son" : "") + '" title="' + kac(p.o.ad + " · " + p.t.ad + " " + p.t.sezon) + '">' + logo(p.t.logo, p.t.ad) + '<span class="mini-ad">' + adEtiketi(p.o.ad) + "</span>" + "</div>"
        : "<div><b>" + yerKisa(yerler[i]) + "</b>boş</div>").join("");
    }
  }

  // ---- çizim: kadro paneli ----
  function panelAc() { S.panelElle = "acik"; panelDurum(); }
  // yanlışlıkla dokunulan oyuncuyu yerleştirmeden bırak, listeye dön
  function secimiBirak() {
    if (!S.secili) return;
    S.secili = null; bakiyorGonder(null); S.panelElle = "acik";
    ustCiz(); sahaCiz(); if (S.takim) listeCiz(); panelDurum();
  }
  function panelDurum() {
    const p = $("panel");
    let d = "";
    if (S.cift && !S.basladi) d = "acik";
    else if (S.takim && !S.cevriliyor && !S.bitti) d = S.panelElle || (S.secili || S.tut ? "kucuk" : "acik");
    p.classList.toggle("acik", d === "acik");
    p.classList.toggle("kucuk", d === "kucuk");
    p.classList.toggle("yarim", oku("panelBoy", "tam") === "yarim");
  }

  function kadroCiz() {
    const k = $("kadro");
    if (S.cevrim && !S.basladi) { beklemeCiz(); return; }
    if (S.cift && !S.basladi) { kurulumCiz(); return; }
    if (S.cevriliyor) { k.innerHTML = '<div class="bos"><div class="buyuk">…</div>Çark dönüyor</div>'; return; }
    if (!S.takim) {
      const dolu = hepsiDolu();
      k.innerHTML = dolu
        ? '<div class="bos"><div class="buyuk">' + (S.cift ? "Beşler hazır" : "Beşin hazır") + "</div>" + (S.bitti ? "Sezon oynandı." : "") +
          (S.bitti ? "" : '<button class="ana-btn turuncu" id="oynaSag" style="margin-top:16px">Sezonu oyna ▶</button>') + "</div>"
        : '<div class="bos"><div class="buyuk">' + S.veri.mac + "-0</div>“Çevir”e bas: rastgele bir kulüp ve sezon çıksın, kadrosundan bir oyuncu seç." +
          '<div class="ipucu">' + S.veri.takimlar.length + " takım-sezon, " + S.veri.takimlar.reduce((a, t) => a + t.oyuncular.length, 0) + " oyuncu-sezon</div></div>";
      if ($("oynaSag")) $("oynaSag").onclick = () => sezonuOyna(false);
      return;
    }
    const t = S.takim;
    k.innerHTML = '<div class="panel-ust"><div class="secili-serit" id="seciliSerit"></div><button class="panel-boy" id="panelBoy"></button></div>' +
      '<div class="panel-bas">' + logo(t.logo, t.ad) + '<div><div class="ad">' + kac(t.ad) + '</div><div class="alt">' + t.lig.toUpperCase() + " " + t.sezon +
      (t.gercek ? " · gerçek <b>" + t.gercek + "</b>" + (t.sira ? " (" + t.sira + ".)" : "") : "") + "</div></div></div>" +
      '<div class="arac"><input id="ara" type="search" placeholder="Oyuncu ara" value="' + kac(S.ara) + '" autocomplete="off"></div>' +
      '<div class="suzgec-satir"><div class="suzgec" id="suzgec">' + (S.sistem === "ao" ? [0, "A", "O"] : [0, 1, 2, 3, 4, 5]).map((m) => '<button data-m="' + m + '" class="' + (S.suzgec === m ? "aktif" : "") + '" title="' +
        (!m ? "Bütün mevkiler" : m === "A" ? "Arka" : m === "O" ? "Ön" : MEVKI_AD[m]) + '">' + (!m ? "Tümü" : m === "A" ? "Arka" : m === "O" ? "Ön" : m) + "</button>").join("") + "</div>" +
      (ayar.zor ? "" : '<select id="sirala" aria-label="Sırala">' + Object.keys(SIRALAR).map((s) => '<option value="' + s + '"' + (S.sirala === s ? " selected" : "") + ">" + SIRALAR[s] + "</option>").join("") + "</select>") + "</div>" +
      '<div class="liste" id="liste"></div><div class="ipucu" id="kadroIpucu"></div>';
    $("panelBoy").onclick = () => { yaz("panelBoy", oku("panelBoy", "tam") === "yarim" ? "tam" : "yarim"); S.panelElle = "acik"; panelDurum(); listeCiz(); };
    $("ara").oninput = (e) => { S.ara = e.target.value; listeCiz(); };
    if ($("sirala")) $("sirala").onchange = (e) => { S.sirala = e.target.value; listeCiz(); };
    Array.prototype.forEach.call($("suzgec").children, (b) => { b.onclick = () => { S.suzgec = isNaN(+b.dataset.m) ? b.dataset.m : +b.dataset.m; Array.prototype.forEach.call($("suzgec").children, (x) => x.classList.toggle("aktif", x === b)); listeCiz(); }; });
    listeCiz();
  }

  function listeCiz() {
    const t = S.takim, zor = ayar.zor, sira = siradaki(), a = aktif();
    const taraf = S.taraflar[a !== null ? a : S.gorunen];
    const ara = S.ara.toLocaleUpperCase("tr").trim();
    let oy = t.oyuncular.filter((o) => (!S.suzgec || (typeof S.suzgec === "string" ? kat(o).indexOf(S.suzgec) >= 0 : o.p.indexOf(S.suzgec) >= 0)) && (!ara || o.ad.indexOf(ara) >= 0 || o.ad.indexOf(S.ara.toUpperCase().trim()) >= 0));
    if (zor) oy = oy.slice().sort((x, y) => x.ad.localeCompare(y.ad, "tr"));
    else if (S.sirala !== "dk") oy = oy.slice().sort((x, y) => (y[S.sirala] || 0) - (x[S.sirala] || 0));
    const sayilar = (o) => zor ? "" : '<div class="sayilar">' + sayi1(o.sy) + " <span>sy</span> · " + sayi1(o.rb) + " <span>rb</span> · " + sayi1(o.as) + " <span>as</span> · " +
      sayi1(o.kul) + ' <span title="' + BASLIK_UZUN.kul + '">kul</span> · ' + sayi1(o.st) + " <span>tç</span> · " + sayi1(o.bl) + " <span>blk</span></div>";
    const roller = (o) => zor || klasik() || !o.r || !S.veri.motor.roller ? "" : '<div class="roller">' + S.veri.motor.roller.map((k, i) => ({ k: k, v: o.r[i] }))
      .filter((x) => x.v >= 0.5).sort((x, y) => y.v - x.v).slice(0, 3).map((x) => "<span>" + kac(Motor.ROL_AD[x.k]) + "</span>").join("") + "</div>";
    const sag = (o) => zor ? '<div class="vp"><b>' + o.mac + "</b><span>maç</span></div>" : '<div class="vp" title="Verimlilik puanı"><b>' + sayi1(o.vp) + "</b><span>VP</span></div>";
    $("liste").innerHTML = oy.length ? oy.map((o) => {
      const neden = secilebilir(taraf, o), kim = S.alinan[alinanAnahtar(t, o)];
      const bakilan = S.cevrim && S.rakipBakiyor === o.k && sira === 1 - S.cevrim.ben;
      return '<button class="oy' + (neden || a === null ? " kapali" : "") + (S.secili && S.secili.k === o.k ? " sec" : "") + (bakilan ? " bakiyor" : "") + '" data-k="' + o.k + '" title="' +
        kac(neden || (o.ulke || "") + (o.boy ? " · " + o.boy + " cm" : "") + (o.ts ? " · şut isabeti (TS) %" + Math.round(o.ts * 100) : "")) + '">' +
        mkRozet(o) + '<div style="min-width:0"><div class="isim">' + kac(o.ad) + trRozet(o) +
        (kim !== undefined ? '<span class="alindi">' + kac(S.taraflar[kim].ad === "Sen" ? "sende" : S.taraflar[kim].ad) + "</span>" : "") +
        (bakilan ? '<span class="alindi">' + kac(S.taraflar[1 - S.cevrim.ben].ad) + " bakıyor</span>" : "") +
        '</div><div class="ust">' + mevkiUzun(o) + " · " + o.mac + " maç" + (zor ? "" : " · " + o.dk.toFixed(0) + " dk") + "</div>" + sayilar(o) + roller(o) + "</div>" + sag(o) + "</button>";
    }).join("") : '<div class="bos" style="padding:20px">Bu süzgeçle oyuncu yok</div>';
    // panelin üst şeridi (telefonda panel küçükken de görünür) ve panel içindeki beş (telefonda sahayı görmeden seçtiklerin)
    $("seciliSerit").innerHTML = S.secili ? "Seçili: <b>" + kac(S.secili.ad) + '</b> <button class="cip birak" data-birak="1">✕ Vazgeç</button>'
      : '<span class="soluk">' + (a !== null ? "Oyuncu seç" : sira !== null ? "Sıra: " + kac(S.taraflar[sira].ad) : "") + "</span>";
    $("panelBoy").textContent = oku("panelBoy", "tam") === "yarim" ? "▴ Büyüt" : "▾ Küçült";
    Array.prototype.forEach.call(document.querySelectorAll("#seciliSerit [data-birak]"), (b) => { b.onclick = secimiBirak; });
    $("kadroIpucu").innerHTML = sira !== null && S.taraflar[sira].yz ? "<b>AI düşünüyor…</b>"
      : S.secili ? "<b>" + kac(S.secili.ad) + "</b> (" + mevkiUzun(S.secili) + ") seçildi: sahada parlayan bir yere dokun."
      : (S.iki && a !== null ? "<b>Sıra: " + kac(S.taraflar[a].ad) + ".</b> " : "") + "Bir oyuncuya dokun, sonra sahada bir yer seç." + (a !== null && trZorunlu(S.taraflar[a]) ? " Kalan yerler Türk oyuncu olmalı." : "");
    Array.prototype.forEach.call($("liste").querySelectorAll(".oy"), (r) => {
      r.onclick = () => {
        const ak = aktif();
        if (ak === null) { const s = siradaki(); toast(s !== null && S.taraflar[s].yz ? "Sıra AI'da" : "Bu tur seçimler tamam"); return; }
        const o = t.oyuncular.filter((x) => String(x.k) === r.dataset.k)[0], neden = secilebilir(S.taraflar[ak], o);
        if (neden) { toast(neden); return; }
        S.secili = S.secili && S.secili.k === o.k ? null : o;
        S.panelElle = null;
        tutmayiBitir(); gorunenYap(ak);
        bakiyorGonder(S.secili ? S.secili.k : null);
        ustCiz(); sahaCiz(); listeCiz(); panelDurum();
        if (S.secili && dar()) $("saha").scrollIntoView({ behavior: "smooth", block: "center" });
      };
    });
  }

  function ciz() {
    ustCiz();
    sahaCiz();
    kadroCiz();
    panelDurum();
  }

  // ---- iki taraflı modların kurulumu (vs AI, 2 kişi) ----
  function kulupler() {
    const m = {};
    S.veri.takimlar.forEach((t) => {
      if (t.oyuncular.length < 10) return; // tek kadrodan iki kişi 10 oyuncu seçer
      const x = m[t.kulup] || (m[t.kulup] = { kulup: t.kulup, ad: t.ad, son: t.sezon, sezonlar: [] });
      x.sezonlar.push(t); if (t.sezon > x.son) { x.son = t.sezon; x.ad = t.ad; }
    });
    return Object.values(m).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  }
  function kurulumCiz() {
    const k = $("kadro"), kl = kulupler();
    const secK = oku("yzKulup:" + S.veri.lig, null), kulup = kl.filter((x) => String(x.kulup) === String(secK))[0] || kl[0];
    const sezonlar = kulup.sezonlar.slice().sort((a, b) => (a.sezon < b.sezon ? 1 : -1));
    if (S.iki && S.ikiTur === "uzak") { uzakKurulumCiz(); return; }
    k.innerHTML = '<div class="kurulum">' + (S.iki ? ikiTurSecici() : "") +
      (S.yzMod
        ? '<h3>vs AI</h3><div class="ipucu">Sen ve AI sırayla seçersiniz; her tur ilk seçen değişir. AI seçince onun beşi birkaç saniye sahada görünür. Beşler dolunca iki sezon oynanır, sonra 7 maçlık seri.</div>' +
          '<label>AI zorluğu</label><div class="secici" id="yzZorSec">' + ["kolay", "orta", "zor"].map((z) => '<button data-z="' + z + '" class="' + (S.zorluk === z ? "aktif" : "") + '">' + YZ_AD[z] + "</button>").join("") + "</div>" +
          '<div class="ipucu">Kolay: yalnız oyuncunun gücüne bakar, en iyi 5 arasından rastgele seçer · Orta: beşin bütününe bakar (eksik rol, kullanım, uyum), iki dizilişi dener, kadro çok kötüyse atlar · Zor: hep en iyisini alır, dizilişi seçer, kadro beklenenden kötüyse başka takım/sezon ister.</div>'
        : '<h3>2 kişi · bu cihazda</h3><div class="ipucu">Aynı telefonda ya da bilgisayarda sırayla oynarsınız; her tur ilk seçen değişir. Sıra kimdeyse saha onun beşini gösterir, cihazı ona verin. Beşler dolunca iki sezon oynanır, sonra 7 maçlık seri.</div>' +
          '<label>Oyuncular</label><input id="ad1" maxlength="16" value="' + kac(S.taraflar[0].ad) + '" placeholder="1. oyuncu"><input id="ad2" maxlength="16" value="' + kac(S.taraflar[1].ad) + '" placeholder="2. oyuncu">') +
      '<label>Oyuncu havuzu</label><div class="secici" id="yzKaynakSec"><button data-k="cark" class="' + (S.kaynak === "cark" ? "aktif" : "") + '">Her tur çark</button><button data-k="sabit" class="' + (S.kaynak === "sabit" ? "aktif" : "") + '">Tek takım-sezon</button></div>' +
      (S.kaynak === "sabit"
        ? '<label>Takım</label><select id="yzKulup">' + kl.map((x) => '<option value="' + x.kulup + '"' + (x === kulup ? " selected" : "") + ">" + kac(x.ad) + " (" + x.sezonlar.length + " sezon)</option>").join("") + "</select>" +
          '<label>Sezon</label><select id="yzSezon">' + sezonlar.map((t) => '<option value="' + t.id + '">' + t.sezon + " · " + kac(t.ad) + (t.gercek ? " · " + t.gercek : "") + " · " + t.oyuncular.length + " oyuncu</option>").join("") + "</select>" +
          '<div class="ipucu">İkiniz de bu kadrodan seçersiniz (toplam 10 oyuncu). Yeterli Türk yoksa Türk kuralı gevşer.</div>'
        : "") +
      '<button class="ana-btn" id="yzBasla" style="margin-top:16px">Başla</button></div>';
    ikiTurBagla();
    if ($("yzZorSec")) Array.prototype.forEach.call($("yzZorSec").children, (b) => { b.onclick = () => { S.zorluk = ayar.yzZorluk = b.dataset.z; yaz("yzZorluk", S.zorluk); kurulumCiz(); }; });
    const adKaydet = () => {
      if (!$("ad1")) return;
      const a1 = $("ad1").value.trim() || "Oyuncu 1", a2 = $("ad2").value.trim() || "Oyuncu 2";
      S.taraflar[0].ad = a1; S.taraflar[1].ad = a2 === a1 ? a2 + " (2)" : a2; yaz("ad1", a1); yaz("ad2", a2);
    };
    Array.prototype.forEach.call($("yzKaynakSec").children, (b) => { b.onclick = () => { adKaydet(); S.kaynak = ayar.yzKaynak = b.dataset.k; yaz("yzKaynak", S.kaynak); kuralYaz(); ciz(); }; });
    if ($("yzKulup")) $("yzKulup").onchange = (e) => { adKaydet(); yaz("yzKulup:" + S.veri.lig, e.target.value); kurulumCiz(); };
    $("yzBasla").onclick = () => {
      adKaydet();
      S.basladi = true; kuralYaz();
      if (S.kaynak !== "sabit") { ciz(); return; }
      const t = S.veri.takimlar.filter((x) => x.id === $("yzSezon").value)[0];
      S.sabit = t; S.cekilen[t.id] = 1;
      const turk = t.oyuncular.filter((o) => o.tr).length;
      if (turk < 2 * minTr()) { S.minTrOzel = Math.floor(turk / 2); toast("Kadroda " + turk + " Türk var: Türk kuralı " + S.minTrOzel + "'e indi"); }
      kuralYaz();
      takimGeldi(t);
    };
  }

  // ---- çevrim içi oda: 2 kişi, ayrı telefonlar ----
  // Her hamle (çark, seçim, diziliş) odaya yazılır; iki telefon aynı hamle listesini aynı sırayla uygular,
  // böylece durum hep aynı kalır. Sayfa yenilenirse liste baştan (animasyonsuz) uygulanır.
  const KOD_HARF = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function kodUret() { let k = ""; for (let i = 0; i < 5; i++) k += KOD_HARF[Math.floor(Math.random() * KOD_HARF.length)]; return k; }
  function odaAdresi(kod) { return location.origin + location.pathname + "?oda=" + kod; }
  function adresiAyarla(kod) { try { history.replaceState(null, "", kod ? "?oda=" + kod : location.pathname); } catch (e) { /* yok */ } }
  function ikiTurSecici() {
    return '<div class="secici" id="ikiTurSec" style="margin-bottom:10px"><button data-t="uzak" class="' + (S.ikiTur === "uzak" ? "aktif" : "") + '">Ayrı telefonlar</button>' +
      '<button data-t="yerel" class="' + (S.ikiTur === "yerel" ? "aktif" : "") + '">Bu cihazda</button></div>';
  }
  function ikiTurBagla() {
    if (!$("ikiTurSec")) return;
    Array.prototype.forEach.call($("ikiTurSec").children, (b) => { b.onclick = () => { S.ikiTur = b.dataset.t; yaz("ikiTur", S.ikiTur); kurulumCiz(); }; });
  }
  function havuzSecimi(kl, kulup, sezonlar) {
    return '<label>Oyuncu havuzu</label><div class="secici" id="yzKaynakSec"><button data-k="cark" class="' + (S.kaynak === "cark" ? "aktif" : "") + '">Her tur çark</button><button data-k="sabit" class="' + (S.kaynak === "sabit" ? "aktif" : "") + '">Tek takım-sezon</button></div>' +
      (S.kaynak === "sabit"
        ? '<label>Takım</label><select id="yzKulup">' + kl.map((x) => '<option value="' + x.kulup + '"' + (x === kulup ? " selected" : "") + ">" + kac(x.ad) + " (" + x.sezonlar.length + " sezon)</option>").join("") + "</select>" +
          '<label>Sezon</label><select id="yzSezon">' + sezonlar.map((t) => '<option value="' + t.id + '">' + t.sezon + " · " + kac(t.ad) + (t.gercek ? " · " + t.gercek : "") + " · " + t.oyuncular.length + " oyuncu</option>").join("") + "</select>"
        : "");
  }
  function uzakKurulumCiz(kodOn) {
    const k = $("kadro"), kl = kulupler();
    const secK = oku("yzKulup:" + S.veri.lig, null), kulup = kl.filter((x) => String(x.kulup) === String(secK))[0] || kl[0];
    const sezonlar = kulup.sezonlar.slice().sort((a, b) => (a.sezon < b.sezon ? 1 : -1));
    const fb = Baglanti.firebaseHazir();
    k.innerHTML = '<div class="kurulum">' + ikiTurSecici() + "<h3>2 kişi · ayrı telefonlar</h3>" +
      '<div class="ipucu">Biri oda kurar, kodu ya da bağlantıyı arkadaşına atar; arkadaşın açıp katılır. Kurulum yok, tarayıcıda oynanır. Sırayla seçersiniz, her tur ilk seçen değişir; rakibin seçince onun beşi birkaç saniye sahada görünür.</div>' +
      (fb ? "" : '<div class="ipucu" style="color:var(--turuncu)">Çevrim içi bağlantı henüz ayarlanmadı: şimdilik yalnız bu tarayıcının sekmeleri arasında çalışır (deneme).</div>') +
      '<label>Adın</label><input id="benimAd" maxlength="16" value="' + kac(oku("benimAd", "")) + '" placeholder="Adın">' +
      '<label>Arkadaşının odasına katıl</label><div style="display:flex;gap:6px"><input id="odaKodu" maxlength="5" placeholder="Oda kodu" style="text-transform:uppercase;margin:0" value="' + kac(kodOn || "") + '">' +
      '<button class="ana-btn ikincil" id="katil" style="width:auto;font-size:17px;padding:8px 16px">Katıl</button></div>' +
      '<label style="margin-top:20px">ya da yeni oda kur (' + S.veri.lig.toUpperCase() + ")</label>" + havuzSecimi(kl, kulup, sezonlar) +
      '<button class="ana-btn" id="odaKur" style="margin-top:12px">Oda kur</button></div>';
    ikiTurBagla();
    Array.prototype.forEach.call($("yzKaynakSec").children, (b) => { b.onclick = () => { S.kaynak = ayar.yzKaynak = b.dataset.k; yaz("yzKaynak", S.kaynak); uzakKurulumCiz($("odaKodu").value); }; });
    if ($("yzKulup")) $("yzKulup").onchange = (e) => { yaz("yzKulup:" + S.veri.lig, e.target.value); uzakKurulumCiz($("odaKodu").value); };
    const ad = () => { const a = $("benimAd").value.trim(); if (!a) { toast("Önce adını yaz"); $("benimAd").focus(); return null; } yaz("benimAd", a); return a; };
    $("odaKur").onclick = async () => {
      const a = ad(); if (!a) return;
      $("odaKur").disabled = true;
      try { await odaKur(a, S.kaynak === "sabit" ? $("yzSezon").value : null); } catch (e) { toast("Oda kurulamadı: " + (e.message || e)); $("odaKur").disabled = false; }
    };
    $("katil").onclick = async () => {
      const a = ad(); if (!a) return;
      const kod = $("odaKodu").value.trim().toUpperCase();
      if (!/^[A-Z2-9]{5}$/.test(kod)) { toast("Oda kodu 5 karakter olmalı"); return; }
      $("katil").disabled = true;
      try { await odayaKatil(kod, a); } catch (e) { toast(String(e.message || e)); $("katil").disabled = false; }
    };
  }

  async function odaKur(ad, sabitId) {
    const b = await Baglanti.hazirla();
    let kod = null;
    for (let i = 0; i < 6 && !kod; i++) { const k = kodUret(); if (!(await Baglanti.odaOku(k))) kod = k; }
    if (!kod) throw new Error("Boş oda kodu bulunamadı");
    await Baglanti.odaKur(kod, { lig: ayar.lig, sim: ayar.sim, surum: SURUM, kaynak: S.kaynak, sabit: sabitId || "", tohum: "oda:" + kod + ":" + Math.random(), kuran: b.uid, zaman: Date.now() });
    await Baglanti.oyuncuYaz(kod, 0, { ad: ad, uid: b.uid, surum: SURUM });
    await odayaBaglan(kod);
  }
  async function odayaKatil(kod, ad) {
    const b = await Baglanti.hazirla();
    const oda = await Baglanti.odaOku(kod);
    if (!oda || !oda.ayar) throw new Error("Oda bulunamadı");
    const o = oda.oyuncular || {};
    if (!(o[0] && o[0].uid === b.uid) && !(o[1] && o[1].uid === b.uid)) {
      if (o[1]) throw new Error("Oda dolu");
      await Baglanti.oyuncuYaz(kod, 1, { ad: ad, uid: b.uid, surum: SURUM });
    }
    await odayaBaglan(kod);
  }
  async function odayaBaglan(kod) {
    const b = await Baglanti.hazirla();
    const oda = await Baglanti.odaOku(kod);
    const o = oda.oyuncular || {};
    const ben = o[0] && o[0].uid === b.uid ? 0 : 1;
    if (oda.ayar.sim && oda.ayar.sim !== ayar.sim) { ayar.sim = oda.ayar.sim; yaz("sim", ayar.sim); S.sim = ayar.sim; secicileriBoya(); }
    if (oda.ayar.lig !== ayar.lig && window.VERI[oda.ayar.lig]) {
      ayar.lig = oda.ayar.lig; yaz("lig", ayar.lig);
      Array.prototype.forEach.call($("ligSec").children, (x) => x.classList.toggle("aktif", x.dataset.lig === ayar.lig));
    }
    yeniOyun(); // iki modunda, lig odanınki
    S.tohum = oda.ayar.tohum; S.kaynak = oda.ayar.kaynak; S.basladi = false;
    S.cevrim = { kod: kod, ben: ben, uid: b.uid, islenen: {}, kuyruk: [], kapat: null, toplu: true, yeniIstek: null, tohumKok: oda.ayar.tohum };
    S.oyunNo = 0; S.odaSkor = [0, 0]; S.rakipBakiyor = null;
    S.gorunen = ben;
    if (S.kaynak === "sabit") {
      const t = S.veri.takimlar.filter((x) => x.id === oda.ayar.sabit)[0];
      if (t) { S.sabit = t; S.cekilen[t.id] = 1; const turk = t.oyuncular.filter((x) => x.tr).length; if (turk < 2 * minTr()) S.minTrOzel = Math.floor(turk / 2); }
    }
    adresiAyarla(kod);
    ciz();
    S.cevrim.kapat = Baglanti.dinle(kod, yansit);
  }
  function odadanCik() { if (S.cevrim && S.cevrim.kapat) S.cevrim.kapat(); S.cevrim = null; adresiAyarla(null); }

  // çevrim içi görünüm: sıra kimdeyse saha onun beşi (rakibin seçimini izlersin), boşta kendi beşin
  function gorunumGuncelle() {
    if (!S.cevrim || S.tut) return;
    const s = siradaki();
    S.gorunen = s !== null && !S.bitti && S.basladi ? s : S.cevrim.ben;
  }
  function bakiyorGonder(k) { // rakip telefonunda "X bakıyor" görünsün diye seçili oyuncu odaya yazılır
    if (!S.cevrim) return;
    Baglanti.oyuncuYaz(S.cevrim.kod, S.cevrim.ben, { ad: S.taraflar[S.cevrim.ben].ad, uid: S.cevrim.uid, surum: SURUM, bakiyor: k || null }).catch(() => {});
  }
  function hamleGonder(h) {
    Baglanti.hamleEkle(S.cevrim.kod, h).catch((e) => toast("Gönderilemedi: " + (e.message || e)));
  }
  // ozel: true = kadroda uygun oyuncu yok, yeniden çevir; "takim" / "sezon" = atlama hakkı
  function cevrimCevir(ozel) {
    if (!S.cevrim || S.bitti || S.cevriliyor) return;
    const atla = typeof ozel === "string" ? ozel : "", yeni = ozel === true || !!atla;
    if (S.takim && !yeni) return;
    if (atla && !atlamaSerbest(atla)) return;
    const sira = siradaki();
    if (sira !== S.cevrim.ben) { toast("Çarkı " + (sira !== null ? S.taraflar[sira].ad : "rakip") + " çevirecek"); return; }
    let aday = S.veri.takimlar.filter((x) => !S.cekilen[x.id]);
    if (atla === "sezon") aday = aday.filter((x) => x.kulup === S.takim.kulup);
    if (!aday.length) { toast("Çekilecek takım kalmadı"); return; }
    hamleGonder({ tip: "cevir", kim: S.cevrim.ben, id: aday[Math.floor(Math.random() * aday.length)].id, yeni: yeni, atla: atla });
  }

  // iki telefon farklı sürümdeyse seri ve sezonlar farklı hesaplanır: kalıcı uyarı ve yenile düğmesi
  function surumDenetle(rakip, odaAyar) {
    let mesaj = "";
    if (rakip && rakip.surum !== SURUM) {
      mesaj = !rakip.surum || rakip.surum < SURUM
        ? kac(rakip.ad || "Arkadaşın") + " eski sürümde: sayfasını yenilesin, yoksa sonuçlar iki telefonda farklı çıkar."
        : "Uygulaman eski sürümde: yenile, yoksa sonuçlar iki telefonda farklı çıkar.";
    } else if (odaAyar && odaAyar.surum !== SURUM && !rakip) {
      mesaj = "Bu oda başka bir sürümle kuruldu: ikiniz de sayfayı yenileyin.";
    }
    let e = $("surumUyari");
    if (!mesaj) { if (e) e.remove(); return; }
    if (!e) { e = document.createElement("div"); e.id = "surumUyari"; e.className = "surum-uyari"; document.body.appendChild(e); }
    e.innerHTML = "<span>" + mesaj + '</span><button onclick="location.reload()">Yenile</button>';
  }
  function yansit(oda) {
    if (!oda || !S.cevrim) return;
    const o = oda.oyuncular || {};
    if (o[0]) S.taraflar[0].ad = o[0].ad;
    if (o[1]) S.taraflar[1].ad = o[1].ad;
    S.rakipBakiyor = (o[1 - S.cevrim.ben] || {}).bakiyor || null;
    surumDenetle(o[1 - S.cevrim.ben], oda.ayar);
    if (!S.basladi && o[0] && o[1]) {
      S.basladi = true; kuralYaz();
      if (!S.cevrim.toplu) toast(S.taraflar[1 - S.cevrim.ben].ad + " odaya katıldı");
      if (S.kaynak === "sabit" && S.sabit && !S.takim) S.takim = S.sabit;
    }
    const h = oda.hamleler || {};
    Object.keys(h).sort().forEach((k) => { if (!S.cevrim.islenen[k]) { S.cevrim.islenen[k] = 1; S.cevrim.kuyruk.push(h[k]); } });
    isle();
    S.cevrim.toplu = false;
  }
  function isle() {
    while (S.cevrim && S.cevrim.kuyruk.length && !S.cevriliyor) uygula(S.cevrim.kuyruk.shift());
    if (S.cevriliyor) return;
    takildiMi();
    gorunumGuncelle();
    ciz();
    // beşler dolunca iki telefonda da sezon kendiliğinden oynanır (sonuç ortak tohumdan, iki tarafta aynı)
    if (S.cevrim && S.basladi && hepsiDolu() && !S.bitti) sezonuOyna(S.cevrim.toplu);
  }
  // sıra bendeyse ve kadroda bana uygun oyuncu yoksa: tek kadroda Türk kuralı gevşer, çarkta yeni kadro çekilir
  function takildiMi() {
    if (!S.cevrim || !S.takim || S.bitti || !S.basladi) return;
    const sira = siradaki();
    if (sira === null) return;
    const taraf = S.taraflar[sira];
    if (S.takim.oyuncular.some((o) => !secilebilir(taraf, o))) return;
    if (S.kaynak === "sabit") { S.minTrOzel = trSayisi(taraf); kuralYaz(); return; } // iki telefonda da aynı durumda aynı karar
    if (sira === S.cevrim.ben && S.cevrim.yeniIstek !== S.takim.id) { S.cevrim.yeniIstek = S.takim.id; toast("Bu kadroda sana uygun oyuncu yok, yeniden çevriliyor"); cevrimCevir(true); }
  }
  function uygula(h) {
    if (h.tip === "cevir") {
      const t = S.veri.takimlar.filter((x) => x.id === h.id)[0];
      if (h.atla) { // atlama hakkı: yalnız sırası gelen, hakkı varsa
        const tr = S.taraflar[h.kim];
        if (!S.takim || siradaki() !== h.kim || tr.atlaHak < 1 || S.turdaSecen.length > 0) return; // yalnız turun ilk seçeni
        tr.atlaHak--;
        if (h.kim !== S.cevrim.ben && !S.cevrim.toplu) toast(tr.ad + " atlama hakkını kullandı");
      }
      if (!t || (S.takim && !h.yeni) || S.bitti) return; // aynı anda iki çevirme: ilki geçerli
      S.cekilen[t.id] = 1; S.secili = null; S.ara = ""; S.suzgec = 0; S.panelElle = null;
      if (S.cevrim.toplu) { S.takim = t; makaraCiz(t, false); return; }
      S.takim = null; S.cevriliyor = true; ciz();
      const havuz = S.veri.takimlar; let adim = 0;
      const tik = setInterval(() => {
        adim++;
        if (adim < 12) makaraCiz(havuz[Math.floor(Math.random() * havuz.length)], true);
        else { clearInterval(tik); S.cevriliyor = false; makaraCiz(t, false); S.takim = t; isle(); }
      }, 75);
    } else if (h.tip === "sec") {
      if (!S.takim || S.takim.id !== h.id || siradaki() !== h.kim) return;
      const taraf = S.taraflar[h.kim], o = S.takim.oyuncular.filter((x) => x.k === h.k)[0];
      if (!o || taraf.bes[h.i] || secilebilir(taraf, o)) return;
      taraf.bes[h.i] = { o: o, t: { id: S.takim.id, ad: S.takim.ad, sezon: S.takim.sezon, logo: S.takim.logo } };
      S.alinan[alinanAnahtar(S.takim, o)] = h.kim;
      S.turdaSecen.push(h.kim);
      S.son = { taraf: h.kim, i: h.i };
      if (h.kim !== S.cevrim.ben && !S.cevrim.toplu) { // rakibin seçimi: onun beşi birkaç saniye sahada
        toast(taraf.ad + ": " + o.ad + " → " + yerAdi(DZ()[taraf.dizilis].yerler[h.i]));
        S.secili = null; S.tut = true; gorunenYap(h.kim); clearTimeout(S.tutZ);
        S.tutZ = setTimeout(() => { S.tut = false; gorunumGuncelle(); ciz(); }, AI_GOSTER_MS);
      }
      if (hepsiDolu()) { // oyun bitti: oda skoruna işle (ortak tohumdan, iki tarafta aynı)
        S.takim = null;
        const sr = seri(hesap(S.taraflar[0]), hesap(S.taraflar[1]));
        S.odaSkor[sr.a > sr.b ? 0 : 1]++;
        return;
      }
      if (siradaki() === null) { S.tur++; S.turdaSecen = []; if (S.kaynak !== "sabit") S.takim = null; }
    } else if (h.tip === "diz") {
      if (DZ()[h.d] && S.taraflar[h.kim]) S.taraflar[h.kim].dizilis = h.d;
    } else if (h.tip === "yeni") { // rövanş: aynı odada yeni oyun (yalnız bitmiş oyundan sonra; çift basış tek sayılır)
      if (!hepsiDolu()) return;
      oyunSifirla();
      if (!S.cevrim.toplu) toast("Rövanş başladı: oyun " + (S.oyunNo + 1));
    }
  }
  function oyunSifirla() {
    tutmayiBitir();
    S.oyunNo++;
    S.tohum = S.cevrim.tohumKok + ":" + S.oyunNo;
    S.taraflar.forEach((t) => { t.bes = [null, null, null, null, null]; t.atlaHak = 1; });
    S.alinan = {}; S.cekilen = {}; S.tur = 0; S.turdaSecen = []; S.son = null; S.secili = null; S.bitti = false;
    S.minTrOzel = null; S.takim = null; S.bosCevir = 0; S.cevrim.yeniIstek = null;
    if (S.kaynak === "sabit" && S.sabit) {
      S.cekilen[S.sabit.id] = 1; S.takim = S.sabit;
      const turk = S.sabit.oyuncular.filter((x) => x.tr).length;
      if (turk < 2 * minTr()) S.minTrOzel = Math.floor(turk / 2);
    }
    $("sonuc").classList.add("gizli"); $("sonuc").innerHTML = "";
    makaraCiz(S.kaynak === "sabit" ? S.sabit : null);
    kuralYaz();
  }
  function beklemeCiz() {
    const kod = S.cevrim.kod, adres = odaAdresi(kod);
    $("kadro").innerHTML = '<div class="kurulum"><h3>Oda ' + kod + "</h3>" +
      '<div class="ipucu">Arkadaşın bu bağlantıyı açsın ya da oyunda "2 kişi → Ayrı telefonlar"dan kodu girsin. O katılınca oyun başlar.</div>' +
      '<div class="bos" style="padding:18px 0"><div class="buyuk" style="letter-spacing:6px">' + kod + "</div></div>" +
      '<input readonly value="' + kac(adres) + '" id="odaAdres" onclick="this.select()">' +
      '<div class="dugmeler"><button class="ana-btn" id="paylasOda">Bağlantıyı paylaş</button><button class="ana-btn ikincil" id="odadanCik">Vazgeç</button></div>' +
      '<div class="ipucu">Rakip bekleniyor…</div></div>';
    $("paylasOda").onclick = () => {
      const metin = "Pota Altı " + S.veri.mac + "-0: beş kurma kapışması. Odaya katıl: " + adres;
      if (navigator.share) navigator.share({ title: "Pota Altı " + S.veri.mac + "-0", text: metin, url: adres }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(adres).then(() => toast("Bağlantı kopyalandı"), () => toast("Bağlantıyı elle kopyala"));
    };
    $("odadanCik").onclick = () => { odadanCik(); yeniOyun(); };
  }

  // ---- ayar düğmeleri ----
  function secicileriBoya() {
    ["ligSec", "modSec", "zorSec", "simSec"].forEach((id) => {
      Array.prototype.forEach.call($(id).children, (b) => { const a = Object.keys(b.dataset)[0]; b.classList.toggle("aktif", String(ayar[a]) === b.dataset[a]); });
    });
  }
  function ayarla(k, v) {
    if (k === "sim" && S.cevrim) { toast("Odadayken simülasyon değişmez (odayı kuran seçer)"); return; }
    if (k === "lig" && !(window.VERI && window.VERI[v])) { toast(v.toUpperCase() + " verisi yok"); return; }
    ayar[k] = v; yaz(k, v);
    secicileriBoya();
    if (k === "zor") { if (S.takim) listeCiz(); kadroCiz(); return; }
    if (k === "sim") { S.sim = v; if (S.bitti) sezonuOyna(true); else { if (S.takim) listeCiz(); ustCiz(); } return; }
    yeniOyun();
  }
  ["ligSec", "modSec", "zorSec", "simSec"].forEach((id) => {
    Array.prototype.forEach.call($(id).children, (b) => { b.onclick = () => { const a = Object.keys(b.dataset)[0]; ayarla(a, a === "zor" ? +b.dataset[a] : b.dataset[a]); }; });
  });
  secicileriBoya();
  Array.prototype.forEach.call($("dizSec").children, (b) => {
    b.onclick = () => {
      const taraf = S.taraflar[S.gorunen];
      if (S.bitti || taraf.yz) return;
      if (S.cevrim) { if (S.gorunen === S.cevrim.ben) hamleGonder({ tip: "diz", kim: S.cevrim.ben, d: b.dataset.diz }); return; }
      taraf.dizilis = b.dataset.diz; yaz(S.gorunen === 0 ? "dizilis" : "dizilis2", b.dataset.diz); ustCiz(); sahaCiz();
    };
  });
  $("yzBes").onclick = () => { if (!S.cift) return; tutmayiBitir(); gorunenYap(1 - S.gorunen); ustCiz(); sahaCiz(); panelDurum(); };
  $("tutamak").onclick = () => { S.panelElle = $("panel").classList.contains("acik") ? "kucuk" : "acik"; panelDurum(); };
  $("cevir").onclick = () => cevir(false);
  $("atlaTakim").onclick = () => cevir("takim");
  $("atlaSezon").onclick = () => cevir("sezon");
  $("oyna").onclick = () => sezonuOyna(false);
  // ---- uygulama (PWA): kendi servis çalışanı (kapsam yalnız bu klasör) ve yükle düğmesi ----
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
  const kurulu = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let kurIstegi = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); kurIstegi = e; if (!kurulu) $("yukle").classList.remove("gizli"); });
  window.addEventListener("appinstalled", () => { $("yukle").classList.add("gizli"); toast("Uygulama yüklendi: ana ekrandaki 30-0 simgesinden aç"); });
  if (ios && !kurulu) $("yukle").classList.remove("gizli"); // iPhone'da düğmeyle kurulum yok, nasıl yapılacağını gösterir
  $("yukle").onclick = () => {
    if (kurIstegi) { kurIstegi.prompt(); kurIstegi.userChoice.finally(() => { kurIstegi = null; $("yukle").classList.add("gizli"); }); return; }
    if (ios) { toast("Safari'de alttaki Paylaş (□↑) düğmesine bas → \"Ana Ekrana Ekle\"", 6000); return; }
    toast("Tarayıcı menüsünden \"Uygulamayı yükle\" ya da \"Ana ekrana ekle\"yi seç", 5000);
  };

  const odaParam = (new URLSearchParams(location.search).get("oda") || "").toUpperCase();
  if (/^[A-Z2-9]{5}$/.test(odaParam)) {
    ayar.mod = "iki"; yaz("mod", "iki"); yaz("ikiTur", "uzak");
    ayarla("lig", ayar.lig);
    const ad = oku("benimAd", "");
    if (ad) odayaKatil(odaParam, ad).catch((e) => { toast(String(e.message || e)); uzakKurulumCiz(odaParam); });
    else { uzakKurulumCiz(odaParam); toast("Adını yazıp Katıl'a bas"); }
  } else ayarla("lig", ayar.lig);
})();
