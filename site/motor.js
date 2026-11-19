// Pota Altı 30-0 maç motoru: sahiplik sahiplik oynanan maç.
// Her takım = seçilen beş (gerçek dakikalarıyla) + kalan dakikada lig ortalaması bir yedek. Oyuncuların kutu
// istatistikleri dönem farkından arındırılmış hâlde gelir (veri/isle.py, "m" alanı; sıra M.sira).
// Her hücumda: top kaybı (rakibin top çalması artırır) → serbest atış (rakibin faulü artırır) → şut (iki/üç;
// isabeti rakibin bloğu düşürür, takımın asist oranı artırır, şut yaratacak kimse yoksa ya da herkes topu
// isterse düşer) → kaçarsa hücum ribaundu (iki takımın ribaundu karşılaştırılır) ya da savunma ribaundu.
// Takımın sayı averajından gelen dakika payı ("nt") kutuya yansımayan etkiyi taşır.
(function () {
  const K = ["a2", "m2", "a3", "m3", "fa", "fm", "or", "dr", "as", "st", "bl", "tk", "pf"];
  // Katsayılar gerçek takımlarla sınandı (2026-11-18): önceki sezon verisiyle kurulan gerçek ilk beş bu sezonun
  // galibiyet oranını BSL'de r≈0,73, TBL'de r≈0,46 tahmin ediyor (eski güç modeli 0,75 / 0,57; sinerjisiz motor 0,76 / 0,46).
  const AYAR = {
    kAs: 0.12,     // asist oranı lig ortalamasından 0,1 fazlaysa şut isabeti +1,2 puan
    kEksik: 0.6,   // takımın doğal şut yaratması gerekenin %10 altındaysa isabet −6 puan (zorlama şutlar)
    kFazla: -0.2,  // şut yaratan çoksa zor şutlar da girer: kullanım fazlası %10 başına +2 isabet puanı (en çok %50 fazla)
    lambda: 1.5,   // takım averajı payının sayıya geçen kısmı
    guvenMac: 8,   // az maç oynayanın istatistiği bu kadar maçta yarı yarıya lig ortalamasına çekilir
    ev: 3,         // ev sahibi avantajı, sayı
    sigma: 13.9,   // maç sonucunun beklenen farktan sapması (motorun kendi maçlarında ölçüldü)
    // Rol sinerjisi (Basketball GM'nin beceri etiketlerinden esinle): beşteki rol sayıları azalan getiriyle hücum, savunma
    // ve ribaund sinerjisi verir; gerçek ilk beşlerin ortalamasından sapma isabeti ve ribaund payını kaydırır.
    sinOff: 0.06, sinDef: 0.05, sinRib: 0.25
  };
  const SIN = { // rol: [hangi sinerji, ağırlık, kaçıncı oyuncuda yarı yarıya]; ilk oyuncu çok, sonrakiler azalan değer
    sut: ["off", 0.45, 1.5], ok: ["off", 0.35, 0.7], ic: ["off", 0.2, 0.7],
    pota: ["def", 0.55, 0.7], cevre: ["def", 0.45, 0.9], rib: ["rib", 1, 1.2]
  };
  const ROL_AD = { sut: "Şutör", ok: "Oyun kurucu", ic: "İçeri skorer", pota: "Pota koruyucu", cevre: "Top çalan", rib: "Ribaundçu" };
  const ROL_HEDEF = { sut: 2, ok: 1, ic: 1, pota: 1, cevre: 1, rib: 1 }; // sinerjinin büyük kısmı bu sayıda dolar
  function sinerji(kisiler, M) { // kisiler: takimKur girdisi (yedekler hariç beş)
    const n = {}; (M.roller || []).forEach((k) => { n[k] = 0; });
    kisiler.forEach((x) => {
      const rp = x.ortalama ? M.rolOrt : x.o.r, dk = x.ortalama ? x.dk : x.o.dk, ag = Math.min(1, dk / 24) * (x.uyum == null ? 1 : x.uyum);
      if (rp) M.roller.forEach((k, i) => { n[k] += rp[i] * ag; });
    });
    const s = { off: 0, def: 0, rib: 0, n: n };
    Object.keys(SIN).forEach((k) => { if (k in n) { const [t, a, m] = SIN[k]; s[t] += a / (1 + Math.exp(-3 * (n[k] - m))); } });
    return s;
  }

  function sinir(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // kisiler: [{ o, uyum, ad }] ya da { ortalama: true, dk, ad } (lig ortalaması oyuncu)
  // secenek (yalnız kurulan beşler, oyun ayarı; değerler veride motor.oyun*): diklik = lig ortalamasından farkların katı,
  // dakika = beşin oyuncuları en az bu kadar oynar (en çok %35 fazla), sinerji = rol sinerjisinin ağırlığı.
  function takimKur(kisiler, M, secenek) {
    // M.diklik: motorun farkları gerçek takımlarınkinden dar çıkıyor, lig başına gerçeğe göre açılır (veri/isle.py).
    const L = M.L, D = ((secenek && secenek.diklik) || 1) * (M.diklik || 1);
    const liste = kisiler.map((x) => {
      const v = {};
      if (x.ortalama) { v.dk = x.dk; K.forEach((k) => { v[k] = x.dk * L[k]; }); return { ad: x.ad, v: v, nt: 0 }; }
      M.sira.forEach((k, i) => { v[k] = x.o.m[i]; });
      const w = x.o.mac / (x.o.mac + AYAR.guvenMac);
      K.forEach((k) => { v[k] = w * v[k] + (1 - w) * v.dk * L[k]; });
      const u = x.uyum == null ? 1 : x.uyum;
      if (u < 1) { // mevkisi dışında: ribaund, asist, savunma azalır, top kaybı ve kaçan şut artar
        // (×0,8 uyumda %10 / 3 isabet puanı: bir oyuncu ~1,5 sayı/maç kaybettirir, eski güç cezasıyla aynı ölçek)
        const yari = 1 - (1 - u) / 2;
        ["or", "dr", "as", "st", "bl"].forEach((k) => { v[k] *= yari; });
        v.tk *= 2 - yari;
        const dus = (1 - u) * 0.15;
        v.m2 = Math.max(0, v.m2 - v.a2 * dus); v.m3 = Math.max(0, v.m3 - v.a3 * dus);
      }
      let nt = x.o.nt || 0;
      if (secenek && secenek.dakika && v.dk < secenek.dakika) {
        const c = Math.min(1.35, secenek.dakika / v.dk); v.dk *= c; K.forEach((k) => { v[k] *= c; }); nt *= c;
      }
      return { ad: x.ad, v: v, nt: nt };
    });
    let dk = liste.reduce((a, p) => a + p.v.dk, 0);
    if (dk > 200) { const c = 200 / dk; liste.forEach((p) => { p.v.dk *= c; K.forEach((k) => { p.v[k] *= c; }); p.nt *= c; }); dk = 200; }
    const yedekDk = 200 - dk;
    if (yedekDk > 0.5) { const v = { dk: yedekDk }; K.forEach((k) => { v[k] = yedekDk * L[k]; }); liste.push({ ad: "Yedekler", yedek: true, v: v, nt: 0 }); }
    const T = {}; K.forEach((k) => { T[k] = liste.reduce((a, p) => a + p.v[k], 0); });
    T.nt = liste.reduce((a, p) => a + p.nt, 0) / 5; // beşin takım averajındaki payı (sayı/maç)
    const lr = ligOranlari(M), ham = oranlar(T), r = oranlar(T);
    if (D !== 1) { Object.keys(r).forEach((k) => { if (k in lr) r[k] = lr[k] + D * (r[k] - lr[k]); }); r.nt *= D; }
    const kul = r.kul / lr.kul;
    r.eksik = Math.max(0, 1 - kul); r.fazla = Math.max(0, kul - 1);
    const pay = (k) => { const t = liste.reduce((a, p) => a + Math.max(0, p.v[k]), 0) || 1; return liste.map((p) => Math.max(0, p.v[k]) / t); };
    const paylar = {}; ["a2", "a3", "fa", "or", "dr", "as", "st", "bl", "tk"].forEach((k) => { paylar[k] = pay(k); });
    return { kisiler: liste, T: T, r: r, ham: ham, paylar: paylar, sin: M.roller ? sinerji(kisiler, M) : null,
      sinK: (secenek && secenek.sinerji) || 1 };
  }

  function oranlar(T) {
    const fga = T.a2 + T.a3, kul = fga + 0.44 * T.fa + T.tk;
    return {
      tov: T.tk / kul, ft: 0.44 * T.fa / kul, s3: T.a3 / fga,
      p2: T.m2 / T.a2, p3: T.m3 / T.a3, pf: T.fm / Math.max(0.01, T.fa),
      ast: T.as / Math.max(0.01, T.m2 + T.m3),
      or: T.or, dr: T.dr, st: T.st, bl: T.bl, foul: T.pf, kul: kul, nt: T.nt || 0
    };
  }
  const ligOnbellek = new WeakMap();
  function ligTakimi(M) { // lig ortalaması takım (200 dakika ortalama oyuncu)
    if (!ligOnbellek.has(M)) {
      const T = {}; K.forEach((k) => { T[k] = 200 * M.L[k]; }); T.nt = 0;
      const r = oranlar(T); r.eksik = 0; r.fazla = 0;
      ligOnbellek.set(M, { T: T, r: r, lr: oranlar(T), sahiplik: T.a2 + T.a3 + 0.44 * T.fa + T.tk - T.or });
    }
    return ligOnbellek.get(M);
  }
  function ligOranlari(M) { return ligTakimi(M).lr; }

  // A hücumda, B savunmada: hücum başına olasılıklar. ev: +1 A evinde, −1 B evinde, 0 tarafsız
  function eslesme(A, B, M, ev) {
    const lig = ligTakimi(M), lr = lig.lr, Lt = lig.T;
    const atis = (Lt.a2 + Lt.a3) * 2.2; // maç başı şutla gelen sayı ölçeği: sayı farkını isabet farkına çevirir
    const stEtki = (B.r.st - lr.st) / lr.kul; // kirpSt: kurulan beşin az top çalması rakibe kolaylık sağlamaz
    const tov = sinir(A.r.tov + (B.kirpSt ? Math.max(0, stEtki) : stEtki) + (B.calmaTov || 0) + (A.ekTov || 0), 0.04, 0.34); // ekTov: ikili seride top çalma baskısı
    const ft = sinir(A.r.ft * Math.sqrt(sinir(B.r.foul / lr.foul, 0.6, 1.6)), 0.02, 0.35);
    const sb = sinerjiTaban(M), sA = A.sin || sb, sB = B.sin || sb;
    const kA = A.sinK || 1, kB = B.sinK || 1;
    const kalite = AYAR.sinOff * kA * (sA.off - sb.off) - AYAR.sinDef * kB * (sB.def - sb.def) + AYAR.kAs * (A.r.ast - lr.ast) -
      AYAR.kEksik * A.r.eksik - AYAR.kFazla * Math.min(0.5, A.r.fazla) +
      (AYAR.lambda * (A.r.nt - B.r.nt) + ev * AYAR.ev) / 2 / atis; // farkın yarısı hücumdan, yarısı savunmadan
    const p2 = sinir(A.r.p2 - (B.r.bl - lr.bl) / Lt.a2 + kalite, 0.25, 0.78);
    const p3 = sinir(A.r.p3 + kalite * 0.8, 0.12, 0.55);
    const a0 = A.r.or * (1 + AYAR.sinRib * kA * (sA.rib - sb.rib)), d0 = B.r.dr * (1 + AYAR.sinRib * kB * (sB.rib - sb.rib));
    const a = a0 / (a0 + lr.dr), d = d0 / (d0 + lr.or), lp = lr.or / (lr.or + lr.dr);
    const od = (a / (1 - a)) * ((1 - d) / d) / (lp / (1 - lp));
    return {
      tov: tov, ft: ft, s3: sinir(A.r.s3, 0.05, 0.7), p2: p2, p3: p3, pf: sinir(A.r.pf, 0.4, 0.95), por: sinir(od / (1 + od), 0.08, 0.5),
      ast: sinir(A.r.ast, 0.3, 0.85), calma: sinir(B.r.st / Math.max(0.1, B.r.st + lr.kul * lr.tov - lr.st), 0.2, 0.8),
      blok: sinir(B.r.bl / Math.max(1, Lt.a2 - Lt.m2), 0, 0.3)
    };
  }

  function beklenenSayi(e) { // hücum başına beklenen sayı
    const sut = 1 - e.tov - e.ft, isabet = e.s3 * e.p3 + (1 - e.s3) * e.p2;
    return (e.ft * 2 * e.pf + sut * (e.s3 * 3 * e.p3 + (1 - e.s3) * 2 * e.p2)) / (1 - sut * (1 - isabet) * e.por);
  }
  function beklenenFark(A, B, M, ev) { // A'nın maç başı beklenen sayı farkı
    const n = ligTakimi(M).sahiplik;
    return n * (beklenenSayi(eslesme(A, B, M, ev || 0)) - beklenenSayi(eslesme(B, A, M, -(ev || 0))));
  }
  function olasilik(fark) { // normal dağılım, Abramowitz-Stegun
    const z = fark / AYAR.sigma, t = 1 / (1 + 0.2316419 * Math.abs(z));
    const y = 0.3989423 * Math.exp(-z * z / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - y : y;
  }

  function sec(pay, rng, haric) {
    let t = 0; for (let i = 0; i < pay.length; i++) if (i !== haric) t += pay[i];
    let r = rng() * t;
    for (let i = 0; i < pay.length; i++) { if (i === haric) continue; r -= pay[i]; if (r <= 0) return i; }
    return pay.length - 1 === haric ? 0 : pay.length - 1;
  }
  function bosKutu(n) { const k = []; for (let i = 0; i < n; i++) k.push({ sy: 0, rb: 0, as: 0, st: 0, bl: 0, tk: 0 }); return k; }

  function hucum(e, H, S, rng, kH, kS) {
    let puan = 0;
    for (let tekrar = 0; tekrar < 5; tekrar++) {
      const r = rng();
      if (r < e.tov) {
        kH[sec(H.paylar.tk, rng)].tk++;
        if (rng() < e.calma) kS[sec(S.paylar.st, rng)].st++;
        return puan;
      }
      if (r < e.tov + e.ft) {
        const i = sec(H.paylar.fa, rng); let s = 0;
        if (rng() < e.pf) s++; if (rng() < e.pf) s++;
        kH[i].sy += s; return puan + s;
      }
      const uc = rng() < e.s3, i = sec(uc ? H.paylar.a3 : H.paylar.a2, rng);
      if (rng() < (uc ? e.p3 : e.p2)) {
        const p = uc ? 3 : 2; kH[i].sy += p;
        if (rng() < e.ast) kH[sec(H.paylar.as, rng, i)].as++;
        return puan + p;
      }
      if (!uc && rng() < e.blok) kS[sec(S.paylar.bl, rng)].bl++;
      if (rng() < e.por) { kH[sec(H.paylar.or, rng)].rb++; continue; }
      kS[sec(S.paylar.dr, rng)].rb++;
      return puan;
    }
    return puan;
  }

  // Tek maç. ev: +1 A evinde, −1 B evinde, 0 tarafsız
  function mac(A, B, M, rng, ev) {
    const eA = eslesme(A, B, M, ev || 0), eB = eslesme(B, A, M, -(ev || 0));
    const kA = bosKutu(A.kisiler.length), kB = bosKutu(B.kisiler.length);
    const n = Math.round(ligTakimi(M).sahiplik + (rng() - 0.5) * 8);
    let a = 0, b = 0, uzatma = 0;
    for (let i = 0; i < n; i++) { a += hucum(eA, A, B, rng, kA, kB); b += hucum(eB, B, A, rng, kB, kA); }
    while (a === b) { uzatma++; for (let i = 0; i < Math.round(n / 8); i++) { a += hucum(eA, A, B, rng, kA, kB); b += hucum(eB, B, A, rng, kB, kA); } }
    return { a: a, b: b, uzatma: uzatma, kA: kA, kB: kB };
  }

  // Katkılar: bir etkeni lig ortalamasına çekince lig ortalaması rakibe karşı beklenen fark ne kadar değişiyor
  const yz = (x) => "%" + (x * 100).toFixed(1).replace(".", ","), bir = (x) => x.toFixed(1).replace(".", ",");
  const ETKENLER = [
    { ad: "Şut isabeti", alanlar: ["p2", "p3", "s3"], ipucu: "iki ve üç sayılık isabet, üçlük payı",
      goster: (r) => "2'lik " + yz(r.p2) + ", 3'lük " + yz(r.p3) + ", şutların " + yz(r.s3) + "'i üçlük" },
    { ad: "Serbest atış", alanlar: ["ft", "pf"], ipucu: "çizgiye gitme ve isabet", goster: (r) => "hücumların " + yz(r.ft) + "'i çizgide, isabet " + yz(r.pf) },
    { ad: "Top kaybı", alanlar: ["tov"], ipucu: "hücum başına top kaybı (azı iyi)", goster: (r) => "hücumların " + yz(r.tov) + "'i" },
    { ad: "Hücum ribaundu", alanlar: ["or"], ipucu: "ikinci şans", goster: (r) => bir(r.or) + " / maç" },
    { ad: "Savunma ribaundu", alanlar: ["dr"], ipucu: "rakibe ikinci şans vermeme", goster: (r) => bir(r.dr) + " / maç" },
    { ad: "Asist", alanlar: ["ast"], ipucu: "top paylaşımı şut kalitesini artırır", goster: (r) => "isabetlerin " + yz(r.ast) + "'i asistli" },
    { ad: "Top çalma", alanlar: ["st"], ipucu: "rakibe top kaybettirme", goster: (r) => bir(r.st) + " / maç" },
    { ad: "Blok", alanlar: ["bl"], ipucu: "rakibin iki sayılık isabetini düşürür", goster: (r) => bir(r.bl) + " / maç" },
    { ad: "Faul", alanlar: ["foul"], ipucu: "rakibi çizgiye gönderme (azı iyi)", goster: (r) => bir(r.foul) + " / maç" },
    { ad: "Şut yaratma", alanlar: ["eksik", "fazla"], ipucu: "topu isteme payı: kimse şut yaratmıyorsa zorlama şut; şut yaratan çoksa zor şutlar da girer",
      goster: (r, lr) => "top kullanımı lig ortalamasının " + yz(r.kul / lr.kul) },
    { ad: "Takım katkısı", alanlar: ["nt"], ipucu: "oyuncuların takımlarının sayı averajından dakika payı (kutuya yansımayan savunma, uyum)",
      goster: (r) => (r.nt >= 0 ? "+" : "") + bir(r.nt) + " sayı / maç" }
  ];
  function katkilar(A, M) {
    const lig = ligTakimi(M), L = { r: lig.r, paylar: {} }, taban = beklenenFark(A, L, M, 0);
    return ETKENLER.map((et) => {
      const r = Object.assign({}, A.r); et.alanlar.forEach((k) => { r[k] = lig.r[k]; });
      const x = Object.assign({}, A, { r: r }); if (et.alanlar.indexOf("st") >= 0) x.calmaTov = 0;
      return { ad: et.ad, ipucu: et.ipucu, deger: et.goster(A.ham, lig.lr), lig: et.goster(lig.lr, lig.lr), d: taban - beklenenFark(x, L, M, 0) };
    }).concat(A.sin ? [["off", "Hücum sinerjisi", "şutör, oyun kurucu, içeri skorer"], ["def", "Savunma sinerjisi", "pota koruyucu, top çalan"], ["rib", "Ribaund sinerjisi", "ribaundçu"]].map(([k, ad, roller]) => {
      const sin = Object.assign({}, A.sin); sin[k] = sinerjiTaban(M)[k];
      const x = Object.assign({}, A, { sin: sin });
      return { ad: ad, ipucu: "beşteki roller: " + roller + " (ilki çok, sonrakiler daha az değerli)", deger: "gerçek ilk beş ortalamasına göre " + (A.sin[k] >= sin[k] ? "+" : "") + bir(100 * (A.sin[k] - sin[k])) + " puan", lig: "0",
        d: taban - beklenenFark(x, L, M, 0) };
    }) : []);
  }

  const sinTabanOnbellek = new WeakMap();
  function sinerjiTaban(M) { // gerçek ilk beşlerin ortalama sinerjisi (havuz kurulunca hesaplanır; yoksa 0)
    return sinTabanOnbellek.get(M) || { off: 0, def: 0, rib: 0 };
  }
  // Rakip havuzu: ligin bütün gerçek takımları, en çok süre alan beşi + lig ortalaması yedek
  const havuzOnbellek = new WeakMap();
  function havuz(V) {
    if (!havuzOnbellek.has(V)) {
      havuzOnbellek.set(V, V.takimlar.map((t) => {
        const bes = t.oyuncular.slice().sort((a, b) => b.dk * b.mac - a.dk * a.mac || a.k - b.k).slice(0, 5);
        return { t: t, A: takimKur(bes.map((o) => ({ o: o, ad: o.ad })), V.motor) };
      }));
      const h = havuzOnbellek.get(V), ort = { off: 0, def: 0, rib: 0 };
      h.forEach((x) => { if (x.A.sin) ["off", "def", "rib"].forEach((k) => { ort[k] += x.A.sin[k] / h.length; }); });
      sinTabanOnbellek.set(V.motor, ort);
    }
    return havuzOnbellek.get(V);
  }
  // Sezon: N/2 farklı gerçek takım, her biriyle bir iç saha bir deplasman, karışık sırayla
  function takvim(V, rng) {
    const h = havuz(V), n = V.mac, sira = h.map((_, i) => i);
    for (let i = sira.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = sira[i]; sira[i] = sira[j]; sira[j] = x; }
    const maclar = [];
    sira.slice(0, n / 2).forEach((i) => { maclar.push({ i: i, ev: 1 }); maclar.push({ i: i, ev: -1 }); });
    for (let i = maclar.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = maclar[i]; maclar[i] = maclar[j]; maclar[j] = x; }
    return maclar.map((m) => ({ rakip: h[m.i], ev: m.ev }));
  }

  window.Motor = { AYAR: AYAR, takimKur: takimKur, beklenenFark: beklenenFark, olasilik: olasilik, mac: mac, katkilar: katkilar,
    ligTakimi: ligTakimi, havuz: havuz, takvim: takvim, sinerji: sinerji, sinerjiTaban: sinerjiTaban,
    ROL_AD: ROL_AD, ROL_HEDEF: ROL_HEDEF };
})();
