'use client';

import { useEffect } from 'react';

export default function DashboardError({ error, reset }) {
    useEffect(() => { console.error("Lỗi xảy ra trong Dashboard:", error); }, [error]);

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '20px',
        fontFamily: 'sans-serif',
        textAlign: 'center',
        backgroundColor: '#fffbe_b',
        color: '#9a3412'
    };

    const buttonStyle = {
        marginTop: '20px',
        padding: '10px 20px',
        fontSize: '16px',
        cursor: 'pointer',
        backgroundColor: 'var(--main_d)',
        color: 'white',
        border: 'none',
        borderRadius: '5px'
    };

    return (
        <div style={containerStyle}>
            <h2 className='text_2'>Rất tiếc, đã có lỗi xảy ra!</h2>
            <p className='text_4'>Lỗi: {error.message}</p>
            <button
                style={buttonStyle}
                onClick={() => reset()}>
                Thử lại
            </button>
        </div>
    );
}