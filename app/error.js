'use client';

import { useEffect } from 'react';

export default function DashboardError({ error, reset }) {
    useEffect(() => {
        console.error('Lỗi xảy ra trong Dashboard:', error);
    }, [error]);

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '20px',
        fontFamily: 'sans-serif',
        textAlign: 'center',
        backgroundColor: '#b0e0e9',
        position: 'relative',
    };

    const buttonStyle = {
        marginTop: '20px',
        padding: '10px 20px',
        fontSize: '16px',
        cursor: 'pointer',
        backgroundColor: 'var(--main_d)',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
    };

    return (
        <div style={containerStyle}>
            <div className="fit-wide">
                <h1 className="title title--regular title--size-large title--weight-bold">
                    502 - Bad Gateway
                </h1>
                <p className="title title--subtitle title--size-semimedium title--weight-normal">
                    This is a temporary error. Please try again later.
                </p>
                <button style={buttonStyle} onClick={reset} type="button">
                    Thử lại
                </button>
            </div>
            <div className="error--shape__clouds">
                <svg
                    id="f95fc14d-9eb7-4d11-bcb9-651fb6dd69f0"
                    data-name="Layer 1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 2074.144 292.377"
                >
                    <title>clouds_shape</title>
                    <path
                        d="M2034.093,187.309a40.338,40.338,0,0,0-6.537.579,57.445,57.445,0,0,0-101.344-53.826,39.917,39.917,0,0,0-53.631-9.69,57.478,57.478,0,0,0-76.107-65.161c.019-.589.045-1.175.045-1.767a57.443,57.443,0,1,0-114.885,0,58.165,58.165,0,0,0,.412,6.781,39.929,39.929,0,0,0-62.076,39.726,57.431,57.431,0,0,0-89.212,45.7,57.427,57.427,0,0,0-52.738,8.725,39.97,39.97,0,0,0-68.167-16.906c.043-.757.114-1.507.114-2.276a40.049,40.049,0,0,0-65.428-30.986,57.445,57.445,0,0,0-113.6,12.12c0,1.258.055,2.5.134,3.739a39.956,39.956,0,0,0-36.784,6.689,40.715,40.715,0,0,0,.212-4.139A40.019,40.019,0,0,0,1132.73,93a57.443,57.443,0,0,0-106.758-39.516,40.05,40.05,0,0,0-79.081,4.36,40.116,40.116,0,0,0-38.16.022c0-.139.011-.277.011-.417a57.443,57.443,0,1,0-114.474,6.781,39.929,39.929,0,0,0-62.076,39.726,57.431,57.431,0,0,0-89.212,45.7,57.427,57.427,0,0,0-52.738,8.725,39.97,39.97,0,0,0-68.167-16.906c.043-.757.114-1.507.114-2.276a40.049,40.049,0,0,0-65.428-30.986,57.445,57.445,0,0,0-113.6,12.12c0,1.258.055,2.5.134,3.739a39.956,39.956,0,0,0-36.784,6.689,40.715,40.715,0,0,0,.212-4.139A40.019,40.019,0,0,0,244.952,93,57.443,57.443,0,0,0,138.194,53.479a40.05,40.05,0,0,0-79.081,4.36A40.066,40.066,0,0,0,0,93.074v199.3H2074.144V227.363A40.052,40.052,0,0,0,2034.093,187.309Z"
                        fill="#fff"
                    ></path>
                </svg>
            </div>
        </div>
    );
}
