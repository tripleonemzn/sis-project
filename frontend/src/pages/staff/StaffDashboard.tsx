import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../../services/auth.service';
import StaffAdministrationWorkspace from './StaffAdministrationWorkspace';
import StaffFinanceWorkspace from './StaffFinanceWorkspace';
import HeadTuWorkspace from './HeadTuWorkspace';
import InventoryHubPage from '../teacher/wakasek/sarpras/InventoryHubPage';
import { InventoryDetailPage } from '../teacher/wakasek/sarpras/InventoryDetailPage';
import StudentOsisElectionPage from '../student/StudentOsisElectionPage';
import { resolveStaffDivision } from '../../utils/staffRole';

export const StaffDashboard = () => {
  const location = useLocation();
  const { data: meResponse, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMeSafe,
    staleTime: 1000 * 60 * 5,
  });

  const currentUser = meResponse?.data as
    | {
        ptkType?: string | null;
        additionalDuties?: string[] | null;
      }
    | undefined;

  if (location.pathname.startsWith('/staff/assigned-inventory/')) {
    return <InventoryDetailPage />;
  }

  if (location.pathname.startsWith('/staff/assigned-inventory')) {
    return <InventoryHubPage />;
  }

  if (location.pathname.startsWith('/staff/osis')) {
    return <StudentOsisElectionPage />;
  }

  if (isLoading && !currentUser) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-gray-500">
        Memuat workspace staff...
      </div>
    );
  }

  if (isError && !currentUser) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-rose-600">
        Gagal memuat profil staff.
      </div>
    );
  }

  const staffDivision = resolveStaffDivision(currentUser);

  if (staffDivision === 'ADMINISTRATION') {
    return <StaffAdministrationWorkspace />;
  }

  if (staffDivision === 'HEAD_TU') {
    return <HeadTuWorkspace />;
  }

  return <StaffFinanceWorkspace />;
};

export default StaffDashboard;
