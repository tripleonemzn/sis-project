# Workflow Git Clean and Sync

Dokumen ini menetapkan standar kerja agar setiap batch pengembangan berakhir dalam kondisi:

- worktree clean
- branch sinkron dengan upstream
- aman untuk masuk jalur release

## 1. Definisi Selesai

Sebuah batch baru dianggap selesai jika semua poin berikut terpenuhi:

1. Semua perubahan sudah di-commit.
2. Build/test sesuai scope sudah lulus.
3. Branch saat ini tidak `ahead` dan tidak `behind` upstream.
4. `git status --short` kosong.
5. `git status -sb` hanya menampilkan:
   - `## <branch>...<remote>/<branch>`

Contoh status yang belum selesai:

- `## main...origin/main [ahead 3]`
- `## feature/x...origin/feature/x [behind 2]`
- ada output dari `git status --short`

## 2. Workflow Harian Yang Direkomendasikan

### Opsi paling aman

1. Kerjakan fitur di branch feature.
2. Jalankan verifikasi batch:
   - `bash ./scripts/finalize-dev-batch.sh <scope> --push`
3. Pastikan branch feature sudah clean dan sinkron.
4. Review/merge ke `main`.
5. Sinkronkan `main` lokal lagi.

### Jika memang bekerja langsung di `main`

1. Selesaikan batch kecil.
2. Jalankan:
   - `bash ./scripts/finalize-dev-batch.sh <scope> --push`
3. Pastikan `git status -sb` tidak lagi `ahead/behind`.

Catatan:

- Bekerja langsung di `main` boleh, tetapi risikonya lebih tinggi.
- Untuk perubahan production-sensitive, tetap utamakan batch kecil, rollback plan, dan staging dulu.

## 3. Script Yang Dipakai

### `repo-safety-gate.sh`

Memeriksa:

- worktree clean / out-of-scope change
- build/test per scope
- sinkronisasi branch ke upstream via `git-sync-gate.sh`

Default-nya gate akan memblokir worktree kotor. Bypass hanya untuk kondisi darurat.

Contoh:

- `bash ./scripts/repo-safety-gate.sh web`
- `bash ./scripts/repo-safety-gate.sh mobile`

### `git-sync-gate.sh`

Memeriksa:

- branch punya upstream
- branch tidak detached
- ahead/behind terhadap upstream

Contoh:

- `bash ./scripts/git-sync-gate.sh`
- `bash ./scripts/git-sync-gate.sh --push-if-ahead`

### `finalize-dev-batch.sh`

Helper untuk menutup batch secara seragam:

1. jalankan safety gate sesuai scope
2. cek/push sinkronisasi branch

Contoh:

- `bash ./scripts/finalize-dev-batch.sh web`
- `bash ./scripts/finalize-dev-batch.sh mobile --push`
- `bash ./scripts/finalize-dev-batch.sh all --push --report`

## 4. Aturan Release

Release manager sekarang menganggap branch `ahead/behind` sebagai drift yang harus dibereskan dulu.

Contoh alur aman:

1. `bash ./scripts/finalize-dev-batch.sh web --push`
2. `bash ./scripts/release-manager.sh web deploy`

Bypass hanya untuk darurat:

- `--allow-dirty`
- `--allow-unsynced`

Kedua opsi ini harus dianggap exception operasional, bukan workflow normal.

## 5. Aturan Untuk Fitur Lintas Web dan Mobile

Untuk fitur yang harus 1:1:

1. selesaikan backend contract dulu
2. implementasi web dan mobile dalam batch yang sama
3. jalankan finalizer minimal pada scope `all` atau verifikasi per-scope yang setara
4. push branch setelah semua parity check lulus

## 6. Checklist Singkat Sebelum Menganggap Task Selesai

- `git status --short` kosong
- `git status -sb` tidak `ahead/behind`
- build/test scope terkait lulus
- branch sudah ter-push
- jika akan release, gunakan `release-manager.sh`
