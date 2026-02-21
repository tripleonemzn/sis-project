import { Redirect, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { useAuth } from '../auth/AuthProvider';

type QuickAction = {
  label: string;
  description?: string;
  route?: string;
};

function normalizeDuty(value?: string) {
  return String(value || '').trim().toUpperCase();
}

function hasAnyDuty(userDuties: string[] | undefined, expectedDuties: string[]) {
  const owned = new Set((userDuties || []).map((item) => normalizeDuty(item)));
  return expectedDuties.some((item) => owned.has(normalizeDuty(item)));
}

export function TeacherWebBridgeModuleScreen({
  title,
  subtitle,
  icon,
  expectedDuties,
  requireTrainingClass = false,
  helperTitle = 'Status Parity',
  helperDescription = 'Di web, modul ini masih tahap pengembangan (placeholder). Mobile menampilkan status parity yang sama.',
  quickActions = [],
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  expectedDuties?: string[];
  requireTrainingClass?: boolean;
  helperTitle?: string;
  helperDescription?: string;
  quickActions?: QuickAction[];
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const roleAllowed = user?.role === 'TEACHER';
  const dutyAllowed = !expectedDuties?.length || hasAnyDuty(user?.additionalDuties, expectedDuties);
  const trainingAllowed = !requireTrainingClass || (user?.trainingClassesTeaching?.length || 0) > 0;
  const isAllowed = !!roleAllowed && !!dutyAllowed && !!trainingAllowed;

  const runQuickAction = async (action: QuickAction) => {
    if (action.route) {
      router.push(action.route as never);
      return;
    }
    Alert.alert('Info', 'Aksi belum tersedia.');
  };

  if (isLoading) return <AppLoadingScreen message={`Memuat ${title.toLowerCase()}...`} />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!roleAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
        <QueryStateView type="error" message="Anda belum memiliki akses ke modul ini." />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
      <View
        style={{
          backgroundColor: '#1e3a8a',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.4)',
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Feather name={icon} size={18} color="#e2e8f0" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: '#dbeafe', marginTop: 2 }}>{subtitle}</Text>
        </View>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>{helperTitle}</Text>
        <Text style={{ color: '#475569', lineHeight: 20 }}>{helperDescription}</Text>
      </View>

      {quickActions.length > 0 ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Aksi Cepat</Text>
          {quickActions.map((action) => (
            <Pressable
              key={action.label}
              onPress={() => {
                void runQuickAction(action);
              }}
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                backgroundColor: '#fff',
                paddingHorizontal: 10,
                paddingVertical: 10,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{action.label}</Text>
              {action.description ? (
                <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>{action.description}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <View
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderStyle: 'dashed',
          borderRadius: 10,
          backgroundColor: '#fff',
          paddingVertical: 12,
          paddingHorizontal: 12,
        }}
      >
        <Text style={{ color: '#334155', textAlign: 'center' }}>
          Fitur operasional detail belum tersedia di web maupun mobile untuk modul ini.
        </Text>
      </View>
    </ScrollView>
  );
}
