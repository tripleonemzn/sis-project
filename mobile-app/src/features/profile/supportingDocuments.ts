export type SupportingDocumentRecord = {
  title: string;
  fileUrl: string;
  category: string;
};

export type SupportingDocumentTemplate = {
  key: string;
  title: string;
  description: string;
};

export type SupportingDocumentItem = {
  key: string;
  title: string;
  description: string;
  category: string;
  isDefault: boolean;
  index: number | null;
  fileUrl: string;
};

export const SUPPORTING_DOCUMENT_CATEGORY = 'Dokumen Pendukung';

export const DEFAULT_SUPPORTING_DOCUMENT_TEMPLATES: SupportingDocumentTemplate[] = [
  {
    key: 'FOTO_FORMAL',
    title: 'Foto Formal',
    description: 'Pas foto atau foto formal terbaru dengan tampilan rapi.',
  },
  {
    key: 'KTP',
    title: 'KTP',
    description: 'Unggah KTP yang masih berlaku dan terbaca jelas.',
  },
  {
    key: 'KK',
    title: 'KK',
    description: 'Unggah kartu keluarga terbaru untuk verifikasi data keluarga.',
  },
  {
    key: 'NPWP',
    title: 'NPWP',
    description: 'Unggah NPWP jika sudah memiliki atau dibutuhkan administrasi.',
  },
];

const normalizeText = (value?: string | null) => String(value || '').trim();
const normalizeTitle = (value?: string | null) => normalizeText(value).toUpperCase();

export function sanitizeSupportingDocuments(
  documents: SupportingDocumentRecord[],
): SupportingDocumentRecord[] {
  return documents
    .map((document) => ({
      title: normalizeText(document.title),
      fileUrl: normalizeText(document.fileUrl),
      category: normalizeText(document.category) || SUPPORTING_DOCUMENT_CATEGORY,
    }))
    .filter((document) => document.title && document.fileUrl);
}

export function buildSupportingDocumentItems(
  documents: SupportingDocumentRecord[],
): {
  defaultItems: SupportingDocumentItem[];
  customItems: SupportingDocumentItem[];
} {
  const sanitized = sanitizeSupportingDocuments(documents);
  const consumedIndexes = new Set<number>();

  const defaultItems = DEFAULT_SUPPORTING_DOCUMENT_TEMPLATES.map((template) => {
    const matchIndex = sanitized.findIndex(
      (document, index) =>
        !consumedIndexes.has(index) && normalizeTitle(document.title) === normalizeTitle(template.title),
    );

    if (matchIndex >= 0) {
      consumedIndexes.add(matchIndex);
    }

    const match = matchIndex >= 0 ? sanitized[matchIndex] : null;
    return {
      key: template.key,
      title: template.title,
      description: template.description,
      category: match?.category || SUPPORTING_DOCUMENT_CATEGORY,
      isDefault: true,
      index: matchIndex >= 0 ? matchIndex : null,
      fileUrl: match?.fileUrl || '',
    } satisfies SupportingDocumentItem;
  });

  const customItems = sanitized
    .map((document, index) => ({ document, index }))
    .filter(({ index }) => !consumedIndexes.has(index))
    .map(({ document, index }, itemIndex) => ({
      key: `CUSTOM_${itemIndex}_${normalizeTitle(document.title) || index}`,
      title: document.title,
      description: 'Dokumen tambahan manual seperti sertifikat, surat tugas, atau dokumen pendukung lain.',
      category: document.category || SUPPORTING_DOCUMENT_CATEGORY,
      isDefault: false,
      index,
      fileUrl: document.fileUrl,
    }));

  return {
    defaultItems,
    customItems,
  };
}

export function upsertSupportingDocument(args: {
  documents: SupportingDocumentRecord[];
  nextDocument: SupportingDocumentRecord;
  index: number | null;
}): SupportingDocumentRecord[] {
  const sanitized = sanitizeSupportingDocuments(args.documents);
  const nextDocument = {
    title: normalizeText(args.nextDocument.title),
    fileUrl: normalizeText(args.nextDocument.fileUrl),
    category: normalizeText(args.nextDocument.category) || SUPPORTING_DOCUMENT_CATEGORY,
  };

  if (!nextDocument.title || !nextDocument.fileUrl) {
    return sanitized;
  }

  if (typeof args.index === 'number' && args.index >= 0 && args.index < sanitized.length) {
    return sanitizeSupportingDocuments(
      sanitized.map((document, index) => (index === args.index ? nextDocument : document)),
    );
  }

  return sanitizeSupportingDocuments([...sanitized, nextDocument]);
}

export function removeSupportingDocumentAt(
  documents: SupportingDocumentRecord[],
  index: number | null,
): SupportingDocumentRecord[] {
  if (typeof index !== 'number' || index < 0) {
    return sanitizeSupportingDocuments(documents);
  }

  return sanitizeSupportingDocuments(documents.filter((_, documentIndex) => documentIndex !== index));
}
