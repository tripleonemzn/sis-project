import { isAxiosError } from 'axios';

export function getApiErrorMessage(error: unknown, fallback = 'Terjadi kesalahan.') {
  if (isAxiosError(error)) {
    const responseMessage = (error.response?.data as { message?: string } | undefined)?.message;
    if (responseMessage) return responseMessage;

    const status = error.response?.status;
    if (status === 401) return 'Sesi tidak valid. Silakan login ulang.';
    if (status === 403) return 'Akses ditolak.';
    if (status === 404) return 'Layanan tidak ditemukan.';
    if (status && status >= 500) return 'Server sedang bermasalah. Coba lagi beberapa saat.';

    if (error.code === 'ECONNABORTED') return 'Request timeout. Koneksi internet lambat.';
    if (!error.response) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
