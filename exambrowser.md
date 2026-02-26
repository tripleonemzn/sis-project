# SIS Exam Platform Blueprint

Dokumen ini mendeskripsikan rancangan umum **SIS Exam Platform** dan langkah kerja saat mulai membangun project exam browser (Android/iOS/Desktop) dari nol.

Tujuan utama:

- SIS (backend + web) menjadi **server ujian tunggal** (soal, jadwal, nilai, log).
- Berbagai **exam browser** (Android, iOS, Desktop) bertindak sebagai **shell ujian** yang mengunci perangkat sebisa mungkin dan membuka URL ujian SIS.

---

## 1. Konsep Umum Arsitektur

### 1.1 Peran SIS

SIS (backend + web):

- Menyimpan & mengelola:
  - bank soal,
  - jadwal & konfigurasi ujian,
  - nilai & hasil,
  - log aktivitas ujian.
- Menyediakan:
  - URL ujian berbasis token,
  - API untuk:
    - membuat sesi ujian,
    - mencatat jawaban,
    - mencatat heartbeat & event (focus lost, screen capture, dll).

### 1.2 Peran Exam Browser

Exam browser (berbagai platform) hanya:

- Mengunci perangkat sebisa mungkin sesuai kemampuan OS.
- Membuka **URL ujian SIS** di dalam WebView / browser terkunci:
  - contoh: `https://sis.sekolah.id/exam/live/:sessionToken`
- Mengirim event ke backend SIS (opsional tapi direkomendasikan):
  - `FOCUS_LOST`, `FOCUS_GAINED`, `SCREEN_CAPTURE`, `CLIENT_ERROR`, dll.

Target shell:

1. **Android Exam Browser** – Native Kotlin/Java, keamanan tinggi.
2. **iOS Exam App** – React Native (+ bridge native), BYOD dengan proteksi medium.
3. **Desktop** – Safe Exam Browser (SEB) atau sejenis, dikonfigurasi ke domain SIS.

---

## 2. Protokol Ujian di Backend SIS

### 2.1 Entitas Data

#### Exam

Representasi ujian dasar:

- `id`
- `name`
- `slug` (opsional)
- `start_at`, `end_at`
- `duration_minutes`
- `security_level`: `LOW | MEDIUM | HIGH`  
  (mengontrol boleh tidaknya platform BYOD tertentu)
- `metadata` (opsional: tipe ujian, kelas, dsb.)

#### ExamSession

Satu sesi ujian per siswa:

- `id`
- `exam_id`
- `user_id` (siswa)
- `session_token` (string acak, cukup panjang, sekali pakai)
- `client_type`:
  - `android_exam_browser`
  - `ios_exam_app`
  - `web`
  - `seb_desktop`
- `device_info` (user-agent, model, dll, opsional)
- `status`: `PENDING | ACTIVE | FINISHED | CANCELED | LOCKED`
- `started_at`
- `finished_at`
- `created_at`, `updated_at`

#### ExamEvent (opsional tapi disarankan)

Log kejadian per sesi:

- `id`
- `exam_session_id`
- `type`:
  - `HEARTBEAT`
  - `FOCUS_LOST`
  - `FOCUS_GAINED`
  - `SCREEN_CAPTURE`
  - `SCREEN_RECORDING`
  - `CLIENT_WARNING`
  - `CLIENT_ERROR`
  - dll.
- `payload` (JSON, detail tambahan)
- `created_at`

### 2.2 URL Ujian Standar

Semua exam browser akan membuka URL ujian dengan format:

```text
https://sis.sekolah.id/exam/live/:sessionToken
```

Atau variasi:

```text
https://sis.sekolah.id/exam/:examSlug/live/:sessionToken
```

Aturan:

- `sessionToken` dihasilkan backend setelah:
  - siswa memilih ujian, dan
  - backend memvalidasi bahwa ujian sedang/sudah boleh diikuti.
- Halaman `live`:
  - memvalidasi token,
  - menolak akses jika token invalid/expired,
  - menolak jika sesi sudah `FINISHED` atau `LOCKED`,
  - me-render UI ujian (soal, navigasi, timer).

### 2.3 Endpoint API Minimal

Nama endpoint bisa disesuaikan dengan style backend sekarang; ini hanya blueprint.

#### 1. Membuat Session Ujian

