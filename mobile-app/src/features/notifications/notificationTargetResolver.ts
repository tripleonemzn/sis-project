function normalizeTeacherExamEditorRoute(route: string): string | null {
  const trimmed = String(route || '').trim();
  if (!trimmed.startsWith('/teacher/exams/')) return null;

  const [pathname, rawQuery = ''] = trimmed.split('?');
  const match = pathname.match(/^\/teacher\/exams\/(\d+)\/edit$/);
  if (!match) return null;

  const packetId = Number(match[1]);
  if (!Number.isFinite(packetId) || packetId <= 0) return null;

  const params = new URLSearchParams(rawQuery);
  const nextParams = new URLSearchParams();
  nextParams.set('packetId', String(packetId));

  const questionId = String(params.get('questionId') || '').trim();
  if (questionId) {
    nextParams.set('questionId', questionId);
    nextParams.set('section', 'QUESTIONS');
  } else if (String(params.get('section') || '').trim()) {
    nextParams.set('section', String(params.get('section') || '').trim().toUpperCase());
  }

  return `/teacher/exams/editor?${nextParams.toString()}`;
}

function normalizeCurriculumExamRoute(route: string): string | null {
  const trimmed = String(route || '').trim();
  if (!trimmed.startsWith('/teacher/wakasek/exams')) return null;

  const [, rawQuery = ''] = trimmed.split('?');
  const params = new URLSearchParams(rawQuery);
  const nextParams = new URLSearchParams();

  const section = String(params.get('section') || '').trim().toLowerCase();
  if (section) nextParams.set('section', section);

  const reviewPacketId = String(params.get('reviewPacketId') || '').trim();
  if (reviewPacketId) nextParams.set('reviewPacketId', reviewPacketId);

  const questionId = String(params.get('questionId') || '').trim();
  if (questionId) nextParams.set('questionId', questionId);

  const jadwalProgram = String(params.get('jadwalProgram') || '').trim().toUpperCase();
  if (jadwalProgram) nextParams.set('jadwalProgram', jadwalProgram);

  const query = nextParams.toString();
  return query ? `/teacher/wakakur-exams?${query}` : '/teacher/wakakur-exams';
}

export function resolveMobileNotificationTarget(route: unknown): string {
  const rawRoute = typeof route === 'string' ? route.trim() : '';
  if (!rawRoute.startsWith('/')) return '/notifications';
  if (rawRoute.startsWith('/web-module/')) return '/notifications';

  const teacherExamEditorTarget = normalizeTeacherExamEditorRoute(rawRoute);
  if (teacherExamEditorTarget) return teacherExamEditorTarget;

  const curriculumExamTarget = normalizeCurriculumExamRoute(rawRoute);
  if (curriculumExamTarget) return curriculumExamTarget;

  return rawRoute;
}
