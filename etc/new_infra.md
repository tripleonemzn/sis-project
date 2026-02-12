# Rencana Migrasi Server SIS ke Ubuntu Baru (203.77.241.188)

Dokumen ini menjelaskan paket apa saja yang perlu di‑install di server Ubuntu baru, cara setup project `sis-project`, dan bagaimana menjalankan aplikasi agar sama dengan server saat ini.

> Catatan: IP publik baru: **203.77.241.188**. Jika nanti menggunakan domain, arahkan DNS (A record) ke IP ini.

---

## 1. Spesifikasi & Asumsi

- OS: Ubuntu Server **20.04 / 22.04 LTS** (disarankan 22.04).
- Aplikasi:
  - Backend: Node.js + Express + Prisma + PostgreSQL.
  - Frontend: React + Vite, di‑build lalu diserve oleh **Nginx** dari `/var/www/html`.
  - Process manager: **PM2** untuk backend.
  - Database: **PostgreSQL**, database utama `sis_db`, user `tripleone`, password `P@ssw0rd`.
- Folder aplikasi: `/var/www/sis-project`.

Pastikan kamu punya akses root / sudo.

---

## 2. Install Paket Sistem Utama

Jalankan di server baru:

```bash
sudo apt update && sudo apt upgrade -y

# Tools dasar
sudo apt install -y git curl build-essential ufw

# Nginx untuk web server
sudo apt install -y nginx

# PostgreSQL untuk database
sudo apt install -y postgresql postgresql-contrib
```

### 2.1. Install Node.js LTS + npm

Gunakan NodeSource (misal Node 20 LTS):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# cek versi
node -v
npm -v
```

### 2.2. Install PM2 (process manager backend)

```bash
sudo npm install -g pm2
```

> Opsional: untuk HTTPS bisa tambahkan `certbot` nanti:  
> `sudo apt install -y certbot python3-certbot-nginx`

---

## 3. Setup Database PostgreSQL

Login ke postgres:

```bash
sudo -u postgres psql
```

Di dalam prompt `psql`, buat user dan database:

```sql
CREATE USER tripleone WITH PASSWORD 'P@ssw0rd';
CREATE DATABASE sis_db OWNER tripleone;
GRANT ALL PRIVILEGES ON DATABASE sis_db TO tripleone;
\q
```

Jika ingin menyalin data dari server lama:

1. Di server lama:

   ```bash
   pg_dump -U tripleone -h 127.0.0.1 -Fc sis_db > sis_db_backup.dump
   ```

2. Copy file `sis_db_backup.dump` ke server baru (scp/rsync).

3. Di server baru:

   ```bash
   sudo -u postgres pg_restore -d sis_db -U postgres sis_db_backup.dump
   ```

Pastikan firewall PostgreSQL disesuaikan (umumnya hanya diakses lokal).

---

## 4. Clone Project ke Server Baru

```bash
sudo mkdir -p /var/www
cd /var/www

# clone repo (sesuaikan URL git dengan yang kamu pakai)
sudo git clone <URL_REPO_SIS_PROJECT> sis-project

