# Pota Altı 30-0

BSL ve TBL için takım+sezon çevirmeli beş kurma oyunu. Pota Altı uygulamasından ayrı bir depo.

Yayın: **https://pota-30-0.web.app** (Firebase Hosting; `.github/workflows/firebase.yml`, gizli ayar
`FIREBASE_SERVICE_ACCOUNT` — Admin SDK hizmet hesabına "Firebase Hosting Admin" rolü verildi). GitHub Pages
(https://potaalti.github.io/pota-30-0/, `.github/workflows/yayin.yml`) de yayınlanır ama oraya gelen web.app'e yönlenir:
aynı sitenin kökünde Pota Altı uygulaması kurulu olduğundan Chrome oyunu ayrı uygulama olarak kurdurmuyordu. Çevrim içi 2 kişilik odalar Firebase Realtime Database (`pota-30-0` projesi) kullanır.

## Uygulama (PWA)

Telefonda "Uygulamayı yükle" (Android/Chrome düğmesi) ya da Safari → Paylaş → "Ana Ekrana Ekle" (iPhone) ile kurulur.
`site/manifest.webmanifest` (kimlik ve kapsam yalnız `/pota-30-0/`), `site/sw.js` (ağ öncelikli önbellek; tek başına ve
vs AI internetsiz oynanır), simgeler `site/simge-*.png` (`veri/simge.ps1` ile üretilir). Aynı sitede kökte kurulu Pota Altı
uygulamasından ayrı bir uygulamadır; kapsamı daha dar olduğu için bu klasörün sayfalarını kendi servis çalışanı denetler.

## Oynamak

Yayındaki adresi aç ya da yerelde `site/` klasörünü bir HTTP sunucusuyla sun (ör. `python -m http.server -d site`);
veri `site/veri/*.js` içinde gömülü. Ham TBF önbelleği (`veri/ham/`, 44 MB) depoda yok, `veri/cek.py` ile yeniden çekilir.

- Her turda rastgele bir takım-sezon çıkar (ör. FENERBAHÇE 2016-17). Kadrodan bir oyuncu seç, beşte bir yere koy.
- Mevki sistemi lige göre: **BSL** beş mevki, **TBL** yalnız Arka (1-2) / Ön (3-5) — TBL'de mevki verisi zayıf
  (Wikidata kapsamı %31). TBL'de iki tarafa da uyan (mevkileri 2 ve 3'ü kapsayan) oyuncu cezasız her yere konur, mevki
  dışı ×0,88. TBL oyuncu-sezonları: 937 Arka, 1.242 Ön, 512 ikisi birden.
- BSL'de beş mevki: 1 oyun kurucu, 2 şutör, 3 kısa forvet, 4 uzun forvet, 5 pivot. Diziliş 2 Arka 3 Ön (1-2-3-4-5) ya da
  3 Arka 2 Ön (1-2-gard-4-5); sezon oynanana kadar değiştirilebilir. Komşu mevki ×0,92, daha uzağı ×0,80.
