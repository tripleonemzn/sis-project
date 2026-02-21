export type NoticeTone = 'success' | 'error' | 'info';

export type AppNoticePayload = {
  tone: NoticeTone;
  message: string;
  title?: string;
  durationMs?: number;
};

type NoticeListener = (payload: AppNoticePayload) => void;

const listeners = new Set<NoticeListener>();

export function subscribeAppNotice(listener: NoticeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showAppNotice(payload: AppNoticePayload) {
  for (const listener of listeners) {
    listener(payload);
  }
}
