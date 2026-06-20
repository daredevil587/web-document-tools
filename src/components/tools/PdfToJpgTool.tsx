import { useState, useRef, useCallback } from 'react';
import { pdfToImages, FREE_FILE_LIMIT_MB, type PageImage } from '../../lib/pdf-to-jpg';
import { dataUrlToBlob, triggerDownload } from '../../lib/utils';

type State = 'upload' | 'ready' | 'processing' | 'done' | 'error';

export default function PdfToJpgTool() {
  const [state, setState] = useState<State>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [pages, setPages] = useState<PageImage[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.type !== 'application/pdf') { setErrorMsg('Please select a PDF file.'); setState('error'); return; }
    if (f.size > FREE_FILE_LIMIT_MB * 1024 * 1024) { setErrorMsg(`File exceeds ${FREE_FILE_LIMIT_MB} MB limit.`); setState('error'); return; }
    setFile(f);
    setState('ready');
  }, []);

  const run = async () => {
    if (!file) return;
    setState('processing');
    setProgress(0);
    try {
      const result = await pdfToImages(file, 2, (pct, msg) => { setProgress(pct); setProgressMsg(msg); });
      setPages(result);
      setState('done');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not convert PDF.');
      setState('error');
    }
  };

  const downloadAll = async () => {
    if (pages.length === 1) {
      triggerDownload(dataUrlToBlob(pages[0].dataUrl), pages[0].filename);
      return;
    }
    // Download as ZIP using JSZip loaded lazily
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    pages.forEach(p => {
      const b64 = p.dataUrl.split(',')[1];
      zip.file(p.filename, b64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(blob, (file?.name.replace(/\.pdf$/i, '') ?? 'pages') + '-images.zip');
  };

  const downloadOne = (page: PageImage) => {
    triggerDownload(dataUrlToBlob(page.dataUrl), page.filename);
  };

  const reset = () => { setFile(null); setPages([]); setErrorMsg(''); setState('upload'); };

  return (
    <div>
      {state === 'upload' && (
        <div
          className={`upload-area${dragOver ? ' dragover' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <div className="upload-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round"/>
              <polyline points="14 2 14 8 20 8" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round"/>
              <rect x="2" y="13" width="9" height="9" rx="1" stroke="#6366f1" strokeWidth="1.5"/>
            </svg>
          </div>
          <h3>Drag &amp; Drop your PDF here</h3>
          <p className="upload-sub">or click to browse</p>
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
              </div>
              <button className="btn-remove-file" onClick={reset}>✕</button>
            </div>
          </div>
          <button className="btn-action" onClick={run}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="#fff" strokeWidth="2"/><circle cx="8.5" cy="8.5" r="1.5" stroke="#fff" strokeWidth="1.5"/><polyline points="21 15 16 10 5 21" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
            Convert PDF to JPG
          </button>
        </div>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Rendering pages…</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: `${progress}%` }}/></div>
          <div className="progress-footer"><span>Please wait</span><span className="progress-pct">{progress}%</span></div>
        </div>
      )}

      {state === 'done' && pages.length > 0 && (
        <div className="success-state">
          <div className="success-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#22c55e"/><polyline points="7.5 12 10.5 15 16.5 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h3>Conversion Complete!</h3>
          <p>{pages.length} page{pages.length !== 1 ? 's' : ''} exported as JPG.</p>

          <div className="image-grid" style={{ margin: '16px 0' }}>
            {pages.map(p => (
              <div className="image-thumb" key={p.pageNum} style={{ cursor: 'pointer' }} onClick={() => downloadOne(p)}>
                <img src={p.dataUrl} alt={`Page ${p.pageNum}`} />
                <div className="image-thumb-label">Page {p.pageNum} ↓</div>
              </div>
            ))}
          </div>

          <div className="success-actions">
            <button className="btn-download" onClick={downloadAll}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
              {pages.length === 1 ? 'Download JPG' : `Download All as ZIP (${pages.length} pages)`}
            </button>
            <button className="btn-another" onClick={reset}>Convert Another PDF</button>
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
