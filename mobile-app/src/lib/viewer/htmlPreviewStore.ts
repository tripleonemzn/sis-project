type HtmlPreviewEntry = {
  id: string;
  title: string;
  html: string;
  helper?: string | null;
  createdAt: number;
};

const htmlPreviewStore = new Map<string, HtmlPreviewEntry>();

function buildPreviewId() {
  return `preview-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createHtmlPreviewEntry(payload: {
  title: string;
  html: string;
  helper?: string | null;
}) {
  const id = buildPreviewId();
  htmlPreviewStore.set(id, {
    id,
    title: payload.title,
    html: payload.html,
    helper: payload.helper || null,
    createdAt: Date.now(),
  });
  return id;
}

export function getHtmlPreviewEntry(id: string) {
  return htmlPreviewStore.get(String(id || '').trim()) || null;
}

export function pruneHtmlPreviewEntries(maxAgeMs = 30 * 60 * 1000) {
  const now = Date.now();
  for (const [id, entry] of htmlPreviewStore.entries()) {
    if (now - entry.createdAt > maxAgeMs) {
      htmlPreviewStore.delete(id);
    }
  }
}
