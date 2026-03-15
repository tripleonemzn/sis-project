import { TeacherLearningResourceProgramScreen } from '../../../src/features/learningResources/TeacherLearningResourceProgramScreen';

export default function TeacherLearningPromesScreen() {
  return (
    <TeacherLearningResourceProgramScreen
      programCode="PROMES"
      fallbackTitle="Program Semester"
      fallbackDescription="Kelola perencanaan pembelajaran semester agar terukur dan sinkron."
      icon="clock"
    />
  );
}
