'use client';

import React from 'react';

// --- Icon Imports ---
import { MessageCircle } from 'lucide-react';
// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
/**
 * Component nút "Gọi điện" cho một tính năng sắp ra mắt.
 * Nút này bị vô hiệu hóa và hiển thị tooltip khi hover.
 */
export default function ZaloButton() {
    return (
        <div className="w-full cursor-not-allowed p-4">
            <Button
                variant='outline'
                className="w-full h-30 flex flex-col items-center justify-center gap-1 p-4"
                style={{ pointerEvents: 'none' }}
            >
                <MessageCircle  className="h-5 w-5" />
                <h4 className='text_w_700'>Nhắn tin trực tiếp</h4>
                <h5>Tính năng này đang phát triển, chưa thể thao tác!</h5>
            </Button>
        </div>
    );
}