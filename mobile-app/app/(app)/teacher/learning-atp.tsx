import { TeacherLearningResourceProgramScreen } from '../../../src/features/learningResources/TeacherLearningResourceProgramScreen';

export default function TeacherLearningAtpScreen() {
  return (
    <TeacherLearningResourceProgramScreen
      programCode="ATP"
      fallbackTitle="Perangkat Ajar ATP"
      fallbackDescription="Kelola alur tujuan pembelajaran berdasarkan konteks pengajaran aktif."
      icon="map"
    />
  );
}
