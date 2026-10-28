# Lichess Profil

Lichess kullanıcı adını alıp oyuncunun tüm oyunlarından tek sayfalık bir kariyer istatistiği sayfası üretir: sonuçlar, tempolar, yıllar, açılışlar, hamle profili, oyun bitişleri, rekorlar, rakipler. Sayfalar kaydedilir ve paylaşılabilir.

Yayın adresi: **https://lichess.erhan.dev**

| Yol | Ne yapar |
| --- | --- |
| `/` | Arama kutusu ve son hazırlanan profiller |
| `/@/:kullanici` | Profil sayfası; ilk ziyarette içe aktarmayı başlatır ve ilerleme gösterir |
| `/og/:kullanici.png` | Link önizlemesi için 1200×630 paylaşım kartı |
| `/api/status/:kullanici` | İçe aktarma durumu (`importing`, `ready`, `missing`, `closed`) |
| `POST /api/ingest/:kullanici` | Tarayıcının Lichess'ten indirdiği oyunları sırayla kaydeder |
| `POST /api/refresh/:kullanici` | Son güncellemeden sonraki oyunlar için içe aktarma açar (saatte en fazla bir kez) |
| `/api/stats/:kullanici.json` | Hesaplanmış istatistikler |

## Nasıl çalışır

- Cloudflare Worker + Durable Object (SQLite). R2 ve D1 kullanılmaz.
- **Oyunları ziyaretçinin tarayıcısı indirir.** Lichess, bütün Cloudflare Workers'ın paylaştığı çıkış IP'sine (`2a06:98c0:3600::103`) API tokenıyla bile 429 döner. Bu yüzden `public/app.js`, Lichess API'sinden (CORS açık) önce hesabı, sonra oyunları eskiden yeniye (`sort=dateAsc`, `since=<imleç>`) akış olarak alır ve 300'lük ham paketler halinde `/api/ingest`'e gönderir.
- Her Lichess hesabı için bir `Profile` nesnesi vardır. Her paket o anki imleçle (`since`) gönderilir; imleç tutmazsa 409 döner, böylece iki sekme veriyi karıştıramaz. Sunucu oyunu kendi biçimine (`src/game.ts`) çevirir ve JSON parçaları halinde saklar.
- Sunucu doğrulaması: hesap adı eşleşmeli, her oyunda o kullanıcı oynamış olmalı, oyun kimliği 8 karakter olmalı, tarihler artan sırada olmalı ve gelecekte olmamalı. Kayıtlı oyunlar silinip değiştirilemez; güncelleme yalnızca imleçten sonrasını ekler. Sunucu Lichess'e ulaşamadığı için verinin gerçekten Lichess'ten geldiğini kanıtlayamaz; ilk içe aktarmayı yapan istemci sahte veri gönderebilir.
- İndirme sayfa açıkken sürer; sayfa kapanırsa sonraki ziyaretçi kaldığı yerden devam ettirir. 24 saatten eski bir profil açıldığında tarayıcı arka planda yeni oyunları ekler; **Güncelle** düğmesi saatte bir kullanılabilir.
- İstatistikler içe aktarma bitince bir kez hesaplanıp saklanır; sayfa her istekte bu özetten üretilir. Paylaşım kartı (`workers-og`) istatistik sürümü başına bir kez üretilip saklanır.
- `Registry` nesnesi ana sayfadaki profil listesini ve her profilin kısa özetini (`src/community.ts`) tutar; ana sayfadaki topluluk istatistikleri ve sıralamalar bu özetlerden hesaplanır.
- Isı haritası UTC olarak saklanır, tarayıcıda ziyaretçinin saat dilimine çevrilir.
- **Dil:** Türkçe ve İngilizce (`src/i18n.ts`). Sıra: `?lang=tr|en` (çereze yazılır), `lang` çerezi, tarayıcının ilk dili. Paylaşım kartı da `?lang=` ile iki dilde üretilir.
- **Tema:** koyu ve açık; seçim yoksa sistem ayarına uyar, seçim `localStorage`'da tutulur (`public/style.css` başındaki değişkenler).
- **Bulmacalar:** yükleme ekranında Lichess bulmaca veritabanından (CC0) seçilmiş 1.000 bulmaca (`public/puzzles.json`, puan 503–2799, 23 bantta eşit dağılım) tahtada çözülebilir. Liste `scripts/pick-puzzles.py` ile yeniden üretilir. Taşlar: cburnett seti (Colin M.L. Burnett, GPL/BSD/GFDL), `public/pieces`.

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:8787
npm test
npm run typecheck
npm run deploy
```

Gerçek bir dışa aktarımla doğrulamak için (`/api/games/user/<ad>` NDJSON çıktısı):

```bash
LICHESS_NDJSON=games.ndjson LICHESS_ID=yasinemrah npm test
```
