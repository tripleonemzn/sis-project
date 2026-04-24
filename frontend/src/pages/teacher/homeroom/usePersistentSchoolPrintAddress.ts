import { useEffect, useState } from 'react';

const DEFAULT_SCHOOL_PRINT_ADDRESS = 'Jl. Anggrek 1, Duren Jaya Bekasi Timur';
const SCHOOL_PRINT_ADDRESS_STORAGE_KEY = 'teacher-homeroom-report-school-address';

export function usePersistentSchoolPrintAddress() {
  const [printSchoolAddress, setPrintSchoolAddressState] = useState(DEFAULT_SCHOOL_PRINT_ADDRESS);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedAddress = String(window.localStorage.getItem(SCHOOL_PRINT_ADDRESS_STORAGE_KEY) || '').trim();
    if (savedAddress) {
      setPrintSchoolAddressState(savedAddress);
    }
  }, []);

  const setPrintSchoolAddress = (value: string) => {
    const normalizedValue = String(value || '').slice(0, 200);
    setPrintSchoolAddressState(normalizedValue);

    if (typeof window === 'undefined') return;
    if (normalizedValue.trim()) {
      window.localStorage.setItem(SCHOOL_PRINT_ADDRESS_STORAGE_KEY, normalizedValue);
      return;
    }
    window.localStorage.removeItem(SCHOOL_PRINT_ADDRESS_STORAGE_KEY);
  };

  return {
    printSchoolAddress,
    setPrintSchoolAddress,
    defaultSchoolPrintAddress: DEFAULT_SCHOOL_PRINT_ADDRESS,
  };
}
