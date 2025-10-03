'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getPagesFromAPI } from '@/lib/pancake-api';
import { useNotifications } from '@/contexts/page_pancake';

export default function PageList() {
    const { pages, setInitialPages, resetUnreadCount } = useNotifications();

    useEffect(() => {
        if (pages.length === 0) {
            const fetchPages = async () => {
                const apiPages = await getPagesFromAPI();
                if (apiPages) {
                    setInitialPages(apiPages);
                }
            };
            fetchPages();
        }
    }, [pages.length, setInitialPages]);

    const handlePageClick = (pageId) => {
        resetUnreadCount(pageId);
    }

    return (
        <div className="w-full bg-white rounded-md border border-gray-200 flex-1 p-6">
            <div className="mb-6 pb-4 border-b border-gray-200">
                <p className="text-sm text-gray-800">Quản lý các trang kết nối khách hàng</p>
            </div>
            {pages.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {pages.map((page) => (
                        <Link href={`/pancake/${page.id}`} key={page.id} className="block h-full" onClick={() => handlePageClick(page.id)}>
                            <div className="relative bg-white border border-gray-200 rounded-lg p-4 flex items-center space-x-4 cursor-pointer hover:border-blue-500 hover:shadow-md h-full">
                                {page.unreadCount > 0 && (
                                    <div className="absolute top-[-8px] right-[-8px] bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                                        {page.unreadCount}
                                    </div>
                                )}
                                <div className="relative">
                                    <Image src={page.avatar} alt={page.name} width={48} height={48} className="rounded-md object-cover" unoptimized />
                                    <div className="absolute bottom-[-4px] right-[-4px] bg-white rounded-full p-0.5">
                                        {page.platform === 'facebook' && <Image src='https://pancake.vn/static/images/facebook-logo.png' alt='Facebook' width={16} height={16} />}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <p className="text-md font-semibold text-gray-900 truncate" title={page.name}>{page.name}</p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <div className="text-center py-10 text-gray-500">Đang tải danh sách trang...</div>
            )}
        </div>
    );
}