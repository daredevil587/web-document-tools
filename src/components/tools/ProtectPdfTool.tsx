import { useState, useRef, useCallback } from 'react';
import { protectPdf, FREE_FILE_LIMIT_MB } from '../../lib/protect-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type AppState = 'upload' | 'ready' | 'processing' | 'done' | 'error';

export default function ProtectPdfTool() {
  const [state, setState] = useState<AppState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, msg: '' });
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.type !== 'application/pdf') {
      setErrorMsg('Please select a valid PDF file.');
      setState('error');
      return;
    }
    if (f.size > FREE_FILE_LIMIT_MB * 1024 * 1024) {
      setErrorMsg(`File is too large. Maximum size is ${FREE_FILE_LIMIT_MB} MB.`);
      setState('error');
      return;
    }
    setFile(f);
    setPassword('');
    setConfirmPassword('');
    setPasswordError('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (!password) {
      setPasswordError('Please enter a password.');
      return;
    }
    if (password.length < 4) {
      setPasswordError('Password must be at least 4 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordError('');
    setState('processing');
    setProgress({ pct: 0, msg: 'Starting encryption…' });

    try {
      const blob = await protectPdf(file, password, (pct, msg) => {
        setProgress({ pct, msg });
      });
      setResultBlob(blob);
      setState('done');
      triggerDownload(blob, file.name.replace(/\.pdf$/i, '') + '-protected.pdf');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to encrypt PDF.');
      setState('error');
    }
  };

  const reset = () => {
    setState('upload');
    setFile(null);
    setPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setResultBlob(null);
    setErrorMsg('');
  };

  return (
    <div>
      {state === 'upload' && (
        <div>
          <div className="info-notice" style={{ marginBottom: 20 }}>
            <svg className="info-notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                stroke="#92400e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <strong>Private Encryption.</strong> Your password and PDF file are processed
              completely locally inside your browser using secure cryptographic algorithms.
              We never store, upload, or transmit your passwords or document data.
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
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#6366f1" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#6366f1" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="16" r="1.5" fill="#6366f1"/>
              </svg>
            </div>
            <h3>Drop your PDF here</h3>
            <p className="upload-sub">or click to browse — up to {FREE_FILE_LIMIT_MB} MB</p>
            <button className="btn-upload" type="button">Choose PDF</button>
            <p className="file-limit">Supported: .pdf</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
            style={{ display: 'none' }} onChange={handleFileInput} />
        </div>
      )}

      {state === 'ready' && file && (
        <div>
          {/* File item bar */}
          <div className="file-item" style={{ marginBottom: 18 }}>
            <svg className="file-item-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="file-item-info">
              <div className="file-item-name">{file.name}</div>
              <div className="file-item-size">{formatBytes(file.size)}</div>
            </div>
            <button className="btn-another" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }}
              onClick={reset}>Change</button>
          </div>

          <form className="password-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="password-label" htmlFor="protect-password" style={{ display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
                <span>Choose Password</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>Required to open PDF</span>
              </label>
              <div className="password-input-wrap">
                <input
                  id="protect-password"
                  className={`password-input${passwordError ? ' error' : ''}`}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  placeholder="Create a strong password…"
                  onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
                />
                <button
                  type="button"
                  className="toolbar-btn"
                  style={{ flexShrink: 0 }}
                  onClick={() => setShowPassword(p => !p)}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="password-label" htmlFor="confirm-password">Confirm Password</label>
              <input
                id="confirm-password"
                className={`password-input${passwordError ? ' error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                placeholder="Repeat password to verify…"
                onChange={e => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                style={{ width: '100%' }}
              />
            </div>

            {passwordError && (
              <p style={{ fontSize: '0.82rem', color: '#ef4444', margin: 0 }}>{passwordError}</p>
            )}

            <button className="btn-action" type="submit" style={{ marginTop: 8 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#fff" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#fff" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Encrypt &amp; Protect PDF
            </button>
          </form>
        </div>
      )}

      {state === 'processing' && (
        <div className="progress-state">
          <div className="spinner-wrap">
            <div className="spinner" />
            <div className="spinner-inner" />
          </div>
          <h3>Encrypting PDF…</h3>
          <p>{progress.msg}</p>
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="progress-footer">
            <span>{progress.msg}</span>
            <span className="progress-pct">{progress.pct}%</span>
          </div>
        </div>
      )}

      {state === 'done' && resultBlob && file && (
        <div className="success-state">
          <div className="success-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5"/>
              <polyline points="8 12 11 15 16 9" stroke="#16a34a" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3>PDF encrypted successfully!</h3>
          <p>Your PDF is now protected. A password is required to view its contents.</p>
          <div className="success-actions">
            <button className="btn-download" onClick={() => triggerDownload(resultBlob, file.name.replace(/\.pdf$/i, '') + '-protected.pdf')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Download Protected PDF
            </button>
            <button className="btn-another" onClick={reset}>Protect another PDF</button>
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
          <h3>Encryption failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-action" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
