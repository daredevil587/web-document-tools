import { useState, useRef, useCallback } from 'react';
import { adjustPdfMargins, FREE_FILE_LIMIT_MB } from '../../lib/margin-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type AppState = 'upload' | 'ready' | 'processing' | 'done' | 'error';

export default function MarginPdfTool() {
  const [state, setState] = useState<AppState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [margin, setMargin] = useState(10); // Percent margin (0 - 30%)
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

  const handleAdjust = async () => {
    if (!file) return;
    setState('processing');
    setProgress(0);
    setProgressMsg('Loading PDF…');
    try {
      const blob = await adjustPdfMargins(file, margin, (pct, msg) => {
        setProgress(pct);
        setProgressMsg(msg);
      });
      setResultBlob(blob);
      setState('done');
      triggerDownload(blob, file.name.replace(/\.pdf$/i, '') + '-margins.pdf');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to adjust margins.');
      setState('error');
    }
  };

  const reset = () => {
    setFile(null);
    setResultBlob(null);
    setErrorMsg('');
    setState('upload');
    setMargin(10);
  };

  // Preview dimensions to preserve A4 / Letter standard ratio (approx 1:1.41)
  const previewScale = 1 - 2 * (margin / 100);

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
              <strong>Vector Resizing.</strong> Scale down page content and add clean white margins around pages. 
              Ideal for binding, custom cropping, or ensuring content doesn't clip when printed. 
              All processing happens 100% locally.
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
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="7" y="7" width="10" height="10" rx="1" stroke="#6366f1" strokeWidth="1" strokeDasharray="3 3"/>
                <path d="M12 8v8M8 12h8" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
          {/* Visual Interactive Margin Preview */}
          <div style={{
            flex: '1',
            minWidth: '260px',
            backgroundColor: 'var(--bg-card, #f8fafc)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: '600' }}>Page Preview</h4>
            <div style={{
              position: 'relative',
              width: '180px',
              height: '254px', // A4 aspect ratio representation
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              transition: 'all 0.2s ease',
            }}>
              {/* Scaled content outline box */}
              <div style={{
                width: `${previewScale * 100}%`,
                height: `${previewScale * 100}%`,
                border: '2px dashed var(--primary, #6366f1)',
                backgroundColor: 'rgba(99, 102, 241, 0.04)',
                borderRadius: '2px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                padding: '8px',
                boxSizing: 'border-box'
              }}>
                <span style={{
                  color: 'var(--primary, #6366f1)',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase'
                }}>Content</span>
                <span style={{
                  color: 'var(--text-muted, #64748b)',
                  fontSize: '0.65rem',
                  marginTop: '2px'
                }}>{Math.round(previewScale * 100)}% scale</span>
              </div>

              {/* Top margin label */}
              {margin > 0 && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: `${margin / 2}%`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6rem',
                  color: 'var(--text-muted)',
                  backgroundColor: 'rgba(241, 245, 249, 0.6)'
                }}/>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Dashed box represents the scaled page content. Outer spacing shows the added margin.
            </p>
          </div>

          {/* Configuration options */}
          <div style={{ flex: '1.5', minWidth: '280px' }}>
            <div className="file-item" style={{ marginBottom: 20 }}>
              <div className="file-item-icon">📄</div>
              <div className="file-item-info">
                <div className="file-item-name">{file.name}</div>
                <div className="file-item-size">{formatBytes(file.size)}</div>
              </div>
              <button className="btn-remove-file" onClick={reset}>✕</button>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <label style={{ fontSize: '0.9rem', fontWeight: '700' }}>Margin Width</label>
                <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary, #6366f1)' }}>{margin}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={margin}
                onChange={e => setMargin(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary, #6366f1)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                <span>No margin (0%)</span>
                <span>Max margin (30%)</span>
              </div>
            </div>

            <button className="btn-action" onClick={handleAdjust}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: '6px' }}>
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="7" y="7" width="10" height="10" rx="1" stroke="#fff" strokeWidth="1.5" strokeDasharray="2 2"/>
              </svg>
              Add Margins & Save
            </button>
          </div>
        </div>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Adding Margins…</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-footer">
            <span>Processing vector layouts</span>
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
          <h3>PDF Margins Adjusted Successfully!</h3>
          <p>The document margins have been updated. All content was scaled safely in vector format without quality loss.</p>
          <div className="success-actions">
            <button
              className="btn-download"
              onClick={() => triggerDownload(resultBlob, file.name.replace(/\.pdf$/i, '') + '-margins.pdf')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Download PDF with Margins
            </button>
            <button className="btn-another" onClick={reset}>Adjust Another PDF</button>
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
          <h3>Process Failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-action" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