- En az 1 Türk (BSL) / 3 Türk (TBL), aynı oyuncu bir kez, her takım-sezondan bir oyuncu.
- Bir "başka takım" (yeni takım-sezon) ve bir "başka sezon" (aynı kulübün başka sezonu; kulüp kimliği TBF teamId) hakkı.
- Sonuç: kayıt, harf notu (A+ … F), en iyi seçim, en büyük zayıflık, döküm.
- **vs AI**: sen ve AI sırayla seçersiniz (AI seçerken onun beşi 2,5 sn sahada görünür) (her tur ilk seçen değişir), alınan oyuncu rakibe kalmaz.
  Havuz: her tur çark ya da seçilen tek takım-sezon (ör. Fenerbahçe 2016-17; ikiniz de o kadrodan 5'er oyuncu).
  Zorluk: Kolay (en iyi 6 aday arasından rastgele), Orta (3), Zor (her zaman en iyisi; güç × mevki uyumu).
  Beşler dolunca iki sezon oynanır, ardından 7 maçlık karşılıklı seri (olasılık iki takım gücünün farkından).
- **2 kişi**: iki oyuncu, vs AI ile aynı kurallar.
  - *Ayrı telefonlar* (varsayılan): biri "Oda kur" der, 5 harflik kodu ya da `?oda=KOD` bağlantısını atar, öbürü katılır.
    Her hamle (çark, seçim, diziliş) Firebase Realtime Database'deki odaya yazılır; iki telefon aynı hamle listesini aynı
    sırayla uygular (`site/baglanti.js`, `oyun.js` içindeki "çevrim içi oda" bölümü). Sayfa yenilenirse liste baştan uygulanır.
    Sonuç iki telefonda da aynı çıkar (odanın tohumu ortak). `site/firebase-ayar.js` boşken yalnız aynı tarayıcının
    sekmeleri arasında çalışır (yerel test). Veritabanı kuralları: `firebase-kurallar.json` (anonim giriş gerekir;
    yalnız odadaki iki kişi hamle yazar, yazılan hamle değişmez).
    Sıra kimdeyse saha onun beşini gösterir: rakibin seçimini izlersin, dokunduğu oyuncu ("X bakıyor") ve konabileceği
    yerler canlı görünür (oyuncular/{i}/bakiyor alanı). Beşler dolunca sonuç iki telefonda da kendiliğinden açılır;
    "Rövanş" aynı odada yeni oyun başlatır (ilk seçen sırayla değişir, oda skoru tutulur), "Odadan çık" odayı bırakır.
  - *Bu cihazda*: aynı telefonda sırayla; sıra kimdeyse saha onun beşini gösterir.
- **AI seviyeleri** (2026-11-19, yeniden):
  - Kolay: yalnız oyuncunun gücüne bakar (güç × mevki uyumu), en iyi 5 aday arasından rastgele; diziliş sabit, atlama yok.
  - Orta: beşin bütününe bakar: adayı beşe koyunca beşin değeri (Klasik: güç + eksenler + uyum + rol eksikliği + kullanım
    bandı; Maç motoru: beklenen sayı farkı; boş yerler gerçek ilk beşlerin ortalama oyuncusu). En iyi 2 arasından seçer,
    iki dizilişi de dener (gerekirse 3 Arka 2 Ön'e geçer), gelen kadro çok kötüyse atlama hakkını kullanır.
  - Zor: Orta gibi ama hep en iyisini alır; gelen kadronun en iyi seçeneği, rastgele 12 kadronun (başka takım ya da aynı
    kulübün başka sezonu) ortalamasından belirgin kötüyse (Klasik 2,5 güç, motor 1,2 sayı) atlar.
  - Ölçüm (Klasik, AI tek başına 150 beş, maç başı olasılık × 30): Kolay ~15,6, Orta ~21,6, Zor ~23,5 galibiyet (eski Zor
    21,9). Zor oyunların ~%90'ında atlama hakkını kullanıyor, ~1/3'ünde diziliş değiştiriyor.
- **Top çalma baremi** (ikili seri: 1'e 1 ve AI'ya karşı): bir beşin maç başı toplam top çalması gerçek ilk beşlerin üst
  çeyreğinde (BSL 5,4) ve rakibin toplam top kaybı da üst çeyrekte (BSL 9,7) ise çalıcılar rakibi cezalandırır:
  baskı = (çalma − barem) + (rakibin kaybı − barem); Klasik'te +1 + 1,5 × baskı güç (en çok 5), Maç motorunda rakibin top
  kaybı oranı +%1 + %1 × baskı (en çok %4). Seri satırında yazılır.
- **Top çalma baremi** (her maçta, gerçek takımlara karşı sezon dahil; 2026-11-19, kullanıcı): kurulan beşin toplam top
  çalması gerçek ilk beşlerin üst çeyreğindeyse (BSL 5,4, TBL 5,2) artı, altındaysa eksi yok. Klasik: +1 + 1,5 × (çalma −
  barem) güç (en çok 4). Maç motoru: rakibin top kaybı oranı +%0,8 + %0,8 × fark (en çok %3); ayrıca kurulan beşin lig
  ortalamasının altındaki top çalması rakibe kolaylık sağlamaz (eksi kırpılır). Taslaklarda beşlerin ~yarısı baremi aşıyor,
  ortalama +1,1 güç ≈ sezonda +0,3 galibiyet.
- **Top kaybı baremi** (her maçta; 2026-11-19, kullanıcı): beşin toplam top kaybı gerçek ilk beşlerin üst çeyreğinin 1
  üstündeyse (BSL 10,7) eksi, altındaysa artı yok. İkili serideki baskı kuralı da bu baremi kullanır. Klasik: −(1 + 1,5 × (kayıp − barem)) güç (en çok −4). Maç motoru: kendi top kaybı
  oranı +%0,8 + %0,8 × fark (en çok %3).
- **Oyun türü** (üstte "Sezon / Lig + play-off"; Serbest, vs AI ve 2 kişide; çevrim içi odada kuranın seçimi):
  Sezon = 30 (TBL 32) maçlık sezon (Klasik: eğriden, motor: gerçek takımlara karşı fikstür), ikili modda 7 maçlık seri.
  Lig + play-off = aşağıdaki tek lig, ardından ilk 8 play-off: çeyrek ve yarı final 5 maç (3 alan), final 7 maç (4 alan),
  üst sıradaki 2-2-1 / 2-2-1-1-1 evinde; eşleşme 1-8 / 4-5 ve 2-7 / 3-6. İkili modda daha ileri giden (eşitse lig galibiyeti
  çok olan) kazanır, 7 maçlık seri oynanmaz.
- **Tek lig** (2026-11-19, kullanıcı): lig modunda sezon gerçek bir lig. Kurulan beş(ler) + rastgele gerçek takımlar (BSL 16,
  TBL 17 takım), çift devreli fikstür (çember yöntemi; tek sayıda takımda her devre biri dinlenir). vs AI ve 2 kişide iki beş
  aynı ligde, birbirleriyle de iki maç yapar; 7 maçlık seri ayrıca oynanır. Klasik'te maç: iki beşin gücü farkından eğri
  (+ maçtan maça oynama), Maç motorunda top top maç; gerçek takımlar kendi aralarında da oynar. Sonuçta lig tablosu
  (G, M, averaj) ve maç maç rakipler. Klasik'te rakiplerin güç dağılımı güçle kurulan beşi ~0,5-0,8 galibiyet geriye
  çekiyordu; kurulan beşe lig maçlarında BSL 2,8, TBL 1,8 güç eklenir (`egri.ligEk`), kolaylık yine ~%6-7.
- İki taraflı modlarda (vs AI, 2 kişi) her oyuncunun oyun başına 1 atlama hakkı var: "Başka takım" ya da "Başka sezon"
  (tek takım-sezon havuzunda yok). Hak yalnız turun ilk seçimini yapacak oyuncunundur: turda biri seçtikten sonra
  ikinci seçen kadroyu değiştiremez (2026-11-18, kullanıcı isteği).
- Günlük mod şimdilik kapalı (kodu duruyor; `oyun.js` MODLAR ve `index.html` düğmesi).
- Beş tamamlanınca sezon simüle edilir: BSL 30 maç (hedef 30-0), TBL 32 maç (hedef 32-0).
- **Günlük**: herkese aynı tohum (Türkiye tarihi + lig) → aynı takım-sezon sırası; sonuç tarayıcıda saklanır, paylaşılabilir metin kopyalanır.
- **Serbest**: sınırsız. Kadroda yalnız en az 6 maç oynamış oyuncular var (`veri/isle.py` EN_AZ_MAC). **Gizli** modda sayı/ribaund/asist/VP ve dakika gizlenir.

## İki simülasyon: Klasik ve Maç motoru

Üstteki seçiciyle (`ayar.sim`, tarayıcıda saklanır; varsayılan Klasik). Çevrim içi odada simülasyonu odayı kuran seçer
(oda ayarında `sim`), katılanın seçimi ona uyar.

- **Klasik** (2026-11-17 sistemi, kullanıcı isteğiyle geri geldi): oyuncu gücü + hücum/savunma eksenleri + uyum kuralları +
  rol eksikliği (beşin toplam asisti ve toplam ribaundu gerçek ilk beşlerin alt %10'unun altındaysa eksik birim başına ceza)
  + top kullanımı → galibiyet eğrisi. Ayrıntısı aşağıda "Güç modeli (Klasik)".
  Top kullanımı bandı (2026-11-18, kullanıcı): eşik (gerçek ilk beşlerin üst çeyreği, BSL 63,7, TBL 64,0) ±%7 cezasız
  (BSL 59,2–68,2, TBL 59,5–68,5); üstünü aşan her birim "Top yetmiyor", altında kalan her birim "Şut yaratan yok" −0,5 güç.
  Eğri bantla yeniden uyduruldu (BSL orta 53,5 ölçek 20,4; TBL 56,5 / 26,4; hata 0,024 → 0,020, 0,030 → 0,026).
  Oyun ~%6-7 kolay: bant tek başına güçle kurulan beşi BSL 20,1 → 21,0, TBL 20,6 → 21,1 yapıyor; eğrinin ortası ayrıca BSL'de
  1,5, TBL'de 3,5 güç kayar (`KLASIK_KOLAY`, `egri.ortaGercek` uydurulan değer): BSL ~21,45 / 30, TBL ~21,9 / 32.
- **Maç motoru**: aşağıda.

## Güç modeli (Klasik)

- Oyuncu gücü = o sezonki VP ortalaması; az maç oynayanlar yedek seviyesine (5) çekilir: `(maç×VP + 8×5) / (maç + 8)`.
  Sezonlar arası VP ölçeği farkı, her sezonun ortalama ilk beş gücüne göre normalleştirilir.
- Buna takımın maç başı sayı averajından dakika payı eklenir: `1,0 × averaj × dk/40` (averaj en az -8; 2026-11-17'ye
  kadar 0,6 idi, geri testle 1,0'a çıkarıldı).
  Yalnız VP ile ilk beş gücü gerçek galibiyet oranını zayıf açıklıyordu (korelasyon 0,20: kötü takımlarda VP şişiyor);
  averaj payıyla 0,84 (BSL) / 0,84 (TBL).
- Mevki dışı yerleşim ×0,88.
- Beşin karakteri (oyun tasarımı tercihi): iki eksen, gerçek ilk beşlerin (en çok süre alan 5) ortancasına göre.
  - Hücum = sayı + 1,5×asist + üçlük − top kaybı; Savunma = 2×(top çalma + blok) + 0,5×ribaund (beşin toplamları).
  - Ortancadan iyiyse artı, kötüyse eksi: `3 × (değer − ortanca) / çeyrekler arası açıklık`, en çok ±6.
    Bir eksende çok iyi olan beş, diğerindeki eksiyi kapatabilir.
  - Rol eksikliği: beşin toplam asisti ya da toplam ribaundu gerçek ilk beşlerin en alt %10'unun altındaysa (BSL 9,0 / 17,1;
    TBL 10,3 / 18,4) eksik her asist −1, her ribaund −0,6 güç ("Top paylaşımı zayıf", "Ribaund alan yok"). Asiste toplamdan
    bakılır: topu birden çok oyuncu paylaşabilir (eski "kimse ≥3 asist yapmıyor −3" kuralı kaldırıldı).
  - Veriyle sınandığında bu eksenler galibiyeti güce ek olarak açıklamadı (katsayılar sıfıra yakın); oyun hissi için var.
    Eklenince ilk beş gücü ~ galibiyet korelasyonu BSL 0,85 → 0,76, TBL 0,84 → 0,79.
- Uyum kuralları (oyun hissi için; toplam ±5): oyun kurucu var +2, pota koruyucu var (biri ≥1,2 blok; 2026-11-19 öncesi 1,3) +2,
  pota boş −2, dış şut bol +2, şutör yok −3, yıldız ikilisi +2, top tek isteyen çok −2, boyalı alan kalabalık −3.
  Gerçek ilk beşlerle sınandığında (güç sabitken) hiçbiri galibiyeti artırmadı; bazıları ters yönde çıktı (ör. iki yıldızlı
  ya da elit oyun kuruculu beşler aynı güçteki öbürlerinden biraz az kazanmış: kötü takımlarda istatistik şişmesi).
  Eklenince ilk beş gücü ~ galibiyet korelasyonu BSL 0,76 → 0,72, TBL 0,79 → 0,76. Hücum/savunma ekseni sınırı ±4'e indi.
- Top kullanımı (Kul = şut denemesi + 0,44×serbest atış denemesi + top kaybı, maç başı): beşin toplamı gerçek ilk beşlerin
  üst çeyreğinin (BSL 63,7, TBL 64,0) ±%7 bandı dışındaysa her birim −0,5 güç ("Top yetmiyor" / "Şut yaratan yok"). Veriyle desteklenen tek takım kuralı:
  güç sabitken ilk beş kullanımı arttıkça galibiyet düşüyor (BSL −0,0052, TBL −0,0043 galibiyet oranı / birim; güç katsayısı 0,0095).
- Şut isabeti (TS%) her sezon için hesaplanır ve oyuncu satırının ipucunda görünür; güce eklenmedi (geri testte tahmini
  iyileştirmedi, VP kaçan şutları zaten düşüyor).
- Tablolarda sayı, ribaund, asist, top çalma, blok, top kaybı ve VP gösterilir; top kaybı simülasyona yalnız VP içinden girer.
- Takım gücü → maç başı galibiyet olasılığı: gerçek takımların ilk beşleri (en çok süre alan 5) ile gerçek normal sezon
  galibiyet oranı arasına uydurulan lojistik eğri (`veri/isle.py`, sonuç `egri` alanında).

## Maç motoru (`site/motor.js`, 2026-11-18)

Sezon, gerçek takımlara karşı sahiplik sahiplik oynanan maçlarla simüle edilir.

- **Oyuncular**: o sezonki maç başı kutu istatistikleri (TBF): iki/üç sayılık deneme ve isabet, serbest atış, hücum ve
  savunma ribaundu, asist, top çalma, blok, top kaybı, faul; gerçek dakikasıyla oynar. Dönem farkı giderilir (her istatistik
  sezonun lig ortalamasına bölünüp bütün sezonların ortalamasıyla çarpılır), isabet yüzdeleri az denemede lig ortalamasına
  çekilir, az maç oynayanın bütün istatistiği `maç/(maç+8)` ağırlıkla lig ortalamasına çekilir. BSL 2008-09'da TBF hücum
  ribaundunu tutmamış: toplam ribaund lig oranıyla bölünür. Veri: `veri/isle.py` → oyuncu başına `m` (sıra `motor.sira`) ve `nt`.
- **Takım** = beş + kalan dakikada (200 − beşin dakikası) lig ortalaması yedekler. Mevki dışı (×0,92 / ×0,8; TBL Arka/Ön
  ×0,88): ribaund, asist, top çalma, blok yarı oranda azalır, top kaybı artar, isabet `(1−uyum)×15` puan düşer.
- **Hücum**: top kaybı (rakibin top çalması lig ortalamasından fazlaysa artar) → serbest atış (rakibin faulü artırır) →
  iki ya da üç sayılık şut. İki sayılık isabeti rakibin bloğu düşürür; takımın asist oranı (isabetlerin asistli payı) lig
  ortalamasından 0,1 fazlaysa isabet +1,2 puan. Kaçan şutta hücum ribaundu iki takımın ribaundu karşılaştırılarak (log5)
  belirlenir; alınırsa hücum sürer.
- **Şut yaratma**: takımın doğal top kullanımı (şut + 0,44×serbest atış + top kaybı) lig ortalamasının altındaysa eksik
  her %10 için isabet −6 puan (zorlama şutlar); üstündeyse şutlar paylaşılır, şut yaratan oyuncular zor şutları da soktuğu
  için her %10 için +2 puan (en çok %50 fazlaya kadar).
- **Takım katkısı**: oyuncunun takımının sayı averajından dakika payı (`averaj × dk/40 × maç/(maç+8)`, beş için toplam/5),
  ×1,5 sayı olarak eklenir: kutuya yansımayan savunma ve uyum. Gerçek takımlarda önceki sezonun en güçlü tek göstergesi.
- **Roller ve sinerji** (Basketball GM'nin beceri etiketlerinden esinle): her oyuncuya 40 dakikaya vurulmuş istatistiğinden
  altı rol puanı (0-1): şutör (isabetli üçlük), oyun kurucu (asist − 0,3 × top kaybı), içeri skorer (ikilik + serbest atış),
  pota koruyucu (blok + savunma ribaundu), top çalan, ribaundçu. Düzenli oyuncuların (15+ dk) üst çeyreği 0,5, üst %10'u
  ~0,9 (`veri/isle.py` rol_hesapla; oyuncu başına `r`). Beşteki rol sayıları azalan getiriyle (her rolün ilk oyuncusu çok,
  sonrakiler daha az; şutörde iki) hücum, savunma ve ribaund sinerjisi verir; gerçek ilk beşlerin ortalamasından sapma
  isabeti (hücum: kendi, savunma: rakibin) ve hücum ribaundu payını kaydırır. Bütün takımlara (rakiplere de) uygulanır.
- **Maç**: lig ortalaması ~74 hücum (±4), beraberlikte uzatma; iç sahada +3 sayı. Lig ortalaması takımlar kendi aralarında
  BSL 78,2 sayı, 16,8 asist, 33,4 ribaund, 12,3 top kaybı üretir (gerçek lig ortalaması 79,2 / 16,8 / 31,5 / 12,2).
- **Sınama**: önceki sezon verisiyle kurulan gerçek ilk beşin bu sezonki galibiyet oranıyla korelasyonu BSL ~0,70, TBL ~0,45
  (eski güç modeli 0,75 / 0,57; sinerjisiz ve şut yaratma artısız motor 0,76 / 0,46). Rol sinerjisi tahmini biraz düşürüyor:
  gerçek takımlarda rol kuralları galibiyeti ayrıca açıklamıyor (eski uyum kurallarında da öyleydi); oyun hissi için var.
  Motorun farkları lig başına gerçek galibiyet oranlarına sıralama eşleştirmesiyle oturtulur (`motor.diklik`: BSL 1,03, TBL 0,94).
- **Oyun ayarı** (yalnız kurulan beşler; `motor.oyunDiklik` 1,15, `oyunDakika` 34, `oyunSinerji` 2): farklar ×1,15,
  beşin oyuncuları en az 34 dakika oynar (gerçek dakikasından en çok %35 fazla), rol sinerjisi ×2. Taslak ölçümü (her tur
  rastgele takım-sezon, ortalama galibiyet): BSL'de VP'ye göre kuran 20,7 / 30, skora göre 17,4, rolleri tamamlayarak 21,8;
  en iyi %10'un 30-0 şansı VP'de ~%6, rolleri tamamlayanda ~%10. TBL (32 maç): 21,8 / 17,8 / 22,8, 32-0 ~%2 / ~%4.
  Sinerji beşlerin %80'inde −3…+14 sayı/maç. (Aynı gün denenip bırakılanlar: kullanım fazlasına −0,55 artı, üst uç açılması,
  dört alanlı denge ödülü; yerlerini rol sinerjisi aldı.)
- **Rakipler**: ligin bütün gerçek takımları (en çok süre alan beşi + lig ortalaması yedek). Sezonda N/2 farklı takım,
  her biriyle bir iç saha bir deplasman. İkili modda iki beş 2-2-1-1-1 düzeninde 7 maçlık seri oynar.
- **Ekran**: kadro listesinde oyuncunun güçlü rolleri (en çok 3), sahanın altında beşin rol durumu (ör. "Şutör 0,9/2",
  "Pota koruyucu ✓"). Sonuçta ortalama rakibe beklenen fark ve bu fikstürde beklenen galibiyet, oyuncu katkısı (yerine aynı
  dakikada lig ortalaması bir oyuncu konsa fark ne kadar düşerdi), roller ve sinerjinin sayı katkısı (hücum / savunma /
  ribaund); kapalı bölümlerde sezonun simüle kutu istatistikleri, maç maç rakipler ve bütün etkenlerin dökümü.
- AI seçimini motorla yapar: her aday için o yere konunca beşin beklenen farkı (boş yerler lig ortalaması).
- Eski güç değeri (`g`: büzülmüş VP + averaj payı) veride duruyor; geri test (`veri/test_sonucu.json`) onu ölçer.

## Mevki

- Mevki TBF'de yok. Önce Wikidata'daki mevkiler (point guard 1, shooting guard 2, small forward 3, power forward 4,
  center 5; guard 1-2, forward 3-4). Yoksa doğrusal tahmin (Wikidata'lı 4.358 oyuncu-sezona uyduruldu):
  boy varsa `-18,27 + 0,1048×boy − 0,234×log2(asist/(rib+0,5)) + 0,328×blok − 0,082×üçlük`, yoksa
  `1,246 − 0,462×log2(oran) + 0,437×blok − 0,164×üçlük + 0,2125×(rib/dk×30)`. En yakın mevki; boyluda kesir 0,25'ten
  büyükse, boysuzda her zaman komşu mevki de eklenir. İsabet (tahmin kümesi gerçek mevkilerden birini içeriyor):
  boylu %85 (ortalama 1,46 mevki), boysuz %84 (1,98 mevki). Rozetin üstüne gelince mevkinin kaynağı görünür.
  Tahmin oyuncu başına bir kez yapılır: iki ligdeki bütün sezonlarının (dakika × maç ağırlıklı) ortalamasından; böylece
  aynı oyuncu sezona göre farklı mevkide görünmez.
- Elle düzeltme: `veri/mevki_duzeltme.json` (anahtar TBF oyuncu numarası, `p` mevkiler, isteğe bağlı `boy`). Her kaynağın
  önüne geçer; sonra `CEVRIMDISI=1 python veri/isle.py`. İlk kayıt: Hakan Yapar 4-5.

## Geri test

`veri/isle.py` her çalışmada modeli dürüst biçimde sınar ve `veri/test_sonucu.json`'a yazar: takımın gerçek galibiyet oranı,
ilk beşinin (en çok süre alan 5) ÖNCEKİ sezondaki güçlerinden tahmin edilir (oyun da oyuncuları başka takımlarla birleştirir).

| BETA (averaj payı) | BSL herkes | BSL takım değiştiren | TBL herkes | TBL takım değiştiren |
|---|---|---|---|---|
| 0,6 (eski) | 0,655 | 0,560 | 0,532 | 0,457 |
| **1,0 (şimdi)** | **0,716** | **0,601** | **0,559** | **0,493** |
| 1,5 | 0,741 | 0,608 | 0,573 | 0,517 |

Karşılaştırma: ham VP ile BSL 0,34. Aynı sezon içinde ölçülen 0,85-0,88 abartılıdır (takım averajı sonucu zaten içerir).
`tam` satırı (kurallar dahil tam takım gücü) yalnız beşin beşi de önceki sezonda bulunan takımlarla, örneklem küçük (22 / 13).

## Veri

Kaynak: TBF resmi API (`https://www.tbf.org.tr/api`).

| Lig | Sezonlar | Not |
|---|---|---|
| BSL | 2001-02 … 2025-26: 23 sezon, 358 takım-sezon, 5.047 oyuncu-sezon | 2004-05 ve 2006-07'de TBF yalnız sayı tutmuş (dakika/ribaund/asist yok) → oyunda yok. 2007-08'de bir takımın istatistiği TBF'den alınamadı. TBF lig listesi 1966-67'ye kadar iniyor; 2000-01 ve öncesi denenmedi |
| TBL | 2015-16 … 2025-26: 11 sezon, 188 takım-sezon, 2.691 oyuncu-sezon | TBF'de TBL sayfası 2015-16'dan başlıyor |

Mevki ve boy için Wikidata (CC0): `python veri/wikidata.py` → `veri/wikidata/oyuncular.json` (25.512 basketbolcu:
Türkiye kulübünde oynamış olanlar + 1960 sonrası doğumlu, boyu ya da mevkisi bilinenler). Wikidata'nın kendi sorgu
hizmeti arızadayken aynı veriyi sunan QLever (Freiburg Üniversitesi) kullanıldı. TBF oyuncusu ile aynı doğum tarihli ve adı
benzeyen Wikidata kaydı eşlenir: 2.614 tekil oyuncunun 1.450'si bulundu (1.342 mevkili, 1.382 boylu).

| | Mevki kaynağı: Wikidata | boy + istatistik | yalnız istatistik |
|---|---|---|---|
| BSL (5.047 oyuncu-sezon) | 3.528 | 478 | 1.041 |
| TBL (2.691 oyuncu-sezon) | 830 | 339 | 1.522 |

Proballers.com kullanılmadı: robots.txt dosyası Claude dahil yapay zekâ ajanlarını tüm siteden yasaklıyor. Uyruk profilden gelir
(TÜRKİYE = Türk oyuncu).

Kullanılan uçlar:
- `/League/get-standings-table?LeagueId=&SeasonId=&prefix=` → gerçek derece
- `/Team/get-teams-by-leauge?leaugeId=` → takımlar (teamProcessId)
- `/Team/get-team-detail-statistic?TeamProcessId=&SeasonId=&LeagueId=&prefix=` → oyuncu sezon ortalamaları (normal sezon + play-off)
- `/Player/get-player-detail-profile-and-career-info/{oyuncuId}` → uyruk, boy
- Lig/sezon numaraları: `veri/bsl_ligler.json`, `veri/tbl_ligler.json` (tbf.org.tr lig sayfasının Nuxt verisinden)

Yeniden üretmek:

```
python veri/cek.py     # önbellekli çekim (veri/ham), ~4000 istek, 0,3 sn arayla; önbellekte olanı atlar
python veri/isle.py    # site/veri/bsl.js ve tbl.js
```

`veri/ham/` 2026-11-17'de çekilmiş ham TBF yanıtlarını tutar (44 MB, 3.746 dosya). Ağa çıkmadan yeniden üretmek için
`CEVRIMDISI=1 python veri/isle.py`.
