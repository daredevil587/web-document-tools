import { useState, useRef, useCallback } from 'react';
import { convertPdfToGrayscale, FREE_FILE_LIMIT_MB } from '../../lib/grayscale-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type AppState = 'upload' | 'ready' | 'processing' | 'done' | 'error';

export default function GrayscalePdfTool() {
  const [state, setState] = useState<AppState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.type !== 'application/pdf') {
      setErrorMsg('Please select a valid PDF document.');
      setState('error');
      return;
    }
    if (f.size > FREE_FILE_LIMIT_MB * 1024 * 1024) {
      setErrorMsg(`File exceeds the ${FREE_FILE_LIMIT_MB} MB limit.`);
      setState('error');
      return;
    }
    setFile(f);
    setState('ready');
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleConvert = async () => {
    if (!file) return;
    setState('processing');
    setProgress(0);
    setProgressMsg('Loading PDF…');
    try {
      const blob = await convertPdfToGrayscale(file, (pct, msg) => {
        setProgress(pct);
        setProgressMsg(msg);
      });
      setResultBlob(blob);
      setState('done');
      triggerDownload(blob, file.name.replace(/\.pdf$/i, '') + '-grayscale.pdf');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to convert PDF.');
      setState('error');
    }
  };

  const reset = () => {
    setFile(null);
    setResultBlob(null);
    setErrorMsg('');
    setState('upload');
  };

  return (
    <div>
      {state === 'upload' && (
        <div>
          <div className="info-notice info-notice-green" style={{ marginBottom: 20 }}>
            <svg className="info-notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#14532d" strokeWidth="2"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke="#14532d" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="#14532d"/>
            </svg>
            <div>
              <strong>Save Printing Ink.</strong> Convert color documents to pure grayscale. All rendering is
              performed entirely inside your browser tab locally.
            </div>
          </div>

          <div
            className={`upload-area${dragOver ? ' dragover' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 14h12v8H6z" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>Drop your PDF here</h3>
            <p className="upload-sub">or click to browse — up to {FREE_FILE_LIMIT_MB} MB</p>
            <button className="btn-upload" type="button">Choose PDF</button>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
            style={{ display: 'none' }} onChange={handleFileInput} />
        </div>
      )}

      {state === 'ready' && file && (
        <div>
          {/* File summarization */}
          <div className="file-item" style={{ marginBottom: 20 }}>
            <div className="file-item-icon">📄</div>
            <div className="file-item-info">
              <div className="file-item-name">{file.name}</div>
              <div className="file-item-size">{formatBytes(file.size)}</div>
            </div>
            <button className="btn-another" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }}
              onClick={reset}>Change</button>
          </div>

          <button className="btn-action" onClick={handleConvert}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: '6px' }}>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Convert to Grayscale
          </button>
        </div>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Converting PDF…</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-footer">
            <span>Processing local frames</span>
            <span className="progress-pct">{progress}%</span>
          </div>
        </div>
      )}

      {state === 'done' && resultBlob && file && (
        <div className="success-state">
          <div className="success-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5"/>
              <polyline points="8 12 11 15 16 9" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3>PDF Converted Successfully!</h3>
          <p>The document is now converted to grayscale. Color elements are flattened to black and white pixels.</p>
          <div className="success-actions">
            <button
              className="btn-download"
              onClick={() => triggerDownload(resultBlob, file.name.replace(/\.pdf$/i, '') + '-grayscale.pdf')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Download Grayscale PDF
            </button>
            <button className="btn-another" onClick={reset}>Convert Another PDF</button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="error-state">
          <div className="error-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.5"/>
              <line x1="15" y1="9" x2="9" y2="15" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="9" y1="9" x2="15" y2="15" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h3>Conversion Failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-action" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
