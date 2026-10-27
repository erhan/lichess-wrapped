# Lichess Profil

Lichess kullanıcı adını alıp oyuncunun tüm oyunlarından tek sayfalık bir kariyer istatistiği sayfası üretir: sonuçlar, tempolar, yıllar, açılışlar, hamle profili, oyun bitişleri, rekorlar, rakipler. Sayfalar kaydedilir ve paylaşılabilir.

Yayın adresi: **https://lichess.erhan.dev**

| Yol | Ne yapar |
| --- | --- |
| `/` | Arama kutusu ve son hazırlanan profiller |
| `/@/:kullanici` | Profil sayfası; ilk ziyarette içe aktarmayı başlatır ve ilerleme gösterir |
| `/og/:kullanici.png` | Link önizlemesi için 1200×630 paylaşım kartı |
| `/api/status/:kullanici` | İçe aktarma durumu (`importing`, `ready`, `missing`, `closed`, `error`) |
| `POST /api/refresh/:kullanici` | Son güncellemeden sonraki oyunları çeker (saatte en fazla bir kez) |
| `/api/stats/:kullanici.json` | Hesaplanmış istatistikler |

## Nasıl çalışır

- Cloudflare Worker + Durable Object (SQLite). R2 ve D1 kullanılmaz.
- Her Lichess hesabı için bir `Profile` nesnesi vardır. Oyunlar Lichess'ten eskiden yeniye (`sort=dateAsc`, `since=<imleç>`) akış olarak alınır, 500'lük JSON parçaları halinde saklanır. Her alarm çalışmasında en fazla 2.000 oyun alınır, kalan için yeni alarm kurulur; kesilen içe aktarma kaldığı yerden devam eder.
- Güncellemede yalnızca imleçten sonraki oyunlar çekilir. 24 saatten eski bir profil ziyaret edildiğinde arka planda kendiliğinden güncellenir; sayfadaki **Güncelle** düğmesi saatte bir kullanılabilir.
- İstatistikler içe aktarma bitince bir kez hesaplanıp saklanır; sayfa her istekte bu özetten üretilir. Paylaşım kartı da istatistik sürümü başına bir kez üretilip saklanır.
- `Registry` nesnesi ana sayfadaki profil listesini tutar.
- Lichess, `User-Agent` başlığı olmayan isteklere 404 döner; 429 alınca bir dakika beklenir.
- Isı haritası UTC olarak saklanır, tarayıcıda ziyaretçinin saat dilimine çevrilir.

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
