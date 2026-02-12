## Instruksi untuk Trae: Konfigurasi Server Baru SIS di 203.77.241.188

Tujuan file ini:
- Mengarahkan Trae agar **mengkonfigurasi dan memastikan seluruh stack SIS berjalan normal** di server Ubuntu baru dengan IP publik **203.77.241.188**, berdasarkan panduan teknis di `new_infra.md`.

Saat membaca file ini, **Trae diharapkan langsung mengeksekusi langkah-langkah berikut** (tanpa menunggu instruksi tambahan), selama memiliki akses SSH ke server.

---

### 1. Koneksi ke Server Baru

1. Gunakan koneksi SSH ke server:
   - Host/IP: `203.77.241.188`
   - Port: `1945` 
   - Autentikasi: **SSH public key** (bukan password).
2. Trae harus:
   - Memastikan key yang dipakai sudah terdaftar di `~/.ssh/authorized_keys` user target.
   - Menggunakan user dengan akses ke `/var/www/sis-project` dan hak `sudo` bila diperlukan.

---

### 2. Verifikasi Paket & Lingkungan Sistem

Mengacu pada `new_infra.md`, Trae harus memverifikasi bahwa di server telah tersedia:

- Git, curl, build-essential, ufw.
- Nginx.
- PostgreSQL (server + contrib).
- Node.js LTS (20.x) dan npm.
- PM2 global.

Jika ada paket yang belum terinstal, Trae **wajib**:

- Menginstal paket yang kurang menggunakan perintah yang sudah disebut di `new_infra.md`.
- Tidak mengubah paket yang sudah benar kecuali ada instruksi eksplisit.

---

### 3. Struktur Project di Server

Trae harus memastikan:

1. Folder utama project berada di:
   - `/var/www/sis-project`
2. Jika folder belum ada:
   - Clone repository sesuai URL git yang digunakan di server lama, atau
   - Sinkronkan folder `sis-project` dari server lama (rsync/scp) mengikuti pola di `new_infra.md`.
3. Pastikan kepemilikan folder:
   - `sudo chown -R <USER>:<USER> /var/www/sis-project`

---

### 4. Konfigurasi Database PostgreSQL

Trae wajib memverifikasi:

1. Ada database:
   - Nama: `sis_db`
2. Ada user:
   - Username: `tripleone`
   - Password: `P@ssw0rd`
3. User `tripleone` adalah owner `sis_db` dan memiliki hak penuh.

Jika database kosong dan user meminta migrasi data dari server lama:

- Ikuti langkah backup dan restore yang sudah dijelaskan di `new_infra.md` menggunakan `pg_dump` dan `pg_restore`.

---

### 5. File Environment Backend

Di server baru, Trae harus memastikan:

1. File `.env` backend berada di:
   - `/var/www/sis-project/backend/.env`
2. Isi minimal:
   - `DATABASE_URL="postgresql://tripleone:P@ssw0rd@localhost:5432/sis_db?schema=public"`
   - `JWT_SECRET` dan variabel lain mengikuti server lama (Trae boleh menyalin dari server lama bila punya akses).
3. Trae **tidak boleh** meng-commit `.env` ke git.

Jika `.env` tidak ada, Trae harus:

- Membuat `.env` baru berdasarkan pola di `new_infra.md`, lalu menyesuaikan nilai sesuai kebutuhan user.

---

### 6. Setup & Jalankan Backend

Di folder `/var/www/sis-project/backend`, Trae harus:

1. Meng-install dependency:
   - `npm install`
2. Menjalankan migrasi / sinkronisasi Prisma:
   - Jika project pakai migration:
     - `npx prisma migrate deploy`
   - Jika hanya push schema:
     - `npx prisma db push`
   - Pilih sesuai praktik yang digunakan di server lama.
3. Menjalankan seed data jika diperlukan:
   - `npx prisma db seed` atau script `npm run prisma:seed` jika tersedia.
4. Build backend TypeScript:
   - `npm run build`
5. Menjalankan backend dengan PM2:
   - `pm2 start dist/index.js --name sis-backend`
   - `pm2 save`
   - `pm2 startup systemd` (satu kali konfigurasi)

Trae juga harus menggunakan script yang sudah ada di `package.json` (misal `npm run service:status`, `npm run service:health`, `npm run service:restart`) untuk:

- Mengecek kesehatan backend.
- Merestart service dengan cara yang konsisten dengan server lama.

---

### 7. Setup & Deploy Frontend

Di folder `/var/www/sis-project/frontend`, Trae harus:

1. Install dependency:
   - `npm install`
2. Build dan deploy frontend:
   - Jalankan `npm run deploy`
   - Script ini otomatis:
     - `npm run build` → menghasilkan file di `frontend/dist`.
     - Menyalin `dist/*` ke `/var/www/html/`.

Trae harus memastikan:

- Output build berada di `/var/www/sis-project/frontend/dist`.
- Folder `/var/www/html` berisi file hasil build terbaru.

Jika hanya ingin build tanpa deploy:

- `npm run build` (Trae boleh gunakan ini untuk test build sebelum deploy).

---

### 8. Konfigurasi Nginx

Trae harus membuat atau menyesuaikan konfigurasi Nginx agar:

1. File konfigurasi utama berada di:
   - `/etc/nginx/sites-available/sis.conf`
2. Isi dasarnya sesuai `new_infra.md`, misalnya:

```nginx
server {
    listen 80;
    server_name 203.77.241.188;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Aktifkan site:
   - `sudo ln -s /etc/nginx/sites-available/sis.conf /etc/nginx/sites-enabled/sis.conf`
   - `sudo nginx -t`
   - `sudo systemctl reload nginx`

Jika nanti user menambahkan domain dan HTTPS:

- Trae boleh menjalankan `certbot --nginx -d <DOMAIN>` sesuai `new_infra.md`.

---

### 9. Firewall & Keamanan Dasar

Trae harus mengecek UFW:

- Mengizinkan SSH:
  - `sudo ufw allow OpenSSH`
- Mengizinkan HTTP/HTTPS:
  - `sudo ufw allow 'Nginx Full'`
- Mengaktifkan UFW:
  - `sudo ufw enable`

Trae tidak boleh menutup akses yang akan memutus koneksi manajemen, kecuali ada instruksi eksplisit.

---

### 10. Verifikasi Akhir

Setelah semua langkah:

1. Pastikan backend:
   - PM2 menunjukkan `sis-backend` status `online`.
   - Endpoint health `/api/health` (atau yang didefinisikan) merespons dengan benar.
2. Pastikan frontend:
   - Mengakses `http://203.77.241.188` dari browser menampilkan aplikasi SIS.
3. Pastikan integrasi:
   - Login, akses dashboard, dan beberapa fitur utama (misalnya manajemen user, rekap absensi) berjalan tanpa error.

Jika ada error selama proses:

- Trae harus:
  - Membaca log (PM2, Nginx, aplikasi).
  - Memperbaiki konfigurasi yang relevan.
  - Hanya berhenti setelah aplikasi berjalan stabil di IP `203.77.241.188`.

