import { TeacherLearningResourceProgramScreen } from '../../../src/features/learningResources/TeacherLearningResourceProgramScreen';

export default function TeacherLearningAtpScreen() {
  return (
    <TeacherLearningResourceProgramScreen
      programCode="ATP"
      fallbackTitle="Alur Tujuan Pembelajaran (ATP)"
      fallbackDescription="Kelola alur tujuan pembelajaran berdasarkan konteks pengajaran aktif."
      icon="map"
    />
  );
}
