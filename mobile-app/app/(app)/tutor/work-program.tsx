import { useLocalSearchParams } from 'expo-router';
import { TeacherWorkProgramModuleScreen } from '../../../src/features/workPrograms/TeacherWorkProgramModuleScreen';
import {
  getAdvisorDutyMeta,
  resolveTutorAdvisorDuty,
} from '../../../src/features/workPrograms/advisorDuty';

export default function TutorWorkProgramScreen() {
  const params = useLocalSearchParams<{ duty?: string }>();
  const forcedDuty = resolveTutorAdvisorDuty(params.duty);
  const advisorDutyMeta = getAdvisorDutyMeta(forcedDuty);

  return (
    <TeacherWorkProgramModuleScreen
      mode="OWNER"
      title={advisorDutyMeta?.workProgramTitle || 'Program Kerja'}
      subtitle={
        advisorDutyMeta?.workProgramSubtitle ||
        'Kelola program kerja, pengajuan alat, dan LPJ program kerja pembina.'
      }
      allowedRoles={['TEACHER', 'EXTRACURRICULAR_TUTOR']}
      forcedDuty={forcedDuty}
    />
  );
}
