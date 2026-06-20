import { useState, useRef, useCallback } from 'react';
import { readPdfMetadata, updatePdfMetadata, FREE_FILE_LIMIT_MB, type PdfMetadata } from '../../lib/metadata-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type AppState = 'upload' | 'reading' | 'ready' | 'processing' | 'done' | 'error';

const initialMeta: PdfMetadata = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
  creationDate: '',
  modificationDate: '',
};

export default function MetadataPdfTool() {
  const [state, setState] = useState<AppState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<PdfMetadata>(initialMeta);
  const [sanitizeXmp, setSanitizeXmp] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMetadata = async (f: File) => {
    setState('reading');
    setProgressMsg('Parsing PDF metadata…');
    try {
      const meta = await readPdfMetadata(f);
      setMetadata(meta);
      setState('ready');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to read PDF metadata. The file may be corrupt or encrypted.');
      setState('error');
    }
  };

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
    loadMetadata(f);
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

  const handleFieldChange = (field: keyof PdfMetadata, value: string) => {
    setMetadata(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSanitizeAll = () => {
    setMetadata({
      title: '',
      author: '',
      subject: '',
      keywords: '',
      creator: '',
      producer: '',
      creationDate: '',
      modificationDate: '',
    });
    setSanitizeXmp(true);
  };

  const handleSave = async () => {
    if (!file) return;
    setState('processing');
    setProgress(20);
    setProgressMsg('Applying metadata changes…');
    try {
      const blob = await updatePdfMetadata(file, metadata, sanitizeXmp);
      setProgress(80);
      setProgressMsg('Saving PDF structure…');
      setResultBlob(blob);
      setState('done');
      setProgress(100);
      triggerDownload(blob, file.name.replace(/\.pdf$/i, '') + '-metadata.pdf');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to write PDF metadata.');
      setState('error');
    }
  };

  const reset = () => {
    setFile(null);
    setMetadata(initialMeta);
    setSanitizeXmp(true);
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
              <strong>Metadata Privacy.</strong> View, edit, or strip hidden properties from your PDF files.
              Remove author name, creator application, creation dates, and tracking identifiers locally before sharing.
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
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="#6366f1" strokeWidth="1.5"/>
                <path d="M12 8v4m0 4h.01" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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

      {state === 'reading' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Reading PDF Metadata…</h3>
          <p>{progressMsg}</p>
        </div>
      )}

      {state === 'ready' && file && (
        <div>
          <div className="file-item" style={{ marginBottom: 24 }}>
            <div className="file-item-icon">📄</div>
            <div className="file-item-info">
              <div className="file-item-name">{file.name}</div>
              <div className="file-item-size">{formatBytes(file.size)}</div>
            </div>
            <button className="btn-another" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }}
              onClick={reset}>Change File</button>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-card, #f8fafc)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>Document Properties</h3>
              <button
                type="button"
                onClick={handleSanitizeAll}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'}
              >
                Clear All Fields (Sanitize)
              </button>
            </div>

            {/* Form grid layout */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px 20px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>Title</label>
                <input
                  type="text"
                  value={metadata.title}
                  onChange={e => handleFieldChange('title', e.target.value)}
                  placeholder="No Title"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--bg-input, #ffffff)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>Author</label>
                <input
                  type="text"
                  value={metadata.author}
                  onChange={e => handleFieldChange('author', e.target.value)}
                  placeholder="No Author"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--bg-input, #ffffff)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>Subject</label>
                <input
                  type="text"
                  value={metadata.subject}
                  onChange={e => handleFieldChange('subject', e.target.value)}
                  placeholder="No Subject"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--bg-input, #ffffff)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>Keywords (Comma-separated)</label>
                <input
                  type="text"
                  value={metadata.keywords}
                  onChange={e => handleFieldChange('keywords', e.target.value)}
                  placeholder="e.g. report, document, finance"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--bg-input, #ffffff)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>Creator (Application)</label>
                <input
                  type="text"
                  value={metadata.creator}
                  onChange={e => handleFieldChange('creator', e.target.value)}
                  placeholder="No Creator Application info"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--bg-input, #ffffff)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>Producer</label>
                <input
                  type="text"
                  value={metadata.producer}
                  onChange={e => handleFieldChange('producer', e.target.value)}
                  placeholder="No PDF Producer info"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--bg-input, #ffffff)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>Creation Date</label>
                <input
                  type="text"
                  value={metadata.creationDate}
                  onChange={e => handleFieldChange('creationDate', e.target.value)}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ (UTC)"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--bg-input, #ffffff)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>Modification Date</label>
                <input
                  type="text"
                  value={metadata.modificationDate}
                  onChange={e => handleFieldChange('modificationDate', e.target.value)}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ (UTC)"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    backgroundColor: 'var(--bg-input, #ffffff)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* XML/XMP Sanitization switch */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              borderTop: '1px solid var(--border-color, #e2e8f0)',
              paddingTop: '16px',
              marginTop: '10px'
            }}>
              <input
                type="checkbox"
                id="sanitize-xmp"
                checked={sanitizeXmp}
                onChange={e => setSanitizeXmp(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  accentColor: 'var(--primary, #6366f1)',
                  cursor: 'pointer'
                }}
              />
              <label htmlFor="sanitize-xmp" style={{ fontSize: '0.88rem', cursor: 'pointer', fontWeight: '600' }}>
                Sanitize XMP Metadata (Strips hidden XML streams completely)
              </label>
            </div>
          </div>

          <button className="btn-action" onClick={handleSave}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: '6px' }}>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="17 21 17 13 7 13 7 21" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="7 3 7 8 15 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Save & Download PDF
          </button>
        </div>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>Writing Metadata…</h3>
          <p>{progressMsg}</p>
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
          <h3>Metadata Saved Successfully!</h3>
          <p>The document metadata has been updated and sanitized according to your selections.</p>
          <div className="success-actions">
            <button
              className="btn-download"
              onClick={() => triggerDownload(resultBlob, file.name.replace(/\.pdf$/i, '') + '-metadata.pdf')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Download PDF
            </button>
            <button className="btn-another" onClick={reset}>Sanitize Another PDF</button>
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
          <h3>Metadata Action Failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-action" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