sudo chown -R $USER:$USER /var/www/sis-project
cd /var/www/sis-project
```

> Jika tidak pakai git, bisa copy folder `sis-project` dari server lama dengan `rsync` atau `scp -r`.

---

## 5. Konfigurasi Environment (.env)

Di server lama kemungkinan sudah ada file `.env` untuk backend berisi:

- `DATABASE_URL` untuk Prisma (PostgreSQL).
- `JWT_SECRET` dan konfigurasi lain.

Langkah:

1. **Copy file `.env` backend** dari server lama ke:

   ```bash
   /var/www/sis-project/backend/.env
   ```

2. Jika mau buat dari nol, contoh pola (sesuaikan nilai sebenarnya):

   ```env
   DATABASE_URL="postgresql://tripleone:P@ssw0rd@localhost:5432/sis_db?schema=public"
   JWT_SECRET="ganti_dengan_secret_yang_kuat"
   ```

3. Pastikan `.env` **tidak** di‑commit ke git.

---

## 6. Setup Backend

Masuk ke folder backend:

```bash
cd /var/www/sis-project/backend
npm install
```

### 6.1. Jalankan migrasi / sinkronisasi schema database

Jika project menggunakan Prisma migrations, jalankan:

```bash
npx prisma migrate deploy
```

Jika tidak ada migration dan hanya mengandalkan schema ke database, bisa gunakan:

```bash
npx prisma db push
```

> Sesuaikan dengan cara yang saat ini dipakai di server lama. Jika ragu, cukup restore database dari backup lama (lihat bagian 3).

### 6.2. Seed data (jika diperlukan)

Backend punya perintah seed:

```bash
npm run prisma:seed   # jika ada script ini
```

Di project ini seed didefinisikan di `package.json` sebagai:

```json
"prisma": {
  "seed": "node -r ts-node/register prisma/seed.ts"
}
```

Jika perlu, jalankan manual:

```bash
npx prisma db seed
```

### 6.3. Build backend (TypeScript → JavaScript)

```bash
npm run build
```

### 6.4. Jalankan backend dengan PM2

PM2 sebaiknya menjalankan file hasil build (`dist/index.js`):

```bash
cd /var/www/sis-project/backend

pm2 start dist/index.js --name sis-backend

# simpan konfigurasi PM2
pm2 save

# set PM2 auto-start saat boot
pm2 startup systemd
```

Perintah cepat yang sudah ada di project:

- Cek status & health:

  ```bash
  npm run service:status
  npm run service:health
  ```

- Restart backend + reload nginx:

  ```bash
  npm run service:restart
  ```

Sesuaikan script ini jika path atau nama service berubah.

---

## 7. Setup Frontend

Masuk ke folder frontend:

```bash
cd /var/www/sis-project/frontend
npm install
```

### 7.1. Build & deploy frontend

Project sudah menyediakan script:

```bash
npm run deploy
```

Script ini akan:

1. `npm run build` → menghasilkan file statis di `frontend/dist`.
2. Menyalin isi `dist/*` ke `/var/www/html/`.

Itu sebabnya Nginx tinggal diset root ke `/var/www/html`.

Jika ingin hanya build saja:

```bash
npm run build
```

---

## 8. Konfigurasi Nginx

Buat konfigurasi server baru, misalnya `/etc/nginx/sites-available/sis.conf`:

```nginx
server {
    listen 80;
    server_name 203.77.241.188; # atau domainmu nanti

    root /var/www/html;
    index index.html;

    # Frontend (React + Vite build)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy ke backend Node (Express)
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktifkan konfigurasi:

```bash
sudo ln -s /etc/nginx/sites-available/sis.conf /etc/nginx/sites-enabled/sis.conf

sudo nginx -t   # test konfigurasi
sudo systemctl reload nginx
```

Jika nanti memakai domain dan HTTPS:

```bash
sudo certbot --nginx -d contohdomain.com
```

---

## 9. Firewall (Opsional tapi Disarankan)

Aktifkan UFW (Uncomplicated Firewall):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # port 80 dan 443
sudo ufw enable
sudo ufw status
```

---

## 10. Ringkasan Perintah Harian

**Update kode & restart backend:**

```bash
cd /var/www/sis-project
git pull origin main   # jika pakai git

cd backend
npm install
npm run build
npm run service:restart   # atau pm2 restart sis-backend
```

**Deploy frontend setelah ada perubahan:**

```bash
cd /var/www/sis-project/frontend
npm install
npm run deploy
```

**Cek status service:**

```bash
cd /var/www/sis-project/backend
npm run service:status
npm run service:health
```

Dengan mengikuti langkah di atas, server baru Ubuntu dengan IP **203.77.241.188** akan memiliki environment yang sama dengan server lama dan siap melayani aplikasi SIS (backend + frontend + PostgreSQL). 

