import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { BRAND_COLORS } from '../config/brand';

type MobileActiveAcademicYearNoticeProps = {
  name?: string | null;
  semester?: 'ODD' | 'EVEN' | string | null;
  helperText?: string;
};

function resolveSemesterLabel(value?: 'ODD' | 'EVEN' | string | null) {
  if (value === 'EVEN') return 'Semester Genap';
  if (value === 'ODD') return 'Semester Ganjil';
  return '';
}

export function MobileActiveAcademicYearNotice({
  name,
  semester,
  helperText = 'Semua data operasional di halaman ini otomatis mengikuti tahun ajaran aktif yang tampil di header aplikasi.',
}: MobileActiveAcademicYearNoticeProps) {
  const semesterLabel = resolveSemesterLabel(semester);

  return (
    <View
      style={{
        backgroundColor: '#eff6ff',
        borderWidth: 1,
        borderColor: '#bfdbfe',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Feather name="calendar" size={18} color={BRAND_COLORS.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
                color: '#1d4ed8',
                marginRight: 8,
              }}
            >
              Tahun Ajaran Aktif
            </Text>
            <View
              style={{
                backgroundColor: '#dcfce7',
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
                marginRight: 6,
                marginBottom: 4,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803d' }}>Aktif</Text>
            </View>
            {semesterLabel ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#bfdbfe',
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  marginBottom: 4,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#1d4ed8' }}>{semesterLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_COLORS.textDark }}>{name || '-'}</Text>
          <Text style={{ fontSize: 11, lineHeight: 18, color: '#1e40af', marginTop: 4 }}>{helperText}</Text>
        </View>
      </View>
    </View>
  );
}

export default MobileActiveAcademicYearNotice;
