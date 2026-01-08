'use client';

import React, { useState } from 'react';
import ZaloSystemModal from './ZaloSystemModal';

export default function ZaloSystemButton() {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <button className='btn_s' onClick={() => setIsModalOpen(true)}>
                <h5>Zalo Hệ Thống</h5>
            </button>
            <ZaloSystemModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </>
    );
}

