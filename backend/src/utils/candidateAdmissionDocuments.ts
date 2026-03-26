type CandidateDocumentLike = {
  id?: number;
  title: string;
  fileUrl: string;
  category: string;
  createdAt?: Date | string | null;
};

export const CANDIDATE_DOCUMENT_REQUIREMENTS = [
  {
    code: 'PPDB_AKTA_KELAHIRAN',
    label: 'Akta Kelahiran',
    description: 'Salinan akta kelahiran calon siswa.',
    required: true,
    aliases: ['PPDB_AKTA_KELAHIRAN', 'AKTA_KELAHIRAN'],
    acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
  },
  {
    code: 'PPDB_KARTU_KELUARGA',
    label: 'Kartu Keluarga',
    description: 'Scan/foto kartu keluarga terbaru.',
    required: true,
    aliases: ['PPDB_KARTU_KELUARGA', 'KARTU_KELUARGA', 'KK'],
    acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
  },
  {
    code: 'PPDB_RAPOR_TERAKHIR',
    label: 'Rapor Terakhir',
    description: 'Rapor semester terakhir atau dokumen nilai pendukung.',
    required: true,
    aliases: ['PPDB_RAPOR_TERAKHIR', 'RAPOR_TERAKHIR', 'RAPOR'],
    acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
  },
  {
    code: 'PPDB_PAS_FOTO',
    label: 'Pas Foto',
    description: 'Pas foto terbaru calon siswa.',
    required: true,
    aliases: ['PPDB_PAS_FOTO', 'PAS_FOTO', 'FOTO'],
    acceptedFormats: ['jpg', 'jpeg', 'png'],
  },
  {
    code: 'PPDB_SERTIFIKAT',
    label: 'Sertifikat / Piagam',
    description: 'Opsional, untuk sertifikat prestasi atau dokumen pendukung tambahan.',
    required: false,
    aliases: ['PPDB_SERTIFIKAT', 'SERTIFIKAT', 'PIAGAM'],
    acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
  },
] as const;

type CandidateRequirement = (typeof CANDIDATE_DOCUMENT_REQUIREMENTS)[number];

function extractFileExtension(value?: string | null) {
  const input = String(value || '').trim().toLowerCase();
  if (!input) return '';
  const sanitized = input.split('?')[0].split('#')[0];
  const segments = sanitized.split('.');
  return segments.length > 1 ? segments[segments.length - 1] : '';
}

export function normalizeCandidateDocumentCategory(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveRequirementByCategory(category: string): CandidateRequirement | undefined {
  const normalizedCategory = normalizeCandidateDocumentCategory(category);
  return CANDIDATE_DOCUMENT_REQUIREMENTS.find((item) =>
    item.aliases
      .map((alias) => normalizeCandidateDocumentCategory(alias))
      .includes(normalizedCategory),
  );
}

export function buildCandidateDocumentChecklist<T extends CandidateDocumentLike>(documents: T[]) {
  const normalizedDocuments = documents.map((document) => {
    const normalizedCategory = normalizeCandidateDocumentCategory(document.category);
    const requirement = resolveRequirementByCategory(normalizedCategory);
    const extension =
      extractFileExtension(document.fileUrl) || extractFileExtension(document.title);
    const isFormatValid =
      !requirement || (requirement.acceptedFormats as readonly string[]).includes(extension);
    const validationError =
      requirement && !isFormatValid
        ? `${requirement.label} hanya menerima file ${requirement.acceptedFormats
            .map((item) => item.toUpperCase())
            .join(', ')}.`
        : null;

    return {
      ...document,
      normalizedCategory,
      requirement,
      extension,
      isFormatValid,
      validationError,
    };
  });

  const requirements = CANDIDATE_DOCUMENT_REQUIREMENTS.map((item) => {
    const aliases = item.aliases.map((alias) => normalizeCandidateDocumentCategory(alias));
    const matchedDocuments = normalizedDocuments.filter((document) =>
      aliases.includes(document.normalizedCategory),
    );
    const validDocuments = matchedDocuments
      .filter((document) => document.isFormatValid)
      .map(
        ({
          normalizedCategory: _normalizedCategory,
          requirement: _requirement,
          extension: _extension,
          isFormatValid: _isFormatValid,
          validationError: _validationError,
          ...document
        }) => document,
      );
    const invalidDocuments = matchedDocuments
      .filter((document) => !document.isFormatValid)
      .map(
        ({
          normalizedCategory: _normalizedCategory,
          requirement: _requirement,
          extension: _extension,
          isFormatValid: _isFormatValid,
          validationError,
          ...document
        }) => ({
          ...document,
          validationError: String(validationError || ''),
        }),
      );

    return {
      code: item.code,
      label: item.label,
      description: item.description,
      required: item.required,
      acceptedFormats: item.acceptedFormats,
      isComplete: validDocuments.length > 0,
      uploadedCount: matchedDocuments.length,
      validUploadedCount: validDocuments.length,
      invalidCount: invalidDocuments.length,
      documents: validDocuments,
      invalidDocuments,
    };
  });

  const matchedDocumentIds = new Set(
    requirements.flatMap((item) => [
      ...item.documents.map((document) => document.id),
      ...item.invalidDocuments.map((document) => document.id),
    ]),
  );
  const uncategorizedDocuments = documents.filter((document) => !matchedDocumentIds.has(document.id));
  const invalidDocuments = requirements.flatMap((item) => item.invalidDocuments);
  const requiredItems = requirements.filter((item) => item.required);
  const optionalItems = requirements.filter((item) => !item.required);

  return {
    required: requiredItems,
    optional: optionalItems,
    requiredComplete: requiredItems.every((item) => item.isComplete),
    summary: {
      totalUploaded: documents.length,
      requiredUploaded: requiredItems.filter((item) => item.isComplete).length,
      requiredTotal: requiredItems.length,
      optionalUploaded: optionalItems.filter((item) => item.isComplete).length,
      uncategorizedCount: uncategorizedDocuments.length,
      invalidCount: invalidDocuments.length,
    },
    uncategorizedDocuments,
    invalidDocuments,
  };
}

export function validateCandidateProfileDocuments<T extends CandidateDocumentLike>(documents: T[]) {
  const checklist = buildCandidateDocumentChecklist(documents);
  const errors = checklist.invalidDocuments.map(
    (document) => `${document.title}: ${document.validationError}`,
  );

  return {
    checklist,
    errors,
  };
}
