import { useState, useRef, useCallback } from 'react';
import { imagesToPdf, FREE_FILE_LIMIT_MB, FREE_FILE_COUNT } from '../../lib/jpg-to-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type State = 'upload' | 'ready' | 'processing' | 'done' | 'error';
const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

export default function JpgToPdfTool() {
  const [state, setState] = useState<State>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).filter(f => f.type.startsWith('image/')).slice(0, FREE_FILE_COUNT);
    if (!arr.length) return;
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => setPreviews(p => [...p, e.target!.result as string]);
      reader.readAsDataURL(f);
    });
    setFiles(prev => [...prev, ...arr].slice(0, FREE_FILE_COUNT));
    setState('ready');
  }, []);

  const removeFile = (idx: number) => {
    setFiles(prev => { const n = prev.filter((_,i) => i !== idx); if (!n.length) setState('upload'); return n; });
    setPreviews(prev => prev.filter((_,i) => i !== idx));
  };

  const run = async () => {
    if (!files.length) return;
    setState('processing');
    setProgress(0);
    try {
      const blob = await imagesToPdf(files, (pct, msg) => { setProgress(pct); setProgressMsg(msg); });
      setResultBlob(blob);
      setState('done');
      triggerDownload(blob, 'images.pdf');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not convert images to PDF.');
      setState('error');
    }
  };

  const reset = () => { setFiles([]); setPreviews([]); setResultBlob(null); setErrorMsg(''); setState('upload'); };

  return (
    <div>
      {(state === 'upload' || state === 'ready') && (
        <>
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
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#6366f1" strokeWidth="2"/>
                <circle cx="8.5" cy="8.5" r="1.5" stroke="#6366f1" strokeWidth="2"/>
                <polyline points="21 15 16 10 5 21" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>{files.length ? 'Add More Images' : 'Drag & Drop images here'}</h3>
            <p className="upload-sub">JPG, PNG, WebP accepted</p>
            <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden
              onChange={e => e.target.files && addFiles(e.target.files)} />
            <button className="btn-upload" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>
              {files.length ? '+ Add More Images' : 'Choose Images'}
            </button>
            <p className="file-limit">Max {FREE_FILE_COUNT} images · {FREE_FILE_LIMIT_MB} MB each</p>
          </div>

          {files.length > 0 && (
            <>
              <div className="image-grid" style={{ marginBottom: '18px' }}>
                {previews.map((src, i) => (
                  <div className="image-thumb" key={i}>
                    <img src={src} alt={files[i]?.name ?? `Image ${i+1}`} />
                    <div className="image-thumb-label">{i+1}. {files[i]?.name?.split('.')[0]}</div>
                    <button onClick={() => removeFile(i)}
                      style={{ position:'absolute',top:'4px',right:'4px',background:'rgba(0,0,0,0.55)',border:'none',borderRadius:'50%',width:'20px',height:'20px',color:'#fff',cursor:'pointer',fontSize:'0.7rem',display:'flex',alignItems:'center',justifyContent:'center' }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button className="btn-action" onClick={run}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#fff" strokeWidth="2"/><polyline points="14 2 14 8 20 8" stroke="#fff" strokeWidth="2"/></svg>
                Convert {files.length} Image{files.length !== 1 ? 's' : ''} to PDF
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
          <p>{files.length} image{files.length !== 1 ? 's' : ''} converted to a single PDF.</p>
          <div className="result-meta">
            <div className="result-meta-item"><strong>{files.length}</strong><small>Images</small></div>
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
