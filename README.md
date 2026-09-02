# Işıkyılan

Mobil öncelikli, tek oyunculu bir arena oyunudur. Web sürümü Vite ve Phaser ile
çalışır; aynı kod tabanı Capacitor üzerinden Android ve iOS uygulamasına
dönüştürülebilir.

## Başlangıç

```bash
npm install
npm run dev
```

Üretim çıktısı:

```bash
npm run build
```

## Dosya düzeni

```text
src/
├── game/
│   ├── ArenaScene.js   # oyun döngüsü, botlar, çarpışma ve çizim
│   ├── config.js       # oyun ayarları, renkler ve bot adları
│   ├── createGame.js   # Phaser kurulumu
│   └── math.js         # küçük matematik yardımcıları
├── styles/
│   └── main.css        # menü, HUD ve mobil arayüz
├── ui/
│   └── AppController.js # menü ve oyun ekranları
└── main.js             # uygulama başlangıcı
```

## Android ve iOS

İlk kez yerel proje klasörlerini oluştur:

```bash
npm run mobile:add:android
npm run mobile:add:ios
```

Web kodunu derleyip yerel projelerle eşitle:

```bash
npm run mobile:sync
```

Ardından Android Studio veya Xcode projesini aç:

```bash
npm run mobile:open:android
npm run mobile:open:ios
```

iOS derlemesi için macOS ve Xcode gerekir. `android/` ve `ios/` klasörleri,
uygulama mağazası hazırlıklarına başlanana kadar repoya eklenmek zorunda değildir.
