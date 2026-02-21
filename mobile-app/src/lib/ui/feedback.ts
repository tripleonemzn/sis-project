import { getApiErrorMessage } from '../api/errorMessage';
import { showAppNotice } from './notice';

type FeedbackOptions = {
  title?: string;
  durationMs?: number;
};

export function notifySuccess(message: string, options?: FeedbackOptions) {
  showAppNotice({
    tone: 'success',
    title: options?.title || 'Berhasil',
    message,
    durationMs: options?.durationMs,
  });
}

export function notifyError(message: string, options?: FeedbackOptions) {
  showAppNotice({
    tone: 'error',
    title: options?.title || 'Gagal',
    message,
    durationMs: options?.durationMs,
  });
}

export function notifyInfo(message: string, options?: FeedbackOptions) {
  showAppNotice({
    tone: 'info',
    title: options?.title || 'Info',
    message,
    durationMs: options?.durationMs,
  });
}

export function notifyApiError(error: unknown, fallback = 'Terjadi kesalahan.') {
  notifyError(getApiErrorMessage(error, fallback));
}
