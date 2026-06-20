import { useState, useRef, useCallback } from 'react';
import { runImageOcr, runPdfOcr, FREE_FILE_LIMIT_MB } from '../../lib/ocr';
import { formatBytes } from '../../lib/utils';

type AppState = 'upload' | 'ready' | 'processing' | 'done' | 'error';

interface LanguageOption {
  code: string;
  name: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'eng', name: 'English' },
  { code: 'spa', name: 'Spanish (Español)' },
  { code: 'fra', name: 'French (Français)' },
  { code: 'deu', name: 'German (Deutsch)' },
  { code: 'hin', name: 'Hindi (हिन्दी)' },
  { code: 'chi_sim', name: 'Chinese Simplified (简体中文)' },
  { code: 'jpn', name: 'Japanese (日本語)' },
  { code: 'por', name: 'Portuguese (Português)' },
];

export default function OcrTool() {
  const [state, setState] = useState<AppState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [selectedLang, setSelectedLang] = useState('eng');
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    const isPdf = f.type === 'application/pdf';
    const isImage = f.type.startsWith('image/');
    
    if (!isPdf && !isImage) {
      setErrorMsg('Please select a valid PDF file or image (PNG, JPG, WebP).');
      setState('error');
      return;
    }
    if (f.size > FREE_FILE_LIMIT_MB * 1024 * 1024) {
      setErrorMsg(`File is too large. Maximum size is ${FREE_FILE_LIMIT_MB} MB for browser OCR processing.`);
      setState('error');
      return;
    }
    
    setFile(f);
    setExtractedText('');
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

  const handleRunOcr = async () => {
    if (!file) return;
    setState('processing');
    setProgress(0);
    setProgressMsg('Loading OCR components…');

    try {
      let result = '';
      if (file.type === 'application/pdf') {
        result = await runPdfOcr(file, selectedLang, (pct, msg) => {
          setProgress(pct);
          setProgressMsg(msg);
        });
      } else {
        result = await runImageOcr(file, selectedLang, (pct, msg) => {
          setProgress(pct);
          setProgressMsg(msg);
        });
      }
      setExtractedText(result);
      setState('done');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to extract text. The file might be corrupted or in an unsupported format.');
      setState('error');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(extractedText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownload = () => {
    if (!file) return;
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace(/\.[^.]+$/, '') + '-extracted.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setState('upload');
    setFile(null);
    setProgress(0);
    setProgressMsg('');
    setExtractedText('');
    setErrorMsg('');
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
              <strong>100% Secure &amp; Private.</strong> Text extraction is performed entirely inside your browser 
              using local Web Workers. Your files never touch our servers — guaranteed.
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
                <circle cx="11" cy="11" r="8" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
                <rect x="5" y="5" width="14" height="14" rx="2" stroke="#6366f1" strokeWidth="1" strokeDasharray="3 3"/>
              </svg>
            </div>
            <h3>Drop your file here</h3>
            <p className="upload-sub">PDF or Image (PNG, JPG, WebP) — up to {FREE_FILE_LIMIT_MB} MB</p>
            <button className="btn-upload" type="button">Choose File</button>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf,image/*"
            style={{ display: 'none' }} onChange={handleFileInput} />
        </div>
      )}

      {state === 'ready' && file && (
        <div>
          {/* File summary */}
          <div className="file-item" style={{ marginBottom: 20 }}>
            <div className="file-item-icon">
              {file.type === 'application/pdf' ? '📄' : '🖼️'}
            </div>
            <div className="file-item-info">
              <div className="file-item-name">{file.name}</div>
              <div className="file-item-size">{formatBytes(file.size)}</div>
            </div>
            <button className="btn-another" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }}
              onClick={reset}>Change</button>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: 20 }}>
            <label className="password-label" htmlFor="ocr-lang" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Select Document Language
            </label>
            <select
              id="ocr-lang"
              className="password-input"
              value={selectedLang}
              onChange={e => setSelectedLang(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '0.92rem' }}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              Choosing the correct language significantly improves text recognition accuracy.
            </p>
          </div>

          <button className="btn-action" onClick={handleRunOcr}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Extract Text from Document
          </button>
        </div>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap">
            <div className="spinner" />
            <div className="spinner-inner" />
          </div>
          <h3>Processing Document…</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-footer">
            <span>Running browser-based OCR</span>
            <span className="progress-pct">{progress}%</span>
          </div>
        </div>
      )}

      {state === 'done' && (
        <div>
          <div className="success-state" style={{ padding: '20px 0 10px' }}>
            <div className="success-icon" style={{ marginBottom: '10px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5"/>
                <polyline points="8 12 11 15 16 9" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>Text Extracted successfully!</h3>
            <p style={{ marginBottom: '0' }}>Review, copy, or download the output below.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="toolbar-btn" onClick={handleCopy} title="Copy text to clipboard">
                {copySuccess ? '✓ Copied!' : '📋 Copy Text'}
              </button>
              <button className="toolbar-btn" onClick={handleDownload} title="Download as .txt file">
                💾 Download TXT
              </button>
            </div>

            <textarea
              className="password-input"
              value={extractedText}
              readOnly
              style={{
                width: '100%',
                height: '320px',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                lineHeight: '1.5',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--surface2)',
                color: 'var(--text)',
                resize: 'vertical'
              }}
              placeholder="No text was detected in the document."
            />
            
            <button className="btn-another" onClick={reset} style={{ marginTop: '10px', width: '100%' }}>
              Extract another file
            </button>
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
          <h3>Extraction Failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-action" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
