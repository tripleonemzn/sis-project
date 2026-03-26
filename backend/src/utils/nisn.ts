const DUMMY_SEQUENCE_NISNS = new Set([
  '0123456789',
  '1234567890',
  '0987654321',
  '9876543210',
]);

export function normalizeNisnInput(value: unknown): string {
  return String(value || '')
    .replace(/\D+/g, '')
    .slice(0, 10);
}

export function getNisnValidationMessage(value: unknown): string | null {
  const normalized = normalizeNisnInput(value);

  if (!normalized) return 'NISN wajib diisi';
  if (!/^\d{10}$/.test(normalized)) {
    return 'NISN harus terdiri dari 10 digit angka';
  }
  if (/^(\d)\1{9}$/.test(normalized)) {
    return 'NISN tidak boleh menggunakan pola angka yang sama semua';
  }
  if (DUMMY_SEQUENCE_NISNS.has(normalized)) {
    return 'NISN terlihat seperti pola dummy. Gunakan NISN resmi yang terdaftar';
  }

  return null;
}
