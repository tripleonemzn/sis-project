import { TeacherHomeroomFinalPage } from './TeacherHomeroomFinalPage';

interface TeacherHomeroomSasPageProps {
  programCode?: string;
  programBaseType?: string;
  programLabel?: string;
}

export const TeacherHomeroomSasPage = (props: TeacherHomeroomSasPageProps) => {
  return (
    <TeacherHomeroomFinalPage
      {...props}
      fixedSemester="ODD"
      preferenceScope={props.programCode || props.programBaseType || 'FINAL_ODD'}
    />
  );
};
