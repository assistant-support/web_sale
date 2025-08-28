'use client';

import air from './index.module.css'

export default function Noti({ open, onClose, status, mes, button }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 9,
        }}>
      </div>
      <div
        style={{
          background: 'var(--bg-secondary)',
          padding: 16,
          width: 350,
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.26)',
          zIndex: 10,
        }}
      >
        <p
          style={{
            marginTop: 16,
            marginBottom: -12,
            textAlign: 'center',
            color: status ? 'var(--green)' : 'var(--red)',
            fontWeight: 'bold',
          }}
        >
          {status ? 'THÀNH CÔNG' : 'THẤT BẠI'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
          {status ? <IconSuccess /> : <IconFailure />}
        </div>
        <p style={{ padding: '0 16px 8px 16px', textAlign: 'center' , marginTop: -12 }}>
          {mes}
        </p>
        <div>
          {button}
        </div>
      </div>
    </div>
  );
}



export function IconSuccess() {
  return (
    <div className={air['icon-success']}>
      <svg className={air['circle-svg']} viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r="25"
          fill="none"
          stroke="#28a745"
          strokeWidth="5"
          strokeLinecap="round"
          className={air['circle-path']}
        />
      </svg>
      <div className={`${air["check-mark"]} ${air['first']}`} />
      <div className={`${air["check-mark"]} ${air['second']}`} />
    </div>
  );
};

export function IconFailure() {
  return (
    <div className={air['icon-failure']}>
      <svg className={air['circle-svg']} viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r="25"
          fill="none"
          stroke="#dc3545"
          strokeWidth="5"
          strokeLinecap="round"
          className={air['circle-path']}
        />
      </svg>
      <div className={`${air["cross-line"]} ${air['first']}`} />
      <div className={`${air["cross-line"]} ${air['second']}`} />
    </div>
  );
};