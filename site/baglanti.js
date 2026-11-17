/* Çevrim içi oda bağlantısı: Firebase Realtime Database (firebase-ayar.js doluysa) ya da yerel test
   (aynı tarayıcının sekmeleri arasında; BroadcastChannel + localStorage). İki yol da aynı arayüzü verir:
   hazirla() → {tur, uid}; odaKur(kod, ayar); odaOku(kod); oyuncuYaz(kod, i, veri); hamleEkle(kod, hamle); dinle(kod, cb) → kapat() */
window.Baglanti = (function () {
  "use strict";
  let tur = null, uid = null, db = null;

  const SURUM = "10.12.2"; // Firebase JS SDK (compat), yalnız çevrim içi oda açılınca yüklenir
  function firebaseHazir() { return !!(window.FIREBASE_AYAR && window.FIREBASE_AYAR.apiKey); }
  function yukle(src) {
    return new Promise((ok, hata) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => hata(new Error("Yüklenemedi: " + src)); document.head.appendChild(s); });
  }

  async function hazirla() {
    if (tur) return { tur: tur, uid: uid };
    if (firebaseHazir()) {
      if (!window.firebase) {
        const kok = "https://www.gstatic.com/firebasejs/" + SURUM + "/";
        await yukle(kok + "firebase-app-compat.js");
        await Promise.all([yukle(kok + "firebase-auth-compat.js"), yukle(kok + "firebase-database-compat.js")]);
      }
      if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_AYAR);
      // kimlik sekmeye bağlı: yenilemede kalır, aynı tarayıcının iki sekmesi iki ayrı oyuncu olur
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
      const c = await firebase.auth().signInAnonymously();
      uid = c.user.uid; db = firebase.database(); tur = "firebase";
    } else {
      try { uid = sessionStorage.getItem("p300uid"); } catch (e) { /* yok */ }
      if (!uid) { uid = "y" + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem("p300uid", uid); } catch (e) { /* yok */ } }
      tur = "yerel";
    }
    return { tur: tur, uid: uid };
  }

  // ---- yerel test taşıyıcısı ----
  const kanal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("p300oda") : null;
  const yAnahtar = (kod) => "p300oda:" + kod;
  function yOku(kod) { try { return JSON.parse(localStorage.getItem(yAnahtar(kod)) || "null"); } catch (e) { return null; } }
  function yYaz(kod, v) { try { localStorage.setItem(yAnahtar(kod), JSON.stringify(v)); } catch (e) { /* yok */ } if (kanal) kanal.postMessage(kod); }
  const yDinleyiciler = {};
  if (kanal) kanal.onmessage = (e) => (yDinleyiciler[e.data] || []).forEach((cb) => cb(yOku(e.data)));
  function yHaber(kod) { (yDinleyiciler[kod] || []).forEach((cb) => cb(yOku(kod))); }

  let sayac = 0;
  function sirali() { return Date.now().toString(36).padStart(9, "0") + "-" + (++sayac).toString(36).padStart(4, "0") + Math.random().toString(36).slice(2, 5); }

  async function odaKur(kod, ayar) {
    if (tur === "firebase") { await db.ref("odalar/" + kod + "/ayar").set(ayar); return; }
    if (yOku(kod)) throw new Error("Oda var");
    yYaz(kod, { ayar: ayar }); yHaber(kod);
  }
  async function odaOku(kod) {
    if (tur === "firebase") { const s = await db.ref("odalar/" + kod).get(); return s.val(); }
    return yOku(kod);
  }
  async function oyuncuYaz(kod, i, veri) {
    if (tur === "firebase") { await db.ref("odalar/" + kod + "/oyuncular/" + i).set(veri); return; }
    const v = yOku(kod) || {}; v.oyuncular = v.oyuncular || {}; v.oyuncular[i] = veri; yYaz(kod, v); yHaber(kod);
  }
  async function hamleEkle(kod, hamle) {
    if (tur === "firebase") { await db.ref("odalar/" + kod + "/hamleler").push(hamle); return; }
    const v = yOku(kod) || {}; v.hamleler = v.hamleler || {}; v.hamleler[sirali()] = hamle; yYaz(kod, v); yHaber(kod);
  }
  function dinle(kod, cb) {
    if (tur === "firebase") {
      const ref = db.ref("odalar/" + kod);
      const f = ref.on("value", (s) => cb(s.val()));
      return () => ref.off("value", f);
    }
    (yDinleyiciler[kod] = yDinleyiciler[kod] || []).push(cb);
    setTimeout(() => cb(yOku(kod)), 0);
    return () => { yDinleyiciler[kod] = (yDinleyiciler[kod] || []).filter((x) => x !== cb); };
  }

  return { hazirla: hazirla, odaKur: odaKur, odaOku: odaOku, oyuncuYaz: oyuncuYaz, hamleEkle: hamleEkle, dinle: dinle, tur: () => tur, firebaseHazir: firebaseHazir };
})();
