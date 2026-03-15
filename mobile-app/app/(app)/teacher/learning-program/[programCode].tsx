import { useLocalSearchParams } from 'expo-router';
import { TeacherLearningResourceProgramScreen } from '../../../../src/features/learningResources/TeacherLearningResourceProgramScreen';

function toTitle(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export default function TeacherLearningProgramDynamicScreen() {
  const params = useLocalSearchParams<{ programCode?: string | string[]; label?: string | string[]; code?: string | string[] }>();

  const programCodeParam = Array.isArray(params.code)
    ? params.code[0]
    : params.code || (Array.isArray(params.programCode) ? params.programCode[0] : params.programCode) || 'CUSTOM';
  const labelParam = Array.isArray(params.label) ? params.label[0] : params.label;
  const fallbackTitle = String(labelParam || '').trim() || toTitle(String(programCodeParam || 'Program Perangkat Ajar'));

  return (
    <TeacherLearningResourceProgramScreen
      programCode={String(programCodeParam || '').trim() || 'CUSTOM'}
      fallbackTitle={fallbackTitle}
      fallbackDescription="Kelola dokumen perangkat ajar sesuai konfigurasi program aktif."
      icon="layers"
    />
  );
}
