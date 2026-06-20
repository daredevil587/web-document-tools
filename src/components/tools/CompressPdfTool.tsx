import { useState, useRef, useCallback } from 'react';
import { compressPdf, FREE_FILE_LIMIT_MB } from '../../lib/compress-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type State = 'upload' | 'ready' | 'processing' | 'done' | 'error';

export default function CompressPdfTool() {
  const [state, setState] = useState<State>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState<{ blob: Blob; origSize: number; newSize: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.type !== 'application/pdf') { setErrorMsg('Please select a PDF file.'); setState('error'); return; }
    if (f.size > FREE_FILE_LIMIT_MB * 1024 * 1024) { setErrorMsg(`File exceeds ${FREE_FILE_LIMIT_MB} MB limit.`); setState('error'); return; }
    setFile(f);
    setState('ready');
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const run = async () => {
    if (!file) return;
    setState('processing');
    setProgress(0);
    try {
      const blob = await compressPdf(file, (pct, msg) => {
        setProgress(pct);
        setProgressMsg(msg);
      });
      setResult({ blob, origSize: file.size, newSize: blob.size });
      setState('done');
      triggerDownload(blob, file.name.replace(/\.pdf$/i, '-compressed.pdf'));
    } catch (e: any) {
      setErrorMsg(e?.message?.includes('password') ? 'PDF is password-protected. Remove the password first.' : 'Could not compress this PDF. It may be corrupted.');
      setState('error');
    }
  };

  const reset = () => { setFile(null); setResult(null); setErrorMsg(''); setState('upload'); };

  const savings = result ? Math.round((1 - result.newSize / result.origSize) * 100) : 0;

  return (
    <div>
      {state === 'upload' && (
        <div
          className={`upload-area${dragOver ? ' dragover' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="upload-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="17 8 12 3 7 8" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="3" x2="12" y2="15" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3>Drag &amp; Drop your PDF here</h3>
          <p className="upload-sub">or click to browse files</p>
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <button className="btn-upload" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>Choose PDF File</button>
          <p className="file-limit">Supports: PDF · Max size: {FREE_FILE_LIMIT_MB} MB</p>
        </div>
      )}

      {state === 'ready' && file && (
        <div>
          <div className="file-list">
            <div className="file-item">
              <div className="file-item-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round"/><polyline points="14 2 14 8 20 8" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round"/></svg>
              </div>
              <div className="file-item-info">
                <div className="file-item-name">{file.name}</div>
                <div className="file-item-size">{formatBytes(file.size)}</div>
              </div>
              <button className="btn-remove-file" onClick={reset}>✕</button>
            </div>
          </div>
          <button className="btn-action" onClick={run}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
            Compress PDF
          </button>
        </div>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Compressing…</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: `${progress}%` }}/></div>
          <div className="progress-footer"><span>Please wait</span><span className="progress-pct">{progress}%</span></div>
        </div>
      )}

      {state === 'done' && result && (
        <div className="success-state">
          <div className="success-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#22c55e"/><polyline points="7.5 12 10.5 15 16.5 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h3>Compression Complete!</h3>
          <p>Your compressed PDF is ready — download started automatically.</p>
          <div className="result-meta">
            <div className="result-meta-item">
              <strong>{formatBytes(result.origSize)}</strong>
              <small>Original</small>
            </div>
            <div className="result-meta-divider"/>
            <div className="result-meta-item">
              <strong>{formatBytes(result.newSize)}</strong>
              <small>Compressed</small>
            </div>
            <div className="result-meta-divider"/>
            <div className="result-meta-item">
              <strong style={{ color: savings > 0 ? '#22c55e' : '#f59e0b' }}>{savings > 0 ? `-${savings}%` : '~0%'}</strong>
              <small>Saved</small>
            </div>
          </div>
          <div className="success-actions">
            <button className="btn-download" onClick={() => file && result && triggerDownload(result.blob, file.name.replace(/\.pdf$/i, '-compressed.pdf'))}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
              Download Compressed PDF
            </button>
            <button className="btn-another" onClick={reset}>Compress Another File</button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="error-state">
          <div className="error-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#ef4444"/><line x1="12" y1="8" x2="12" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="16" r="1.2" fill="#fff"/></svg>
          </div>
          <h3>Something went wrong</h3>
          <p>{errorMsg}</p>
          <button className="btn-another" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
