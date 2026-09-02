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

## Kontroller

Masaüstünde fareyle yön verilir, sol tık veya boşluk tuşu hızlandırır.

Dokunmatik cihazlarda ekran ikiye bölünür: bir yarı yön veren joystick, diğer
yarı hızlanma alanıdır. İkisi de görünmezdir ve parmağın ekrana değdiği noktada
belirir; joystick uzun sürüklemelerde parmağı takip eder.

## Ayarlar

Ana menüdeki **Ayarlar** bölümü üç başlıkta toplanır ve tercihler
`localStorage` içinde saklanır:

- **Kontroller** — yön veren yarı (sol/sağ), kontrollerin sürekli görünmesi,
  titreşim
- **Ekran** — tam ekran denemesi, sıralama tablosu boyutu (kapalı/küçük/orta/
  büyük), zengin grafikler
- **Oyun** — yılan hızı (yavaş/normal/hızlı), rakip zorluğu

## Tam ekran ve yatay mod

Oyun geniş ekran için tasarlandı. Telefon dikey tutulduğunda çevirme uyarısı
çıkar. Oyuna başlarken önce tam ekran, ardından yatay kilit istenir; kilit
yalnızca tam ekran belgeye verildiği için sıra bu şekildedir. Tarayıcı tam
ekrandan kendi kendine çıkarsa (kaydırma, döndürme) HUD'da bir **Tam ekran**
düğmesi belirir, çünkü yeniden girmek için yeni bir kullanıcı hareketi gerekir.

iPhone Safari öğe bazlı tam ekranı hiç desteklemez; orada ayarlar ekranı
Paylaş → Ana Ekrana Ekle yönlendirmesini gösterir. Capacitor derlemelerinde
kalıcı kilit için `AndroidManifest.xml` içindeki etkinliğe
`android:screenOrientation="sensorLandscape"`, iOS tarafında ise `Info.plist`
içine yalnızca yatay yönler eklenmelidir.

## Bot davranışı

Botlar her kararda önlerindeki yön yelpazesini puanlar: yoldaki yem, rakip
gövdeleri, arena sınırı ve dönüşün maliyeti birlikte değerlendirilir. Her botun
kendi kişiliği (açgözlülük, temkinlilik, saldırganlık, beceri, hızlanma sevgisi)
ve tepki gecikmesi vardır; bu yüzden kararları anlık değil, kısa süre boyunca
sabittir. Küçük bir sapma, ara sıra dalan dikkat ve ikinci en iyi çizgiyi seçme
hareketi insansı kılar. Bir av veya taze bir yığın peşindeyken temkinin bir
kısmını bırakırlar; ölümlerin çoğu buradan gelir. Ölen yılanın bıraktığı yığın
botları çeker, ama kalabalıklaşan yığından temkinli botlar uzak durur.

Çarpışma refleksi kare başına değil sabit aralıkla (50 ms) çalışır; böylece
botlar 120 Hz telefonda da, zorlanan bir cihazda da aynı ölçüde dikkatlidir.

## Dosya düzeni

```text
src/
├── game/
│   ├── ArenaScene.js   # oyun döngüsü, çarpışma, yem ızgarası ve çizim
│   ├── BotBrain.js     # bot kişilikleri, risk iştahı ve karar verme
│   ├── config.js       # oyun ayarları, renkler ve bot adları
│   ├── createGame.js   # Phaser kurulumu
│   └── math.js         # küçük matematik yardımcıları
├── styles/
│   └── main.css        # menü, HUD ve mobil arayüz
├── ui/
│   ├── AppController.js # menü ve oyun ekranları
│   ├── SettingsPanel.js # ayarlar ekranı
│   ├── TouchControls.js # görünmez joystick ve hızlanma alanı
│   ├── orientation.js   # tam ekran ve yatay ekran kilidi
│   └── settingsStore.js # tercihlerin saklanması
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
