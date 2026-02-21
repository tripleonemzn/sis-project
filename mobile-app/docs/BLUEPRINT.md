# Blueprint Mobile SIS

## Objective
- Membuat aplikasi mobile Android/iOS tanpa mengganggu web production.
- Memakai backend API yang sama dengan web.

## Non-Goals (Phase 1)
- Tidak migrasi frontend web.
- Tidak ubah struktur backend besar-besaran.
- Tidak menerapkan exam lockdown level SEB di fase awal.

## Architecture
- Client baru: `mobile-app` (Expo + React Native + TS)
- Existing backend: source of truth API.
- Auth: access token + refresh token (secure storage).
- Data layer: TanStack Query.

## API Strategy
- Gunakan endpoint existing selama kompatibel.
- Tambahan endpoint harus additive, contoh:
  - `/api/mobile/me`
  - `/api/mobile/dashboard`
- Tidak ada breaking response untuk web.

## Security Baseline
- Token disimpan di `expo-secure-store`.
- Auto logout saat refresh token gagal.
- Session binding per device (phase lanjutan).

## Day 9 Note
- Backend saat ini belum menyediakan endpoint refresh token.
- Hardening mobile menggunakan:
  - deteksi token JWT expired di client,
  - auto-clear session saat response `401`,
  - event logging auth minimal ke local storage untuk audit troubleshooting.

## Release Strategy
- Android: internal APK pilot.
- iOS: TestFlight internal.
- Setelah stabil, lanjut publikasi store.

## Governance
- Aturan parity dan integrasi lintas platform: `mobile-app/docs/PLATFORM_INTEGRATION_RULEBOOK.md`
