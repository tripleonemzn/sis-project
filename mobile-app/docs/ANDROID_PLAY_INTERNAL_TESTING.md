# Android Play Internal Testing

## Tujuan
- Distribusi Android lintas merk tanpa meminta user mengaktifkan `Install unknown apps`.
- Jalur uji yang paling aman untuk Samsung, Xiaomi, Oppo, Vivo, Realme, dan merk Android lain.

## Kenapa Bukan APK Langsung
- APK sideload tetap bergantung pada kebijakan tiap vendor Android.
- Beberapa perangkat Xiaomi lebih permisif.
- Samsung umumnya lebih ketat untuk instalasi aplikasi dari luar Play Store.
- Jika targetnya user tidak perlu ubah setting HP, distribusi harus lewat Google Play.

## Profile Build
- EAS profile: `play-internal`
- Output: `app-bundle`
- OTA channel: `pilot-live`

## Build
```bash
npm run build:android:play:internal
```

## Distribusi
1. Upload hasil `.aab` ke Google Play Console.
2. Gunakan track `Internal testing`.
3. Tambahkan tester internal.
4. Bagikan link opt-in Google Play ke user.
5. User install dari Play Store, bukan dari file APK.

## Hasil Yang Diharapkan
- Install tidak lagi meminta aktivasi sumber tidak dikenal.
- Kompatibilitas distribusi lebih konsisten lintas merk HP Android.
- Update binary berikutnya bisa diterima lewat Google Play.

## Catatan
- OTA Expo tetap bisa dipakai untuk perubahan JS/UI/logic selama runtime cocok.
- Jika ada perubahan native dependency, tetap perlu build `.aab` baru.
- Agar notifikasi update Android bisa muncul saat app tertutup, build native juga harus menyertakan `google-services.json` melalui `expo.android.googleServicesFile`.
- Sebelum rilis Android baru, verifikasi dengan `npm run check:push:android`.
