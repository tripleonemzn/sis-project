import { useLocalSearchParams } from 'expo-router';
import { TeacherWorkProgramModuleScreen } from '../../../src/features/workPrograms/TeacherWorkProgramModuleScreen';
import { formatWorkProgramDutyLabel, normalizeDutyCode } from '../../../src/features/workPrograms/advisorDuty';

export default function TeacherWorkProgramScreen() {
  const params = useLocalSearchParams<{ duty?: string }>();
  const forcedDuty = normalizeDutyCode(params.duty);
  const title = forcedDuty ? `Program Kerja ${formatWorkProgramDutyLabel(forcedDuty)}` : 'Program Kerja';
  const subtitle = forcedDuty
    ? `Monitoring dan evaluasi program kerja untuk ${formatWorkProgramDutyLabel(forcedDuty)}.`
    : 'Monitoring dan evaluasi program kerja tugas tambahan Anda.';

  return (
    <TeacherWorkProgramModuleScreen
      mode="OWNER"
      title={title}
      subtitle={subtitle}
      forcedDuty={forcedDuty || null}
    />
  );
}
