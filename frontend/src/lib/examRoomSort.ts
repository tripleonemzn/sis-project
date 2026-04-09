type ExamRoomSortMeta = {
  category: number;
  roomNumber: number | null;
  suffix: string;
  normalizedLabel: string;
};

function normalizeExamRoomLabel(raw: unknown) {
  return String(raw || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildExamRoomSortMeta(raw: unknown): ExamRoomSortMeta {
  const normalizedLabel = normalizeExamRoomLabel(raw);
  const upperLabel = normalizedLabel.toUpperCase().replace(/\./g, '');
  const numericRoomMatch = upperLabel.match(/^(?:RUANG|ROOM|KELAS)\s*(\d+)\s*([A-Z]*)$/);

  if (numericRoomMatch) {
    return {
      category: 0,
      roomNumber: Number(numericRoomMatch[1]),
      suffix: String(numericRoomMatch[2] || '').trim(),
      normalizedLabel,
    };
  }

  if (/^(?:LAB|LABORATORIUM)\b/.test(upperLabel)) {
    return {
      category: 1,
      roomNumber: null,
      suffix: '',
      normalizedLabel,
    };
  }

  if (/^PERPUSTAKAAN\b/.test(upperLabel)) {
    return {
      category: 2,
      roomNumber: null,
      suffix: '',
      normalizedLabel,
    };
  }

  return {
    category: 3,
    roomNumber: null,
    suffix: '',
    normalizedLabel,
  };
}

export function compareExamRoomName(a: unknown, b: unknown, locale = 'id-ID') {
  const left = buildExamRoomSortMeta(a);
  const right = buildExamRoomSortMeta(b);

  if (left.category !== right.category) {
    return left.category - right.category;
  }

  if (left.roomNumber !== null && right.roomNumber !== null && left.roomNumber !== right.roomNumber) {
    return left.roomNumber - right.roomNumber;
  }

  if ((left.roomNumber !== null) !== (right.roomNumber !== null)) {
    return left.roomNumber !== null ? -1 : 1;
  }

  const suffixCompare = left.suffix.localeCompare(right.suffix, locale, {
    numeric: true,
    sensitivity: 'base',
  });
  if (suffixCompare !== 0) {
    return suffixCompare;
  }

  return left.normalizedLabel.localeCompare(right.normalizedLabel, locale, {
    numeric: true,
    sensitivity: 'base',
  });
}
