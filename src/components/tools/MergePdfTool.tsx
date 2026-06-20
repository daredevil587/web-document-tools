import { useState, useRef, useCallback } from 'react';
import { mergePdfs, FREE_FILE_LIMIT_MB, FREE_FILE_COUNT } from '../../lib/merge-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type State = 'upload' | 'ready' | 'processing' | 'done' | 'error';

export default function MergePdfTool() {
  const [state, setState] = useState<State>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).filter(f => f.type === 'application/pdf');
    if (!arr.length) return;
    setFiles(prev => {
      const combined = [...prev, ...arr].slice(0, FREE_FILE_COUNT);
      return combined;
    });
    setState('ready');
  }, []);

  const removeFile = (idx: number) => {
    setFiles(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setState('upload');
      return next;
    });
  };

  // ---- Drag-to-reorder ----
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // So the dragged ghost looks right
    e.dataTransfer.setData('text/plain', String(idx));
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx !== null && idx !== dragIdx) setDropIdx(idx);
  };
  const handleDragLeave = () => setDropIdx(null);
  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDropIdx(null); return; }
    setFiles(prev => {
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
    if (files.length < 2) return;
    setState('processing');
    setProgress(0);
    try {
      const blob = await mergePdfs(files, (pct, msg) => { setProgress(pct); setProgressMsg(msg); });
      setResultBlob(blob);
      setState('done');
      triggerDownload(blob, 'merged.pdf');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not merge PDFs.');
      setState('error');
    }
  };

  const reset = () => { setFiles([]); setResultBlob(null); setErrorMsg(''); setState('upload'); };

  return (
    <div>
      {(state === 'upload' || state === 'ready') && (
        <>
          {/* Drop zone */}
          <div
            className={`upload-area${dragOver ? ' dragover' : ''}`}
            style={{ marginBottom: files.length ? '20px' : 0 }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          >
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="17 8 12 3 7 8" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="3" x2="12" y2="15" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>{files.length ? 'Add More PDFs' : 'Drag & Drop PDFs here'}</h3>
            <p className="upload-sub">or click to browse — up to {FREE_FILE_COUNT} files</p>
            <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple hidden
              onChange={e => e.target.files && addFiles(e.target.files)} />
            <button className="btn-upload" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>
              {files.length ? '+ Add More PDFs' : 'Choose PDF Files'}
            </button>
            <p className="file-limit">Supports: PDF · Max {FREE_FILE_LIMIT_MB} MB each</p>
          </div>

          {files.length > 0 && (
            <>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                <strong>Drag rows to reorder</strong> · {files.length} file{files.length !== 1 ? 's' : ''} selected
              </p>
              <div className="merge-list">
                {files.map((f, i) => (
                  <div
                    key={i}
                    className={`merge-item${dragIdx === i ? ' dragging' : ''}${dropIdx === i ? ' drop-target' : ''}`}
                    draggable
                    onDragStart={e => handleDragStart(e, i)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                  >
                    <span className="merge-drag-handle" title="Drag to reorder">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <circle cx="9" cy="6" r="1.5" fill="currentColor"/>
                        <circle cx="15" cy="6" r="1.5" fill="currentColor"/>
                        <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
                        <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
                        <circle cx="9" cy="18" r="1.5" fill="currentColor"/>
                        <circle cx="15" cy="18" r="1.5" fill="currentColor"/>
                      </svg>
                    </span>
                    <span className="merge-order-badge">{i + 1}</span>
                    <span className="merge-item-name">{f.name}</span>
                    <span className="merge-item-size">{formatBytes(f.size)}</span>
                    <button
                      className="btn-remove-file"
                      title="Remove"
                      onClick={() => removeFile(i)}
                    >✕</button>
                  </div>
                ))}
              </div>
              <button className="btn-action" onClick={run} disabled={files.length < 2}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="#fff" strokeWidth="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="#fff" strokeWidth="2"/></svg>
                Merge {files.length} PDF{files.length !== 1 ? 's' : ''}
              </button>
              {files.length < 2 && <p style={{ textAlign:'center', fontSize:'0.8rem', color:'var(--text-muted)', marginTop:'8px' }}>Add at least 2 PDFs to merge</p>}
            </>
          )}
        </>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Merging PDFs…</h3>
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
          <h3>Merge Complete!</h3>
          <p>All {files.length} PDFs merged into one file.</p>
          <div className="result-meta">
            <div className="result-meta-item"><strong>{files.length}</strong><small>Files merged</small></div>
            <div className="result-meta-divider"/>
            <div className="result-meta-item"><strong>{formatBytes(resultBlob.size)}</strong><small>Output size</small></div>
          </div>
          <div className="success-actions">
            <button className="btn-download" onClick={() => triggerDownload(resultBlob, 'merged.pdf')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
              Download merged.pdf
            </button>
            <button className="btn-another" onClick={reset}>Merge More Files</button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="error-state">
          <div className="error-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#ef4444"/><line x1="12" y1="8" x2="12" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="16" r="1.2" fill="#fff"/></svg>
          </div>
          <h3>Merge Failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-another" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
