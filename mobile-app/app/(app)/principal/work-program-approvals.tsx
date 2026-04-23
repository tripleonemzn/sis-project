import { TeacherWorkProgramModuleScreen } from '../../../src/features/workPrograms/TeacherWorkProgramModuleScreen';

export default function PrincipalWorkProgramApprovalsScreen() {
  return (
    <TeacherWorkProgramModuleScreen
      mode="APPROVAL"
      title="Persetujuan Program Kerja"
      subtitle="Tinjau dan tindak lanjuti program kerja yang menunggu persetujuan kepala sekolah."
      allowedRoles={['PRINCIPAL']}
    />
  );
}
