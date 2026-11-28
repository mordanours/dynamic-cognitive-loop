import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper-2 px-2.5 py-1 text-xs font-semibold text-ink-soft">
        <FileText className="h-3.5 w-3.5 text-clay-600" />
        {filename}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => blobUrl && setZoomed(true)}
        className="group relative overflow-hidden rounded-2xl border border-line bg-paper-2 shadow-soft"
      >
        {blobUrl ? (
          <img src={blobUrl} alt={filename} className="h-24 w-32 object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-24 w-32 items-center justify-center text-ink-faint">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
      </button>

      <AnimatePresence>
        {zoomed && blobUrl && (
          <motion.div
            onClick={() => setZoomed(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.img
              src={blobUrl}
              alt={filename}
              className="max-h-[90vh] max-w-full rounded-2xl shadow-pop"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
