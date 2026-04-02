import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useMemo, useState } from 'react';
import {
  buildSupportingDocumentItems,
  removeSupportingDocumentAt,
  SUPPORTING_DOCUMENT_CATEGORY,
  type SupportingDocumentItem,
  type SupportingDocumentRecord,
  upsertSupportingDocument,
} from './supportingDocuments';

type UploadedDocumentResult = {
  fileUrl: string;
  title?: string;
  category?: string;
};

type SupportingDocumentsEditorProps = {
  documents: SupportingDocumentRecord[];
  canUpload: boolean;
  onPickDocument: () => Promise<UploadedDocumentResult | null>;
  onSaveDocuments: (nextDocuments: SupportingDocumentRecord[]) => Promise<void>;
  onViewDocument?: (document: SupportingDocumentRecord) => void;
};

type DocumentDraft = {
  title: string;
  fileUrl: string;
  index: number | null;
  isDefault: boolean;
  displayName: string;
};

const createDraftFromItem = (item?: SupportingDocumentItem | null): DocumentDraft => ({
  title: item?.title || '',
  fileUrl: item?.fileUrl || '',
  index: item?.index ?? null,
  isDefault: Boolean(item?.isDefault),
  displayName: item?.title || '',
});

export function SupportingDocumentsEditor({
  documents,
  canUpload,
  onPickDocument,
  onSaveDocuments,
  onViewDocument,
}: SupportingDocumentsEditorProps) {
  const { defaultItems, customItems } = useMemo(() => buildSupportingDocumentItems(documents), [documents]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<DocumentDraft | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftError, setDraftError] = useState('');

  const openCreateModal = () => {
    setDraft(createDraftFromItem());
    setDraftError('');
    setIsUploading(false);
    setIsSaving(false);
    setIsModalOpen(true);
  };

  const openEditModal = (item: SupportingDocumentItem) => {
    setDraft(createDraftFromItem(item));
    setDraftError('');
    setIsUploading(false);
    setIsSaving(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setDraft(null);
    setDraftError('');
    setIsUploading(false);
    setIsSaving(false);
    setIsModalOpen(false);
  };

  const handlePickDocument = async () => {
    if (!draft) return;
    setDraftError('');
    setIsUploading(true);
    try {
      const uploaded = await onPickDocument();
      if (!uploaded) return;
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              fileUrl: uploaded.fileUrl,
              displayName: uploaded.title || prev.title,
            }
          : prev,
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draft) return;
    const normalizedTitle = String(draft.title || '').trim();
    if (!draft.isDefault && !normalizedTitle) {
      setDraftError('Judul dokumen pendukung wajib diisi untuk dokumen manual.');
      return;
    }
    if (!String(draft.fileUrl || '').trim()) {
      setDraftError('Unggah file dokumen pendukung terlebih dahulu sebelum disimpan.');
      return;
    }

    setIsSaving(true);
    try {
      const nextDocuments = upsertSupportingDocument({
        documents,
        nextDocument: {
          title: draft.isDefault ? draft.title : normalizedTitle,
          fileUrl: draft.fileUrl,
          category: SUPPORTING_DOCUMENT_CATEGORY,
        },
        index: draft.index,
      });
      await onSaveDocuments(nextDocuments);
      closeModal();
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveItem = (item: SupportingDocumentItem) => {
    if (item.index == null) return;
    Alert.alert('Hapus dokumen pendukung', `Hapus dokumen ${item.title} dari daftar dokumen pendukung?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          setIsSaving(true);
          try {
            await onSaveDocuments(removeSupportingDocumentAt(documents, item.index));
          } finally {
            setIsSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <View>
      <View
        style={{
          borderWidth: 1,
          borderColor: '#bfdbfe',
          backgroundColor: '#eff6ff',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>Dokumen Pendukung Profil</Text>
        <Text style={{ color: '#1d4ed8', fontSize: 12, lineHeight: 18 }}>
          Slot utama sudah disiapkan agar user tinggal melengkapi. Format file mendukung PDF, JPG, JPEG, atau PNG
          dengan ukuran maksimal 2MB per file.
        </Text>
      </View>

      {defaultItems.map((item) => {
        const hasFile = Boolean(item.fileUrl);
        return (
          <View
            key={item.key}
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>{item.title}</Text>
                <Text style={{ color: '#64748b', marginTop: 6, lineHeight: 20 }}>{item.description}</Text>
              </View>
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor: hasFile ? '#ecfdf5' : '#f1f5f9',
                }}
              >
                <Text style={{ color: hasFile ? '#047857' : '#64748b', fontSize: 12, fontWeight: '700' }}>
                  {hasFile ? 'Siap' : 'Kosong'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 12 }}>
              <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                <Pressable
                  onPress={() => openEditModal(item)}
                  disabled={!canUpload || isSaving}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: !canUpload ? '#e2e8f0' : '#fff',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: !canUpload ? '#94a3b8' : '#334155', fontWeight: '700' }}>
                    {hasFile ? 'Edit Dokumen' : 'Lengkapi'}
                  </Text>
                </Pressable>
              </View>
              {hasFile && onViewDocument ? (
                <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                  <Pressable
                    onPress={() =>
                      onViewDocument({
                        title: item.title,
                        fileUrl: item.fileUrl,
                        category: item.category,
                      })
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: '#1d4ed8',
                      backgroundColor: '#eff6ff',
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Lihat</Text>
                  </Pressable>
                </View>
              ) : null}
              {hasFile ? (
                <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => handleRemoveItem(item)}
                    disabled={isSaving}
                    style={{
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      backgroundColor: '#fef2f2',
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: '#dc2626', fontWeight: '700' }}>Hapus</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}

      <View
        style={{
          borderWidth: 1,
          borderColor: '#e2e8f0',
          backgroundColor: '#fff',
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '700' }}>Dokumen Tambahan Manual</Text>
        <Text style={{ color: '#64748b', marginTop: 6, marginBottom: 12 }}>
          Tambahkan sertifikat, surat tugas, atau dokumen pendukung lain sesuai kebutuhan profil.
        </Text>
        <Pressable
          onPress={openCreateModal}
          disabled={!canUpload || isSaving}
          style={{
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            alignItems: 'center',
            backgroundColor: !canUpload ? '#e2e8f0' : '#2563eb',
          }}
        >
          <Text style={{ color: !canUpload ? '#94a3b8' : '#fff', fontWeight: '700' }}>
            Tambah Dokumen Pendukung
          </Text>
        </Pressable>

        {customItems.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            {customItems.map((item) => (
              <View
                key={item.key}
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 12,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700' }}>{item.title}</Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{item.description}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 10 }}>
                  <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => openEditModal(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        backgroundColor: '#fff',
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: '#334155', fontWeight: '700' }}>Edit</Text>
                    </Pressable>
                  </View>
                  {onViewDocument ? (
                    <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                      <Pressable
                        onPress={() =>
                          onViewDocument({
                            title: item.title,
                            fileUrl: item.fileUrl,
                            category: item.category,
                          })
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: '#1d4ed8',
                          backgroundColor: '#eff6ff',
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                        }}
                      >
                        <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Lihat</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => handleRemoveItem(item)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fef2f2',
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: '#dc2626', fontWeight: '700' }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: '#cbd5e1',
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>
              Belum ada dokumen tambahan
            </Text>
            <Text style={{ color: '#64748b', textAlign: 'center', lineHeight: 20 }}>
              Gunakan tombol Tambah Dokumen Pendukung jika user ingin menambahkan sertifikat atau dokumen lain di luar
              slot utama.
            </Text>
          </View>
        )}
      </View>

      <Modal visible={isModalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingVertical: 20,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#dbeafe',
              padding: 16,
              maxHeight: '88%',
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 16,
              elevation: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: '#1d4ed8', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                  Dokumen Pendukung
                </Text>
                <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '700', marginBottom: 6 }}>
                  {draft?.index == null ? 'Tambah dokumen pendukung' : 'Edit dokumen pendukung'}
                </Text>
                <Text style={{ color: '#475569', lineHeight: 20 }}>
                  Lengkapi slot dokumen utama atau tambahkan dokumen manual tambahan sesuai kebutuhan profil.
                </Text>
              </View>
              <Pressable
                onPress={closeModal}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 999,
                  width: 36,
                  height: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#64748b', fontSize: 18, fontWeight: '700' }}>×</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Judul Dokumen</Text>
                <TextInput
                  value={draft?.title || ''}
                  onChangeText={(value) => setDraft((prev) => (prev ? { ...prev, title: value } : prev))}
                  editable={!draft?.isDefault}
                  placeholder="Contoh: Sertifikat Pelatihan, Surat Tugas, atau dokumen pendukung lain"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    color: draft?.isDefault ? '#475569' : '#0f172a',
                    backgroundColor: draft?.isDefault ? '#f8fafc' : '#fff',
                  }}
                />
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  backgroundColor: '#f8fafc',
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Upload Dokumen</Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
                  Format file: PDF, JPG, JPEG, PNG. Ukuran maksimal 2MB per file.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => {
                        void handlePickDocument();
                      }}
                      disabled={!canUpload || isUploading || isSaving}
                      style={{
                        borderWidth: 1,
                        borderColor: '#1d4ed8',
                        backgroundColor: !canUpload || isUploading ? '#bfdbfe' : '#eff6ff',
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                        {isUploading ? 'Mengunggah...' : draft?.fileUrl ? 'Ganti File' : 'Upload File'}
                      </Text>
                    </Pressable>
                  </View>
                  {draft?.fileUrl && onViewDocument ? (
                    <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                      <Pressable
                        onPress={() =>
                          onViewDocument({
                            title: draft.title,
                            fileUrl: draft.fileUrl,
                            category: SUPPORTING_DOCUMENT_CATEGORY,
                          })
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: '#1d4ed8',
                          backgroundColor: '#eff6ff',
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                        }}
                      >
                        <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Lihat</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {draft?.fileUrl ? (
                    <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                      <Pressable
                        onPress={() => setDraft((prev) => (prev ? { ...prev, fileUrl: '', displayName: '' } : prev))}
                        style={{
                          borderWidth: 1,
                          borderColor: '#fecaca',
                          backgroundColor: '#fef2f2',
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                        }}
                      >
                        <Text style={{ color: '#dc2626', fontWeight: '700' }}>Hapus File</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: '#64748b', fontSize: 12 }}>
                  {draft?.displayName || draft?.title || 'Belum ada file terunggah'}
                </Text>
              </View>

              {draftError ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fecaca',
                    backgroundColor: '#fef2f2',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginTop: 12,
                  }}
                >
                  <Text style={{ color: '#b91c1c' }}>{draftError}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pressable
                onPress={closeModal}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: '#fff',
                  marginRight: 8,
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void handleSaveDraft();
                }}
                disabled={isSaving}
                style={{
                  borderWidth: 1,
                  borderColor: '#2563eb',
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: '#2563eb',
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {isSaving ? 'Menyimpan...' : 'Simpan Dokumen Pendukung'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
