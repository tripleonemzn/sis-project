import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';

const DEFAULT_SCHOOL_PRINT_ADDRESS = 'Jl. Anggrek 1, Duren Jaya Bekasi Timur';
const SCHOOL_PRINT_ADDRESS_STORAGE_KEY = 'teacher-homeroom-report-school-address';

export function usePersistentSchoolPrintAddress() {
  const [savedPrintSchoolAddress, setSavedPrintSchoolAddress] = useState(DEFAULT_SCHOOL_PRINT_ADDRESS);
  const [printSchoolAddress, setPrintSchoolAddressState] = useState(DEFAULT_SCHOOL_PRINT_ADDRESS);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedAddress = String(window.localStorage.getItem(SCHOOL_PRINT_ADDRESS_STORAGE_KEY) || '').trim();
    const resolvedAddress = savedAddress || DEFAULT_SCHOOL_PRINT_ADDRESS;
    setSavedPrintSchoolAddress(resolvedAddress);
    setPrintSchoolAddressState(resolvedAddress);
  }, []);

  const setPrintSchoolAddress = (value: string) => {
    const normalizedValue = String(value || '').slice(0, 200);
    setPrintSchoolAddressState(normalizedValue);
  };

  const savePrintSchoolAddress = () => {
    const normalizedValue = String(printSchoolAddress || '').trim().slice(0, 200);
    if (typeof window === 'undefined') return;
    if (normalizedValue.trim()) {
      window.localStorage.setItem(SCHOOL_PRINT_ADDRESS_STORAGE_KEY, normalizedValue);
      setSavedPrintSchoolAddress(normalizedValue);
      setPrintSchoolAddressState(normalizedValue);
      toast.success('Alamat sekolah berhasil disimpan.');
      return;
    }

    window.localStorage.removeItem(SCHOOL_PRINT_ADDRESS_STORAGE_KEY);
    setSavedPrintSchoolAddress(DEFAULT_SCHOOL_PRINT_ADDRESS);
    setPrintSchoolAddressState(DEFAULT_SCHOOL_PRINT_ADDRESS);
    toast.success('Alamat sekolah dikembalikan ke alamat default.');
  };

  const hasUnsavedChanges = useMemo(
    () => String(printSchoolAddress || '').trim() !== String(savedPrintSchoolAddress || '').trim(),
    [printSchoolAddress, savedPrintSchoolAddress],
  );

  return {
    printSchoolAddress,
    setPrintSchoolAddress,
    savePrintSchoolAddress,
    hasUnsavedChanges,
    defaultSchoolPrintAddress: DEFAULT_SCHOOL_PRINT_ADDRESS,
  };
}
