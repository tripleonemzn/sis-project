import { Pressable, Text, TextInput, View } from 'react-native';
import {
  getAllowedDocumentKindsForLevel,
  getEducationDocumentLabel,
  getEducationInstitutionLabel,
  getEducationLevelLabel,
  levelUsesHigherEducationFields,
  type ProfileEducationDocumentKind,
  type ProfileEducationHistory,
  type ProfileEducationLevel,
  type ProfileEducationTrack,
} from './profileEducation';

type ProfileEducationEditorProps = {
  track: ProfileEducationTrack;
  histories: ProfileEducationHistory[];
  uploadingKey?: string | null;
  onHistoryChange: (
    level: ProfileEducationLevel,
    field: 'institutionName' | 'faculty' | 'studyProgram' | 'gpa' | 'degree',
    value: string,
  ) => void;
  onPickDocument: (level: ProfileEducationLevel, kind: ProfileEducationDocumentKind) => void | Promise<void>;
  onRemoveDocument: (level: ProfileEducationLevel, kind: ProfileEducationDocumentKind) => void;
  onViewDocument?: (level: ProfileEducationLevel, kind: ProfileEducationDocumentKind) => void;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
}) {
  const editable = typeof onChangeText === 'function';
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: '#0f172a',
          backgroundColor: editable ? '#fff' : '#f8fafc',
        }}
      />
    </View>
  );
}

export function ProfileEducationEditor({
  track,
  histories,
  uploadingKey,
  onHistoryChange,
  onPickDocument,
  onRemoveDocument,
  onViewDocument,
}: ProfileEducationEditorProps) {
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
        <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>Ketentuan Upload Riwayat Pendidikan</Text>
        <Text style={{ color: '#1d4ed8', fontSize: 12, lineHeight: 18 }}>
          Setiap dokumen hanya menerima format PDF, JPG, JPEG, atau PNG dengan ukuran maksimal 500KB.
          Jika file tidak sesuai, aplikasi akan menampilkan peringatan yang jelas sebelum upload dilanjutkan.
        </Text>
      </View>

      {histories.map((history) => {
        const higherEducationFields = levelUsesHigherEducationFields(history.level);
        const documentKinds = getAllowedDocumentKindsForLevel(track, history.level);

        return (
          <View
            key={history.level}
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <Field label="Jenjang" value={getEducationLevelLabel(history.level)} />
            <Field
              label={getEducationInstitutionLabel(history.level)}
              value={history.institutionName}
              onChangeText={(value) => onHistoryChange(history.level, 'institutionName', value)}
              placeholder={higherEducationFields ? 'Masukkan nama perguruan tinggi' : 'Masukkan nama sekolah'}
            />

            {higherEducationFields ? (
              <>
                <Field
                  label="Fakultas"
                  value={history.faculty}
                  onChangeText={(value) => onHistoryChange(history.level, 'faculty', value)}
                  placeholder="Masukkan nama fakultas"
                />
                <Field
                  label="Program Studi/Jurusan"
                  value={history.studyProgram}
                  onChangeText={(value) => onHistoryChange(history.level, 'studyProgram', value)}
                  placeholder="Masukkan program studi atau jurusan"
                />
                <Field
                  label="IPK"
                  value={history.gpa}
                  onChangeText={(value) => onHistoryChange(history.level, 'gpa', value)}
                  placeholder="Contoh: 3.72"
                />
                <Field
                  label="Gelar Akademik"
                  value={history.degree}
                  onChangeText={(value) => onHistoryChange(history.level, 'degree', value)}
                  placeholder="Contoh: S.Kom., S.Pd., M.M."
                />
              </>
            ) : null}

            <View style={{ marginTop: 6 }}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Upload Dokumen</Text>
              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
                Format file: PDF, JPG, JPEG, PNG. Ukuran maksimal 500KB per file.
              </Text>

              {documentKinds.map((kind) => {
                const document = history.documents.find((item) => item.kind === kind);
                const slotKey = `${history.level}:${kind}`;
                const isUploading = uploadingKey === slotKey;

                return (
                  <View
                    key={kind}
                    style={{
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      backgroundColor: '#f8fafc',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
                      {getEducationDocumentLabel(kind)}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                      <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          onPress={() => {
                            void onPickDocument(history.level, kind);
                          }}
                          disabled={isUploading}
                          style={{
                            borderWidth: 1,
                            borderColor: '#1d4ed8',
                            backgroundColor: isUploading ? '#bfdbfe' : '#eff6ff',
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 9,
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                            {isUploading ? 'Mengunggah...' : document ? 'Ganti File' : 'Upload File'}
                          </Text>
                        </Pressable>
                      </View>
                      {document ? (
                        <>
                          {onViewDocument ? (
                            <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                              <Pressable
                                onPress={() => onViewDocument(history.level, kind)}
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
                          <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                            <Pressable
                              onPress={() => onRemoveDocument(history.level, kind)}
                              style={{
                                borderWidth: 1,
                                borderColor: '#fecaca',
                                backgroundColor: '#fef2f2',
                                borderRadius: 10,
                                paddingHorizontal: 12,
                                paddingVertical: 9,
                              }}
                            >
                              <Text style={{ color: '#dc2626', fontWeight: '700' }}>Hapus</Text>
                            </Pressable>
                          </View>
                        </>
                      ) : null}
                    </View>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>
                      {document?.originalName || document?.label || 'Belum ada file terunggah'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