```http
POST /api/exams/:examId/sessions
```

Input:

- Auth: siswa sudah login.
- Body (opsional):
  - `client_type` (`android_exam_browser | ios_exam_app | web | seb_desktop`)
  - `device_info` (user-agent, platform, dll.)

Output:

```json
{
  "examSessionId": 123,
  "sessionToken": "random-long-token",
  "exam": { "id": 45, "name": "UTS Matematika", ... },
  "expireAt": "2026-03-10T09:00:00Z"
}
```

#### 2. Validasi Token + Load Data Ujian

```http
GET /api/exam-sessions/:sessionToken
```

Output:

- info exam,
- info siswa (sanitasi),
- status session dan waktu tersisa,
- konfigurasi UI ujian.

#### 3. Heartbeat

```http
POST /api/exam-sessions/:id/heartbeat
```

Body contoh:

```json
{
  "timestamp": "2026-03-10T08:15:00Z",
  "questionIndex": 5,
  "client_state": {
    "battery": 0.7,
    "online": true
  }
}
```

#### 4. Submit / Update Jawaban

Bisa disesuaikan modul ujian yang ada, contoh:

```http
POST /api/exam-sessions/:id/answers
```

Body:

```json
{
  "answers": [
    { "questionId": 1, "choiceId": 3 },
    { "questionId": 2, "text": "Jawaban uraian..." }
  ]
}
```

#### 5. Selesaikan Ujian

```http
POST /api/exam-sessions/:id/finish
```

Efek:

- menandai sesi sebagai `FINISHED`,
- memicu penilaian/rekap.

#### 6. Event Logging

```http
POST /api/exam-sessions/:id/events
```

Body:

```json
{
  "type": "FOCUS_LOST",
  "meta": {
    "reason": "app_background",
    "platform": "android",
    "timestamp": "2026-03-10T08:20:00Z"
  }
}
```

Backend bisa mengolah ini untuk laporan/pengawasan.

---

## 3. Android Exam Browser (Native)

### 3.1 Tujuan

Aplikasi Android terpisah (mis. `id.sis.exambrowser`) yang:

- Mengunci perangkat selama ujian sejauh yang diizinkan Android.
- Membuka URL ujian SIS (`/exam/live/:sessionToken`) di WebView.
- Mengirim event ke backend.

### 3.2 Fitur Minimum

- **Halaman awal**:
  - Menampilkan:
    - input `sessionToken`, atau
    - scanner QR (opsional).
  - Tombol “Mulai Ujian”.
- **Halaman ujian (WebView)**:
  - Membuka `https://sis.sekolah.id/exam/live/:sessionToken`.
  - Menggunakan:
    - `FLAG_SECURE` → blok screenshot & sebagian screen recording.
    - Immersive fullscreen → sembunyikan status bar & navigation bar.
  - Menangani tombol back:
    - tidak langsung keluar aplikasi,
    - bisa kirim event ke halaman web atau diabaikan.

### 3.3 Fitur Keamanan Lanjutan

- **Lock Task Mode (Kiosk)**:
  - Jika device diset sebagai **Device Owner**, app bisa:

    ```kotlin
    startLockTask()
    ```

  - Home/Recent tidak bisa keluar dari app.
- **PIN Admin untuk keluar**:
  - Kombinasi tertentu (mis. back 3x) → dialog PIN.
  - Jika benar:
    - `stopLockTask()`,
    - kembali ke halaman awal.
- **Whitelist domain**:
  - WebView hanya mengizinkan domain SIS.
- **Logging ke backend**:
  - `onPause` / `onStop` / error WebView → `POST /events`.

---

## 4. iOS Exam App (BYOD)

### 4.1 Tujuan

Aplikasi iOS terpisah (mis. `id.sis.examexperience`) yang:

- Membuka ujian SIS di WebView.
- Menerapkan proteksi yang diizinkan Apple untuk BYOD.
- Mengirim event ke backend.

### 4.2 Stack

- React Native (TS/JS) untuk UI.
- Native Swift untuk:
  - deteksi `UIScreen.main.isCaptured` (screen recording),
  - hook lifecycle (background/foreground).

### 4.3 Fitur Minimum

- Halaman awal:
  - Input token atau scan QR.
