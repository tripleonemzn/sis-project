# Academic Promotion Rollout Checklist

Checklist ini dipakai untuk rollout fitur promotion kenaikan kelas/alumni dengan aman, terukur, dan tanpa mengganggu production.

## 1. Scope Rilis

- Backend API promotion v2
- UI web admin `Promotion Center`
- UI mobile admin `Promotion Center`
- Migration additive untuk `promotion_runs`, `promotion_run_items`, `promotion_class_mappings`, dan `student_academic_memberships`

## 2. Guardrail Sebelum Staging

- Pastikan branch yang akan dirilis sudah committed.
- Pastikan worktree clean:
  - `git status --short`
- Jalankan safety gate web:
  - `bash ./scripts/repo-safety-gate.sh web`
- Jalankan safety gate mobile:
  - `bash ./scripts/repo-safety-gate.sh mobile`
- Audit promotion untuk pasangan tahun yang akan diuji:
  - `cd backend`
  - `npm run promotion:audit -- --source-year <SOURCE_ID> --target-year <TARGET_ID>`
- Jika ingin smoke test otomatis di clone DB terisolasi:
  - `bash ./scripts/smoke-test-academic-promotion-clone.sh`

## 3. Deploy ke Staging

### Web / Backend

- Deploy web stack:
  - `bash ./scripts/release-manager.sh web deploy`
- Deploy web sekarang berjalan via worktree terisolasi:
  - `bash ./scripts/deploy-web-isolated.sh`

### Mobile

- Validasi release mobile:
  - `cd mobile-app`
  - `npm run check:release`
- Publish OTA ke staging / pilot:
  - `bash ../scripts/publish-mobile-ota-isolated.sh staging`
  - atau
  - `bash ../scripts/publish-mobile-ota-isolated.sh pilot`

## 4. Checklist Uji Staging

### Persiapan Data

- Tahun sumber dan target berbeda.
- Kelas target untuk XI/XII sudah dibuat lebih dulu.
- Kelas target masih kosong.
- Jurusan dan level kelas target sudah sesuai.

### Uji UI Web dan Mobile

- Web dan mobile menampilkan jumlah siswa aktif yang sama.
- Web dan mobile menampilkan blocking issue yang sama.
- Web dan mobile menampilkan warning yang sama.
- Web dan mobile menampilkan mapping target class yang sama.
- Web dan mobile menampilkan riwayat run yang sama.

### Uji Fungsional

- Simpan mapping dari web, lalu buka mobile: hasil harus identik.
- Simpan mapping dari mobile, lalu buka web: hasil harus identik.
- Commit promotion dari salah satu kanal.
- Pastikan siswa X berpindah ke XI yang benar.
- Pastikan siswa XI berpindah ke XII yang benar.
- Pastikan siswa XII berubah `GRADUATED` dan `classId = null`.
- Jika opsi aktivasi target dinyalakan, pastikan hanya tahun target yang aktif.

### Audit Pasca Commit

- Jalankan audit dengan `runId`:
  - `cd backend`
  - `npm run promotion:audit -- --source-year <SOURCE_ID> --target-year <TARGET_ID> --run-id <RUN_ID>`
- Hasil audit harus `PASS`.

## 5. Go / No-Go Production

Go jika semua poin berikut terpenuhi:

- Staging audit `PASS`
- Tidak ada blocking issue di workspace promotion
- Parity web-mobile terverifikasi
- Snapshot data siswa sebelum commit sudah dibackup
- Tim operasional tahu pasangan tahun yang akan diproses

No-Go jika salah satu terjadi:

- Ada kelas target yang masih berisi siswa aktif
- Ada mapping ganda ke target class yang sama
- Ada kelas aktif tanpa target mapping padahal masih punya siswa
- Audit pasca-commit gagal

## 6. Prosedur Production

### Sebelum Commit Promotion

- Backup database / snapshot.
- Jalankan:
  - `bash ./scripts/repo-safety-gate.sh web`
  - `cd backend && npm run promotion:audit -- --source-year <SOURCE_ID> --target-year <TARGET_ID>`
- Buka web dan mobile admin, bandingkan workspace promotion.
- Freeze perubahan manual pada data kelas/siswa selama jendela eksekusi.

### Saat Commit

- Gunakan satu kanal admin saja untuk commit, jangan web dan mobile bersamaan.
- Simpan mapping final.
- Screenshot / catat ringkasan preview sebelum commit.
- Jalankan commit promotion.
- Catat `runId` yang dihasilkan.

### Setelah Commit

- Jalankan audit run:
  - `cd backend`
  - `npm run promotion:audit -- --source-year <SOURCE_ID> --target-year <TARGET_ID> --run-id <RUN_ID>`
- Verifikasi login admin web dan mobile.
- Verifikasi beberapa akun sampel:
  - 1 siswa X
  - 1 siswa XI
  - 1 siswa XII

## 7. Containment / Rollback

Rollback otomatis belum disediakan. Jika hasil commit salah:

- Stop perubahan lanjutan.
- Ambil `runId` yang terdampak.
- Isolasi user yang salah dari `promotion_run_items`.
- Restore dari backup database jika dampaknya luas.
- Jika hanya sedikit siswa, lakukan koreksi terkontrol berbasis `promotion_run_items` dan `student_academic_memberships`.

## 8. Catatan Operasional

- Commit promotion bersifat write ke data aktif, jadi wajib dilakukan pada jendela operasional yang disepakati.
- Workspace harus clean setelah setiap batch rilis:
  - `git status --short`
- Untuk mobile, gunakan OTA isolated worktree; jangan publish dari tree yang kotor.
- Untuk web, tetap utamakan safety gate sebelum deploy.
