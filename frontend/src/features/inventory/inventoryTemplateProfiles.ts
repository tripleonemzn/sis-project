export type InventoryTemplateKey = 'STANDARD' | 'LIBRARY' | 'LAB' | 'SPORTS' | 'OFFICE';

export type InventoryAttributeFieldType = 'text' | 'number' | 'date' | 'textarea';

export type InventoryAttributeField = {
  key: string;
  label: string;
  type: InventoryAttributeFieldType;
  placeholder?: string;
  table?: boolean;
  required?: boolean;
};

export type InventoryTemplateProfile = {
  key: InventoryTemplateKey;
  label: string;
  itemNameLabel: string;
  codeLabel: string;
  showCode: boolean;
  brandLabel: string;
  showBrand: boolean;
  quantityLabel: string;
  conditionLabel: string;
  descriptionLabel: string;
  purchaseInfoLabel: string;
  showPurchaseInfo: boolean;
  attributeFields: InventoryAttributeField[];
};

const INVENTORY_TEMPLATE_PROFILES: Record<InventoryTemplateKey, InventoryTemplateProfile> = {
  STANDARD: {
    key: 'STANDARD',
    label: 'Standar Sekolah',
    itemNameLabel: 'Nama Barang',
    codeLabel: 'Kode Barang',
    showCode: true,
    brandLabel: 'Merk / Brand',
    showBrand: true,
    quantityLabel: 'Jumlah',
    conditionLabel: 'Kondisi',
    descriptionLabel: 'Keterangan',
    purchaseInfoLabel: 'Info Pembelian',
    showPurchaseInfo: true,
    attributeFields: [],
  },
  LIBRARY: {
    key: 'LIBRARY',
    label: 'Inventaris Perpustakaan',
    itemNameLabel: 'Judul Buku',
    codeLabel: 'ISBN / Kode Buku',
    showCode: true,
    brandLabel: 'Penulis (Opsional)',
    showBrand: false,
    quantityLabel: 'Jumlah Eksemplar',
    conditionLabel: 'Kondisi Buku',
    descriptionLabel: 'Ringkasan / Catatan',
    purchaseInfoLabel: 'Info Pengadaan',
    showPurchaseInfo: false,
    attributeFields: [
      { key: 'author', label: 'Penulis', type: 'text', placeholder: 'Contoh: Pramoedya Ananta Toer', table: true },
      { key: 'publisher', label: 'Penerbit', type: 'text', placeholder: 'Contoh: Gramedia', table: true },
      { key: 'publishYear', label: 'Tahun Terbit', type: 'number', placeholder: 'Contoh: 2024', table: true },
      { key: 'category', label: 'Kategori', type: 'text', placeholder: 'Contoh: Buku Pelajaran', table: true, required: true },
    ],
  },
  LAB: {
    key: 'LAB',
    label: 'Laboratorium',
    itemNameLabel: 'Nama Perangkat',
    codeLabel: 'Kode Inventaris',
    showCode: true,
    brandLabel: 'Spesifikasi / Merk',
    showBrand: true,
    quantityLabel: 'Jumlah Unit',
    conditionLabel: 'Kondisi Alat',
    descriptionLabel: 'Keterangan Teknis',
    purchaseInfoLabel: 'Info Pengadaan',
    showPurchaseInfo: true,
    attributeFields: [
      { key: 'serialNumber', label: 'Serial Number', type: 'text', placeholder: 'Contoh: SN-12345', table: true },
      { key: 'maintenanceNote', label: 'Catatan Perawatan', type: 'text', placeholder: 'Contoh: Servis berkala per 6 bulan', table: false },
    ],
  },
  SPORTS: {
    key: 'SPORTS',
    label: 'Olahraga',
    itemNameLabel: 'Nama Peralatan',
    codeLabel: 'Kode Item',
    showCode: true,
    brandLabel: 'Merk',
    showBrand: true,
    quantityLabel: 'Jumlah',
    conditionLabel: 'Kondisi',
    descriptionLabel: 'Keterangan',
    purchaseInfoLabel: 'Info Pembelian',
    showPurchaseInfo: true,
    attributeFields: [
      { key: 'sizeSpec', label: 'Ukuran / Spesifikasi', type: 'text', placeholder: 'Contoh: Size 5', table: true },
    ],
  },
  OFFICE: {
    key: 'OFFICE',
    label: 'Perkantoran',
    itemNameLabel: 'Nama Aset',
    codeLabel: 'Kode Aset',
    showCode: true,
    brandLabel: 'Merk / Tipe',
    showBrand: true,
    quantityLabel: 'Jumlah Unit',
    conditionLabel: 'Kondisi',
    descriptionLabel: 'Keterangan',
    purchaseInfoLabel: 'Info Pembelian',
    showPurchaseInfo: true,
    attributeFields: [],
  },
};

export function normalizeInventoryTemplateKey(value?: string | null): InventoryTemplateKey {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'LIBRARY' || normalized === 'PERPUSTAKAAN') return 'LIBRARY';
  if (normalized === 'LAB' || normalized === 'LABORATORY') return 'LAB';
  if (normalized === 'SPORTS' || normalized === 'OLAHRAGA') return 'SPORTS';
  if (normalized === 'OFFICE' || normalized === 'KANTOR') return 'OFFICE';
  return 'STANDARD';
}

export function guessTemplateKeyFromCategoryName(name?: string | null): InventoryTemplateKey {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return 'STANDARD';
  if (normalized.includes('perpustakaan') || normalized.includes('pustaka')) return 'LIBRARY';
  if (normalized.includes('lab') || normalized.includes('praktik') || normalized.includes('laboratorium')) {
    return 'LAB';
  }
  if (normalized.includes('olahraga') || normalized.includes('sport')) return 'SPORTS';
  if (normalized.includes('kantor') || normalized.includes('office') || normalized.includes('tata usaha')) {
    return 'OFFICE';
  }
  return 'STANDARD';
}

export function resolveInventoryTemplateKey(args: {
  templateKey?: string | null;
  categoryName?: string | null;
}): InventoryTemplateKey {
  if (args.templateKey) return normalizeInventoryTemplateKey(args.templateKey);
  return guessTemplateKeyFromCategoryName(args.categoryName);
}

export function getInventoryTemplateProfile(templateKey: InventoryTemplateKey): InventoryTemplateProfile {
  return INVENTORY_TEMPLATE_PROFILES[templateKey] || INVENTORY_TEMPLATE_PROFILES.STANDARD;
}
