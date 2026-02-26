import { useState } from 'react';

export const EmailPage = () => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="w-full h-[calc(100vh-64px)] bg-white rounded-lg shadow-sm overflow-hidden flex flex-col relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="text-gray-500 text-sm font-medium">Memuat Webmail...</p>
          </div>
        </div>
      )}
      <iframe 
        src="https://mail.siskgb2.id/" 
        className={`w-full flex-1 border-0 transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        title="Webmail"
        allow="clipboard-write"
        onLoad={() => setIsLoading(false)}
      />
    </div>
  );
};
