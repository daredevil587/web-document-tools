import { useState, useRef } from 'react';
import type { LockType, DetectResult } from '../../lib/unlock-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type AppState = 'upload' | 'detecting' | 'detected' | 'processing' | 'done' | 'error';
const FREE_MB = 50;

export default function UnlockPdfTool() {
  const [state, setState] = useState<AppState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [detection, setDetection] = useState<DetectResult | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, msg: '' });
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultNote, setResultNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    if (f.size > FREE_MB * 1024 * 1024) {
      setErrorMsg(`File is too large. Maximum is ${FREE_MB} MB.`);
      setState('error');
      return;
    }
    setFile(f);
    setPassword('');
    setPasswordError('');
    setState('detecting');
    setProgress({ pct: 0, msg: 'Analysing PDF…' });

    try {
      const { detectPdfLock } = await import('../../lib/unlock-pdf');
      const result = await detectPdfLock(f);
      setDetection(result);
      setState('detected');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not read the PDF file.');
      setState('error');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') handleFile(f);
  };

  const unlockOwner = async () => {
    if (!file) return;
    setState('processing');
    setProgress({ pct: 0, msg: 'Loading…' });
    try {
      const { unlockPermissions } = await import('../../lib/unlock-pdf');
      const blob = await unlockPermissions(file, (pct, msg) => setProgress({ pct, msg }));
      setResultBlob(blob);
      setResultNote('Permission restrictions removed. The file is now fully editable.');
      setState('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to remove restrictions.');
      setState('error');
    }
  };

  const unlockUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (!password.trim()) { setPasswordError('Please enter the password.'); return; }
    setPasswordError('');
    setState('processing');
    setProgress({ pct: 0, msg: 'Verifying password…' });
    try {
      const { unlockWithPassword } = await import('../../lib/unlock-pdf');
      const blob = await unlockWithPassword(file, password, (pct, msg) => setProgress({ pct, msg }));
      setResultBlob(blob);
      setResultNote(
        'Note: The output is an image-based PDF — text will not be selectable or searchable, ' +
        'but the file is fully accessible without a password.'
      );
      setState('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to unlock PDF.';
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('incorrect')) {
        setPasswordError(msg);
        setState('detected');
      } else {
        setErrorMsg(msg);
        setState('error');
      }
    }
  };

  const reset = () => {
    setState('upload');
    setFile(null);
    setDetection(null);
    setPassword('');
    setPasswordError('');
    setResultBlob(null);
    setErrorMsg('');
  };

  // ========== RENDER ==========

  if (state === 'upload') {
    return (
      <div>
        <div className="info-notice" style={{ marginBottom: 20 }}>
          <svg className="info-notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              stroke="#92400e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <strong>Responsible use.</strong> This tool removes permissions you already have
            the right to remove — e.g. owner-restrictions on your own documents —
            or helps you access files you already have the password for.
            It cannot bypass passwords you do not know. Files never leave your browser.
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
          <p className="upload-sub">or click to browse — up to {FREE_MB} MB</p>
          <button className="btn-upload" type="button">Choose PDF</button>
          <p className="file-limit">Supported: .pdf</p>
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
          style={{ display: 'none' }} onChange={handleFileInput} />
      </div>
    );
  }

  if (state === 'detecting') {
    return (
      <div className="progress-state">
        <div className="spinner-wrap">
          <div className="spinner" />
          <div className="spinner-inner" />
        </div>
        <h3>Analysing PDF…</h3>
        <p>Checking encryption and permission settings</p>
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  if (state === 'processing') {
    return (
      <div className="progress-state">
        <div className="spinner-wrap">
          <div className="spinner" />
          <div className="spinner-inner" />
        </div>
        <h3>Processing PDF…</h3>
        <p>{progress.msg}</p>
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${progress.pct}%` }} />
        </div>
        <div className="progress-footer">
          <span>{progress.msg}</span>
          <span className="progress-pct">{progress.pct}%</span>
        </div>
      </div>
    );
  }

  if (state === 'done' && resultBlob && file) {
    const outName = file.name.replace(/\.pdf$/i, '-unlocked.pdf');
    return (
      <div className="success-state">
        <div className="success-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5"/>
            <polyline points="8 12 11 15 16 9" stroke="#16a34a" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h3>PDF unlocked!</h3>
        {resultNote && (
          <div className="info-notice" style={{ textAlign: 'left', marginBottom: 14 }}>
            <svg className="info-notice-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#92400e" strokeWidth="2"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke="#92400e" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="#92400e"/>
            </svg>
            <span>{resultNote}</span>
          </div>
        )}
        <div className="success-actions">
          <button className="btn-download" onClick={() => triggerDownload(resultBlob, outName)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Download {outName}
          </button>
          <button className="btn-another" onClick={reset}>Unlock another PDF</button>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="error-state">
        <div className="error-icon">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.5"/>
            <line x1="15" y1="9" x2="9" y2="15" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="9" y1="9" x2="15" y2="15" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
        <h3>Something went wrong</h3>
        <p>{errorMsg}</p>
        <div className="error-tips">
          <p>Tips:</p>
          <ul>
            <li>Make sure the file is a valid PDF</li>
            <li>Try a different PDF file</li>
          </ul>
        </div>
        <button className="btn-action" onClick={reset}>Try Again</button>
      </div>
    );
  }

  // ---- Detected state ----
  const lockType = detection?.lockType ?? 'none';

  const lockIcon = lockType === 'none'
    ? '🔓'
    : lockType === 'owner'
    ? '🔐'
    : '🔒';

  const lockLabel = lockType === 'none'
    ? 'No restrictions detected'
    : lockType === 'owner'
    ? 'Permission restrictions found'
    : 'Password-protected (open password required)';

  return (
    <div>
      {/* File bar */}
      <div className="file-item" style={{ marginBottom: 14 }}>
        <svg className="file-item-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="file-item-info">
          <div className="file-item-name">{file?.name}</div>
          <div className="file-item-size">{file ? formatBytes(file.size) : ''}</div>
        </div>
        <button className="btn-another" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }}
          onClick={reset}>Change</button>
      </div>

      {/* Detection result card */}
      <div className="detect-card">
        <div className="detect-icon">{lockIcon}</div>
        <div className="detect-body">
          <strong>{lockLabel}</strong>
          <p>{detection?.reason}</p>
        </div>
      </div>

      {/* NOT LOCKED */}
      {lockType === 'none' && (
        <div>
          <div className="info-notice info-notice-green">
            <svg className="info-notice-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
              <polyline points="20 6 9 17 4 12" stroke="#14532d" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>This PDF appears to have no restrictions. No action is needed.</span>
          </div>
          <button className="btn-another" onClick={reset}>Try a different file</button>
        </div>
      )}

      {/* OWNER LOCKED */}
      {lockType === 'owner' && (
        <div>
          <div className="info-notice" style={{ marginBottom: 16 }}>
            <svg className="info-notice-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#92400e" strokeWidth="2"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke="#92400e" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="#92400e"/>
            </svg>
            <span>
              Only remove restrictions from documents you own or have permission to modify.
              The output will be a fully editable PDF.
            </span>
          </div>
          <button className="btn-action" onClick={unlockOwner}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="#fff" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1" stroke="#fff" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Remove Restrictions
          </button>
        </div>
      )}

      {/* USER LOCKED */}
      {lockType === 'user' && (
        <div>
          <div className="info-notice" style={{ marginBottom: 16 }}>
            <svg className="info-notice-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#92400e" strokeWidth="2"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke="#92400e" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="#92400e"/>
            </svg>
            <span>
              Enter the password you already have for this file. The tool will produce an
              image-based PDF copy that opens without any password. Text will not be selectable in the output.
            </span>
          </div>

          <form className="password-form" onSubmit={unlockUser}>
            <label className="password-label" htmlFor="pdf-password">PDF Password</label>
            <div className="password-input-wrap">
              <input
                id="pdf-password"
                className={`password-input${passwordError ? ' error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                autoComplete="current-password"
                placeholder="Enter password…"
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
            {passwordError && (
              <p style={{ fontSize: '0.82rem', color: '#ef4444', marginTop: 2 }}>{passwordError}</p>
            )}
            <button className="btn-action" type="submit">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#fff" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 11V7a5 5 0 0 1 9.9-1" stroke="#fff" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Unlock PDF
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
