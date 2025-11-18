'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import ChatClient from '@/app/pancake/[pageId]/ChatClient';
import { getPagesFromAPI, PANCAKE_USER_ACCESS_TOKEN } from '@/lib/pancake-api';

export default function ZaloPancake({ customer }) {
    const [loading, setLoading] = useState(true);
    const [pageConfig, setPageConfig] = useState(null);
    const [error, setError] = useState(null);

    // Build preselect from customer
    const preselect = useMemo(() => {
        const name = customer?.name || customer?.fullname || customer?.customerName || '';
        const phoneCandidates = [
            customer?.phone,
            customer?.phones?.[0],
            customer?.zalo_phone,
        ].filter(Boolean);

        let latestUidEntry = null;
        if (Array.isArray(customer?.uid) && customer.uid.length > 0) {
            latestUidEntry = customer.uid.reduce((latest, entry) => {
                if (!entry) return latest;
                const latestDate = latest?.createAt || latest?.createdAt || latest?._createdAt || null;
                const entryDate = entry?.createAt || entry?.createdAt || entry?._createdAt || null;

                if (!latestDate && entryDate) return entry;
                if (!entryDate && latestDate) return latest;
                if (!latestDate && !entryDate) return entry; // fallback: lấy entry mới nhất trong vòng lặp

                const latestTs = new Date(latestDate).getTime();
                const entryTs = new Date(entryDate).getTime();
                if (Number.isNaN(entryTs)) return latest;
                if (Number.isNaN(latestTs)) return entry;
                return entryTs >= latestTs ? entry : latest;
            }, null) || customer.uid[customer.uid.length - 1];
        }

        const latestUid = latestUidEntry?.uid ? String(latestUidEntry.uid).trim() : null;
        const latestZaloAccountId = latestUidEntry?.zalo || null;

        const result = {
            name,
            phones: phoneCandidates,
            uid: latestUid,
            zaloAccountId: latestZaloAccountId,
        };
        
        return result;
    }, [customer]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true);
                const pages = await getPagesFromAPI();
                if (!mounted) return;
                if (Array.isArray(pages)) {
                    const zaloPersonal = pages.find(p => p.platform === 'personal_zalo');
                    if (zaloPersonal) {
                        setPageConfig(zaloPersonal);
                    } else {
                        setError('Không tìm thấy trang Pancake Zalo cá nhân');
                    }
                } else {
                    setError('Không thể tải danh sách trang từ Pancake');
                }
            } catch (e) {
                setError(e?.message || 'Lỗi khi tải cấu hình Pancake');
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

    if (loading) {
        return (
            <div className="w-full p-4 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span>Đang tải Zalo Pancake…</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full p-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
                    {error}
                </div>
            </div>
        );
    }

    if (!pageConfig) return null;

    return (
        <div className="w-full h-[70vh]">
            <ChatClient
                pageConfig={pageConfig}
                label={[]}
                token={PANCAKE_USER_ACCESS_TOKEN}
                preselect={preselect}
                hideSidebar={true}
            />
        </div>
    );
}