- Halaman WebView ujian:
  - Buka `https://sis.sekolah.id/exam/live/:sessionToken`.
  - Tidak ada navigasi ke modul lain.

### 4.4 Proteksi & Logging

- **Deteksi screen recording / capture**:
  - Native Swift memantau `UIScreen.main.isCaptured`.
  - Jika `true`:
    - JS diberi event → bisa tampilkan peringatan / blur konten.
    - Kirim event `SCREEN_RECORDING` ke backend.
- **Lifecycle focus**:
  - `sceneWillResignActive` / `sceneDidEnterBackground` → kirim event `FOCUS_LOST`.
  - `sceneDidBecomeActive` → kirim event `FOCUS_GAINED`.
- **Keterbatasan BYOD iOS**:
  - Tidak bisa:
    - memblokir tombol Home sepenuhnya,
    - mencegah user buka app lain.
  - Kebijakan ujian harus menempatkan iOS sebagai:
    - allowed untuk ujian level rendah/menengah,
    - atau diminta pindah ke device lain untuk high-stakes.

---

## 5. Desktop (Lab & Laptop Pribadi) via Safe Exam Browser

### 5.1 Tujuan

Mendukung ujian dari:

- Lab komputer milik sekolah.
- Laptop pribadi siswa.

### 5.2 Integrasi SEB

- Gunakan **Safe Exam Browser (SEB)**:
  - SEB membuka start URL:  
    `https://sis.sekolah.id/exam/live/:sessionToken`  
    atau halaman `https://sis.sekolah.id/exam/token` (masukkan token manual).
  - Konfigurasi:
    - domain whitelist → domain SIS.
    - disable fungsi lain (clipboard, print, dsb.) sesuai kebutuhan.
- Tugas SIS:
  - Menyediakan halaman ujian yang full-screen friendly.
  - Menjaga URL & endpoint ujian stabil.

---

## 6. Alur Kerja Saat Mulai Membangun dari 0

### 6.1 Di Backend SIS

1. Tambahkan/mapping model:
   - `Exam`, `ExamSession`, `ExamEvent`.
2. Implementasikan endpoint:
   - `POST /api/exams/:examId/sessions`
   - `GET /api/exam-sessions/:sessionToken`
   - `POST /api/exam-sessions/:id/heartbeat`
   - `POST /api/exam-sessions/:id/answers` (atau reuse modul ujian existing)
   - `POST /api/exam-sessions/:id/finish`
   - `POST /api/exam-sessions/:id/events`
3. Pastikan:
   - `sessionToken` aman (random, sekali pakai, ada expiry),
   - semua endpoint memvalidasi status ujian & hak akses siswa.

### 6.2 Di Frontend Web SIS

1. Tambahkan route ujian:
   - `/exam/live/:sessionToken`
2. Flow:
   - baca token dari URL,
   - call `GET /api/exam-sessions/:sessionToken`,
   - render UI soal + timer,
   - kirim jawaban & heartbeat ke API,
   - ketika selesai → `POST /finish`.
3. Desain UI:
   - bersih, full-width, minim navigasi lain,
   - responsif untuk WebView mobile & desktop.

### 6.3 Project Android Exam Browser Baru

1. Buat project baru (disarankan di repo terpisah), misal:
   - `sis-exam-browser-android/`
2. Langkah awal:
   - 1 Activity dengan WebView yang membuka URL ujian dummy,
   - tambah `FLAG_SECURE`, full screen, override back.
3. Setelah stabil:
   - ganti ke URL `https://<domain SIS>/exam/live/:sessionToken`,
   - UI untuk input token / scan QR,
   - integrasi dengan endpoint `events`.

### 6.4 Project iOS Exam App (Berikutnya)

1. Buat project RN minimal (bisa di repo lain):
   - fokus 1 screen WebView.
2. Tambah bridge native:
   - deteksi screen recording,
   - lifecycle background/foreground,
   - kirim event ke backend.

### 6.5 Integrasi Desktop via SEB

1. Tentukan:
   - start URL,
   - domain whitelist.
2. Siapkan file konfigurasi `.seb` (opsional) yang sudah:
   - pre-filled dengan domain SIS,
   - start URL ke halaman ujian/token SIS.
3. Dokumentasikan ke sekolah cara:
   - install SEB,
   - import konfigurasi,
   - menjalankan ujian.

---