import { useEffect, useState } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { getStoredToken } from '../api';

interface Props {
  fileId: string;
  filename: string;
  isImage: number;
}

export function AuthImage({ fileId, filename, isImage }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let active = true;
    let createdUrl = '';
    const token = getStoredToken();
    fetch(`/api/files/${fileId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob && active) {
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [fileId, isImage]);

  if (!isImage) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300">
        <FileText className="h-3 w-3 text-indigo-400" />
        {filename}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => blobUrl && setZoomed(true)}
        className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
      >
        {blobUrl ? (
          <img src={blobUrl} alt={filename} className="h-24 w-32 object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-24 w-32 items-center justify-center text-slate-500">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
      </button>

      {zoomed && blobUrl && (
        <div
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <img src={blobUrl} alt={filename} className="max-h-[90vh] max-w-full rounded-xl shadow-2xl" />
        </div>
      )}
    </>
  );
}
