import { useLocalSearchParams } from 'expo-router';
import { HomeroomReportModuleScreen } from '../../../src/features/homeroomReports/HomeroomReportModuleScreen';

function firstParam(value?: string | string[]) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function TeacherHomeroomReportDynamicScreen() {
  const params = useLocalSearchParams<{
    programCode?: string | string[];
    mode?: string | string[];
    label?: string | string[];
  }>();

  const programCode = firstParam(params.programCode);
  const mode = String(firstParam(params.mode) || '').trim().toUpperCase() || undefined;
  const label = firstParam(params.label);

  return (
    <HomeroomReportModuleScreen
      mode={mode}
      fixedProgramCode={programCode}
      fixedProgramLabel={label}
    />
  );
}
