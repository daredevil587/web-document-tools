import { useState, useRef, useCallback } from 'react';
import { imagesToPdf, FREE_FILE_LIMIT_MB, FREE_FILE_COUNT } from '../../lib/jpg-to-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type State = 'upload' | 'ready' | 'processing' | 'done' | 'error';
const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

interface ImageFile {
  file: File;
  preview: string;
}

export default function JpgToPdfTool() {
  const [state, setState] = useState<State>('upload');
  const [images, setImages] = useState<ImageFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dropZoneDrag, setDropZoneDrag] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const readPreview = (file: File): Promise<string> =>
    new Promise(res => {
      const r = new FileReader();
      r.onload = e => res(e.target!.result as string);
      r.readAsDataURL(file);
    });

  const addFiles = useCallback(async (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles)
      .filter(f => f.type.startsWith('image/'))
      .slice(0, FREE_FILE_COUNT);
    if (!arr.length) return;
    const withPreviews = await Promise.all(
      arr.map(async f => ({ file: f, preview: await readPreview(f) }))
    );
    setImages(prev => [...prev, ...withPreviews].slice(0, FREE_FILE_COUNT));
    setState('ready');
  }, []);

  const removeImage = (idx: number) => {
    setImages(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (!next.length) setState('upload');
      return next;
    });
  };

  // ---- Drag-to-reorder ----
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && idx !== dragIdx) setDropIdx(idx);
  };
  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDropIdx(null); return; }
    setImages(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(targetIdx, 0, moved);
      return arr;
    });
    setDragIdx(null);
    setDropIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDropIdx(null); };

  const run = async () => {
    if (!images.length) return;
    setState('processing');
    setProgress(0);
    try {
      const blob = await imagesToPdf(images.map(i => i.file), (pct, msg) => {
        setProgress(pct); setProgressMsg(msg);
      });
      setResultBlob(blob);
      setState('done');
      triggerDownload(blob, 'images.pdf');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not convert images to PDF.');
      setState('error');
    }
  };

  const reset = () => { setImages([]); setResultBlob(null); setErrorMsg(''); setState('upload'); };

  return (
    <div>
      {(state === 'upload' || state === 'ready') && (
        <>
          <div
            className={`upload-area${dropZoneDrag ? ' dragover' : ''}`}
            style={{ marginBottom: images.length ? '20px' : 0 }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDropZoneDrag(true); }}
            onDragLeave={() => setDropZoneDrag(false)}
            onDrop={e => { e.preventDefault(); setDropZoneDrag(false); addFiles(e.dataTransfer.files); }}
          >
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#6366f1" strokeWidth="2"/>
                <circle cx="8.5" cy="8.5" r="1.5" stroke="#6366f1" strokeWidth="2"/>
                <polyline points="21 15 16 10 5 21" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>{images.length ? 'Add More Images' : 'Drag & Drop images here'}</h3>
            <p className="upload-sub">JPG, PNG, WebP accepted</p>
            <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden
              onChange={e => e.target.files && addFiles(e.target.files)} />
            <button className="btn-upload" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>
              {images.length ? '+ Add More Images' : 'Choose Images'}
            </button>
            <p className="file-limit">Max {FREE_FILE_COUNT} images · {FREE_FILE_LIMIT_MB} MB each</p>
          </div>

          {images.length > 0 && (
            <>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                <strong>Drag thumbnails to reorder</strong> · {images.length} image{images.length !== 1 ? 's' : ''} selected
              </p>
              <div className="jpg-grid">
                {images.map(({ file, preview }, i) => (
                  <div
                    key={i}
                    className={`jpg-thumb${dragIdx === i ? ' dragging' : ''}${dropIdx === i ? ' drop-target' : ''}`}
                    draggable
                    onDragStart={e => handleDragStart(e, i)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDrop={e => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                  >
                    <img src={preview} alt={file.name} draggable={false} />
                    <div className="jpg-thumb-num">{i + 1}</div>
                    <button
                      className="jpg-thumb-remove"
                      onClick={() => removeImage(i)}
                      title="Remove"
                    >✕</button>
                    <div className="jpg-thumb-label">{file.name.replace(/\.[^.]+$/, '')}</div>
                  </div>
                ))}
              </div>
              <button className="btn-action" onClick={run}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#fff" strokeWidth="2"/><polyline points="14 2 14 8 20 8" stroke="#fff" strokeWidth="2"/></svg>
                Convert {images.length} Image{images.length !== 1 ? 's' : ''} to PDF
              </button>
            </>
          )}
        </>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Converting to PDF…</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: `${progress}%` }}/></div>
          <div className="progress-footer"><span>Please wait</span><span className="progress-pct">{progress}%</span></div>
        </div>
      )}

      {state === 'done' && resultBlob && (
        <div className="success-state">
          <div className="success-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#22c55e"/><polyline points="7.5 12 10.5 15 16.5 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h3>PDF Created!</h3>
          <p>{images.length} image{images.length !== 1 ? 's' : ''} converted to a single PDF.</p>
          <div className="result-meta">
            <div className="result-meta-item"><strong>{images.length}</strong><small>Images</small></div>
            <div className="result-meta-divider"/>
            <div className="result-meta-item"><strong>{formatBytes(resultBlob.size)}</strong><small>PDF size</small></div>
          </div>
          <div className="success-actions">
            <button className="btn-download" onClick={() => triggerDownload(resultBlob!, 'images.pdf')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
              Download PDF
            </button>
            <button className="btn-another" onClick={reset}>Convert More Images</button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="error-state">
          <div className="error-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#ef4444"/><line x1="12" y1="8" x2="12" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="16" r="1.2" fill="#fff"/></svg>
          </div>
          <h3>Conversion Failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-another" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
