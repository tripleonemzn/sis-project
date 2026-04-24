import { useEffect, useRef, useState } from 'react';
import { Camera, ImageUp, Loader2, ScanLine, Square } from 'lucide-react';
import QrScanner from 'qr-scanner';

type WebQrScannerPanelProps = {
  enabled: boolean;
  busy?: boolean;
  onDetected: (qrToken: string) => void;
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    if (error.message === 'Camera not found.') {
      return 'Kamera tidak ditemukan pada perangkat ini.';
    }
    if (error.message === 'Permission denied') {
      return 'Izin kamera ditolak. Izinkan kamera lalu aktifkan lagi scanner.';
    }
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return 'Scanner QR tidak bisa dijalankan di browser ini.';
}

export default function WebQrScannerPanel({ enabled, busy = false, onDetected }: WebQrScannerPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [imageScanning, setImageScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setCameraActive(false);
      setScannerError(null);
      setHasCamera(null);
      return undefined;
    }

    QrScanner.hasCamera()
      .then((value) => {
        if (!cancelled) setHasCamera(value);
      })
      .catch(() => {
        if (!cancelled) setHasCamera(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !cameraActive || busy || !videoRef.current) return undefined;

    let cancelled = false;
    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        if (cancelled) return;
        onDetected(result.data);
      },
      {
        preferredCamera: 'environment',
        maxScansPerSecond: 10,
        returnDetailedScanResult: true,
        onDecodeError: () => {
          // Noise decode errors are expected while waiting for a QR to enter the frame.
        },
      },
    );
    scannerRef.current = scanner;
    setCameraStarting(true);
    setScannerError(null);

    scanner
      .start()
      .then(() => {
        if (cancelled) return;
        setCameraStarting(false);
        setScannerError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setCameraStarting(false);
        setCameraActive(false);
        setScannerError(toErrorMessage(error));
      });

    return () => {
      cancelled = true;
      setCameraStarting(false);
      scanner.stop();
      scanner.destroy();
      if (scannerRef.current === scanner) {
        scannerRef.current = null;
      }
    };
  }, [busy, cameraActive, enabled, onDetected]);

  useEffect(() => {
    if (enabled) return undefined;
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    return undefined;
  }, [enabled]);

  const handleImageFile = async (file: File | null | undefined) => {
    if (!file) return;
    setImageScanning(true);
    setScannerError(null);
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      onDetected(result.data);
    } catch (error) {
      setScannerError(
        error === QrScanner.NO_QR_CODE_FOUND
          ? 'QR tidak terdeteksi dari gambar. Coba foto ulang dengan lebih jelas.'
          : toErrorMessage(error),
      );
    } finally {
      setImageScanning(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Scanner QR</h3>
          <p className="mt-1 text-sm text-slate-500">
            Gunakan kamera perangkat atau unggah foto QR jika kamera browser tidak tersedia.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-500">
          <ScanLine className="h-4 w-4" />
        </div>
      </div>

      {!enabled ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          Buka sesi scan mandiri terlebih dahulu agar scanner bisa aktif.
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
            <video
              ref={videoRef}
              className={`aspect-[4/3] w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              muted
              playsInline
            />
            {!cameraActive ? (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-200">
                <Camera className="h-10 w-10 text-sky-300" />
                <div>
                  <p className="text-sm font-semibold text-white">
                    {hasCamera === false ? 'Kamera browser tidak tersedia' : 'Kamera siap dipakai untuk scan'}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    {hasCamera === false
                      ? 'Tetap bisa verifikasi QR lewat unggah gambar dari kamera atau screenshot.'
                      : 'Aktifkan kamera saat petugas siap memindai QR siswa.'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || hasCamera === false}
              onClick={() => {
                setScannerError(null);
                setCameraActive((value) => !value);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cameraStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : cameraActive ? <Square className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {cameraActive ? 'Matikan Kamera' : 'Aktifkan Kamera Scan'}
            </button>

            <button
              type="button"
              disabled={busy || imageScanning}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {imageScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
              Unggah Foto QR
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void handleImageFile(event.target.files?.[0]);
              }}
            />
          </div>

          <div className="mt-4 space-y-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Scanner kamera paling stabil di browser HTTPS modern seperti Chrome atau Edge. Jika kamera browser bermasalah, pakai tombol unggah foto QR.
            </div>
            {scannerError ? (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {scannerError}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
