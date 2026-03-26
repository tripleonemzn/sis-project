import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { normalizeTeachingResourceProgramCode } from '../../../services/teachingResourceProgram.service';
import LearningResourceGenerator from './LearningResourceGenerator';

const titleFromSlug = (slug: string): string => {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export default function LearningResourceProgramPage() {
  const params = useParams();
  const location = useLocation();

  const slug = useMemo(() => {
    const fromParam = String(params.programCode || '').trim().toLowerCase();
    if (fromParam) return fromParam;

    const pathname = String(location.pathname || '').trim().toLowerCase();
    const segments = pathname.split('/').filter(Boolean);
    const fromPath = String(segments[segments.length - 1] || '').trim().toLowerCase();
    return fromPath;
  }, [location.pathname, params.programCode]);

  const normalizedSlug = useMemo(() => {
    if (slug === 'modules') return 'modul-ajar';
    return slug;
  }, [slug]);

  const editorMode = useMemo<'list' | 'create'>(() => {
    const pathname = String(location.pathname || '').trim().toLowerCase();
    return pathname.endsWith('/new') ? 'create' : 'list';
  }, [location.pathname]);

  const fallbackTitle = titleFromSlug(normalizedSlug || 'program-perangkat-ajar');
  const normalizedCode = normalizeTeachingResourceProgramCode(normalizedSlug || 'CUSTOM_PROGRAM');

  return (
    <LearningResourceGenerator
      type={normalizedCode || 'CUSTOM_PROGRAM'}
      routeSlug={normalizedSlug || 'custom-program'}
      title={fallbackTitle}
      description="Template dokumen mengikuti konfigurasi aktif dari Wakasek Kurikulum."
      editorMode={editorMode}
    />
  );
}
