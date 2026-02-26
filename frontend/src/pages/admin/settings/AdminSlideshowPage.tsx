import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { slideshowService, type SlideshowSlide } from '../../../services/slideshow.service';

type SlideDraft = {
  description: string;
  isActive: boolean;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } }; message?: string };
    return anyErr.response?.data?.message || anyErr.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const resolveSlideUrl = (url: string) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === 'undefined') return url;

  const port = window.location.port;
  const host = window.location.hostname;
  if ((port === '5173' || port === '4173') && url.startsWith('/foto_kegiatan/')) {
    return `http://${host}:3000${url}`;
  }

  return url;
};

export const AdminSlideshowPage = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [draftById, setDraftById] = useState<Record<string, SlideDraft>>({});
  const [slideIntervalSeconds, setSlideIntervalSeconds] = useState<number>(3.5);

  const slideshowQuery = useQuery({
    queryKey: ['admin-slideshow'],
    queryFn: () => slideshowService.listSlides(),
  });

  const slides = useMemo(
    () => [...(slideshowQuery.data?.data?.slides || [])].sort((a, b) => a.order - b.order),
    [slideshowQuery.data?.data?.slides],
  );

  useEffect(() => {
    const rawMs = slideshowQuery.data?.data?.settings?.slideIntervalMs;
    if (typeof rawMs === 'number' && Number.isFinite(rawMs) && rawMs > 0) {
      setSlideIntervalSeconds(Number((rawMs / 1000).toFixed(1)));
    }
  }, [slideshowQuery.data?.data?.settings?.slideIntervalMs]);

  useEffect(() => {
    setDraftById((prev) => {
      const next: Record<string, SlideDraft> = {};
      for (const slide of slides) {
        const current = prev[slide.id];
        next[slide.id] = current || {
          description: slide.description || '',
          isActive: slide.isActive !== false,
        };
      }
      return next;
    });
  }, [slides]);

  const hasDraftChanges = (slide: SlideshowSlide) => {
    const draft = draftById[slide.id];
    if (!draft) return false;
    return draft.description.trim() !== (slide.description || '').trim() || draft.isActive !== (slide.isActive !== false);
  };

  const refreshSlides = async () => {
    await slideshowQuery.refetch();
  };

  const handleUploadSlide = async () => {
    if (!uploadFile) {
      toast.error('Pilih foto slideshow terlebih dahulu.');
      return;
    }
    if (pendingActionKey) return;

    setPendingActionKey('upload');
    try {
      await slideshowService.uploadSlide(uploadFile, { description: uploadDescription.trim() });
      toast.success('Slide berhasil ditambahkan.');
      setUploadFile(null);
      setUploadDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshSlides();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingActionKey(null);
    }
  };

  const handleSaveSlide = async (slide: SlideshowSlide) => {
    const draft = draftById[slide.id];
    if (!draft || pendingActionKey) return;

    setPendingActionKey(`save-${slide.id}`);
    try {
      await slideshowService.updateSlide(slide.id, {
        description: draft.description.trim(),
        isActive: draft.isActive,
      });
      toast.success('Perubahan slide tersimpan.');
      await refreshSlides();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingActionKey(null);
    }
  };

  const handleResetDraft = (slide: SlideshowSlide) => {
    setDraftById((prev) => ({
      ...prev,
      [slide.id]: {
        description: slide.description || '',
        isActive: slide.isActive !== false,
      },
    }));
  };

  const handleMoveSlide = async (slideId: string, direction: 'UP' | 'DOWN') => {
    if (pendingActionKey) return;
    const currentIndex = slides.findIndex((item) => item.id === slideId);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    const reorderedIds = slides.map((item) => item.id);
    const [picked] = reorderedIds.splice(currentIndex, 1);
    reorderedIds.splice(targetIndex, 0, picked);

    setPendingActionKey(`reorder-${slideId}`);
    try {
      await slideshowService.reorderSlides(reorderedIds);
      toast.success('Urutan slideshow diperbarui.');
      await refreshSlides();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingActionKey(null);
    }
  };

  const handleDeleteSlide = async (slide: SlideshowSlide) => {
    const confirmed = window.confirm(`Hapus slide "${slide.filename}"?`);
    if (!confirmed || pendingActionKey) return;

    setPendingActionKey(`delete-${slide.id}`);
    try {
      await slideshowService.deleteSlide(slide.id);
      toast.success('Slide berhasil dihapus.');
      await refreshSlides();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingActionKey(null);
    }
  };

  const activeCount = slides.filter((slide) => slide.isActive !== false).length;

  const handleSaveSettings = async () => {
    if (pendingActionKey) return;
    const seconds = Number(slideIntervalSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      toast.error('Durasi slide harus lebih dari 0 detik.');
      return;
    }
    const ms = Math.round(seconds * 1000);
    setPendingActionKey('save-settings');
    try {
      await slideshowService.updateSettings({ slideIntervalMs: ms });
      toast.success('Pengaturan durasi slide berhasil disimpan.');
      await refreshSlides();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPendingActionKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Slideshow</h1>
        <p className="text-gray-500 text-sm">
          Kelola foto dan deskripsi slideshow untuk halaman login web dan welcome mobile.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">Tambah Slide Baru</h2>
        </div>
        <p className="text-sm text-gray-500">
          Jumlah slide bersifat dinamis. Anda bisa menambah lebih dari 16 gambar sesuai kebutuhan.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-dashed border-gray-200 rounded-lg p-3 mt-1">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Durasi Slide Foto</label>
            <p className="text-xs text-gray-500">
              Atur jeda pergantian foto di halaman login web & welcome mobile (dalam detik).
            </p>
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              type="number"
              min={1}
              max={30}
              step={0.5}
              value={slideIntervalSeconds}
              onChange={(e) => setSlideIntervalSeconds(Number(e.target.value) || 0)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <span className="text-sm text-gray-600">detik per foto</span>
            <button
              type="button"
              onClick={() => {
                setSlideIntervalSeconds(3.5);
              }}
              className="ml-2 text-xs text-gray-500 underline"
            >
              Reset ke 3.5
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSaveSettings();
              }}
              disabled={pendingActionKey === 'save-settings'}
              className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition disabled:opacity-60"
            >
              {pendingActionKey === 'save-settings' && <Loader2 className="w-3 h-3 animate-spin" />}
              Simpan Durasi
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Slide</label>
            <textarea
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="Deskripsi foto slideshow..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">File Gambar</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setUploadFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 font-medium bg-white hover:bg-gray-50 transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
              {uploadFile ? 'Ganti Foto' : 'Pilih Foto'}
            </button>
            <div className="text-xs text-gray-500 min-h-4">
              {uploadFile ? uploadFile.name : 'Format: JPG/JPEG/PNG/WEBP, max 5MB'}
            </div>
            <button
              type="button"
              onClick={() => {
                void handleUploadSlide();
              }}
              disabled={pendingActionKey !== null}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {pendingActionKey === 'upload' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Upload Slide
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Daftar Slide</h2>
            <p className="text-sm text-gray-500">
              Total {slides.length} slide • {activeCount} aktif
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void refreshSlides();
            }}
            disabled={slideshowQuery.isFetching}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <RefreshCcw className={`w-4 h-4 ${slideshowQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {slideshowQuery.isLoading ? (
          <div className="h-44 flex items-center justify-center text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Memuat data slideshow...
          </div>
        ) : slideshowQuery.isError ? (
          <div className="h-44 flex flex-col items-center justify-center text-gray-500 gap-3">
            <p>Gagal memuat data slideshow.</p>
            <button
              type="button"
              onClick={() => {
                void refreshSlides();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
              Coba Lagi
            </button>
          </div>
        ) : slides.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-gray-500">
            Belum ada data slideshow.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {slides.map((slide) => {
              const draft = draftById[slide.id] || {
                description: slide.description || '',
                isActive: slide.isActive !== false,
              };
              const isDirty = hasDraftChanges(slide);
              const isSaving = pendingActionKey === `save-${slide.id}`;
              const isDeleting = pendingActionKey === `delete-${slide.id}`;
              const isReordering = pendingActionKey === `reorder-${slide.id}`;

              return (
                <div key={slide.id} className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-1">
                    <img
                      src={resolveSlideUrl(slide.url)}
                      alt={slide.description || slide.filename}
                      className="w-full h-44 object-cover rounded-lg border border-gray-200 bg-gray-50"
                      loading="lazy"
                    />
                    <div className="mt-2 text-xs text-gray-500">
                      Urutan #{slide.order + 1} • {slide.filename}
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-3">
                    <textarea
                      value={draft.description}
                      onChange={(e) =>
                        setDraftById((prev) => ({
                          ...prev,
                          [slide.id]: {
                            ...draft,
                            description: e.target.value,
                          },
                        }))
                      }
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Deskripsi slide..."
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDraftById((prev) => ({
                            ...prev,
                            [slide.id]: {
                              ...draft,
                              isActive: true,
                            },
                          }))
                        }
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                          draft.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                        Aktif
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftById((prev) => ({
                            ...prev,
                            [slide.id]: {
                              ...draft,
                              isActive: false,
                            },
                          }))
                        }
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                          !draft.isActive
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <EyeOff className="w-4 h-4" />
                        Nonaktif
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleMoveSlide(slide.id, 'UP');
                        }}
                        disabled={pendingActionKey !== null || slide.order === 0}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <ArrowUp className="w-4 h-4" />
                        Naik
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleMoveSlide(slide.id, 'DOWN');
                        }}
                        disabled={pendingActionKey !== null || slide.order === slides.length - 1}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <ArrowDown className="w-4 h-4" />
                        Turun
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveSlide(slide);
                        }}
                        disabled={pendingActionKey !== null || !isDirty}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-blue-600 text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetDraft(slide)}
                        disabled={pendingActionKey !== null || !isDirty}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <RefreshCcw className="w-4 h-4" />
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteSlide(slide);
                        }}
                        disabled={pendingActionKey !== null}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {isDeleting || isReordering ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSlideshowPage;
