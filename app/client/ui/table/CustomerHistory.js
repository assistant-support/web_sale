'use client';

import React, { useState, useEffect } from 'react';

// --- Action & Data Function Imports ---
import { history_data } from '@/data/actions/get';

// =============================================================
// == COMPONENT CHÍNH CỦA PHẦN LỊCH SỬ TƯƠNG TÁC
// =============================================================

export default function CustomerHistory({ customer, showNoti }) {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            setIsLoading(true);
            try {
                const result = await history_data(customer._id, 'customer');
                if (result.success) {
                    setHistory(result.data);
                } else {
                    showNoti(false, result.error || "Không thể tải lịch sử.");
                }
            } catch (error) {
                showNoti(false, "Lỗi khi tải lịch sử.");
            } finally {
                setIsLoading(false);
            }
        };

        if (customer._id) {
            fetchHistory();
        }
    }, [customer._id, showNoti]);

    return (
        <div className="p-4 max-h-[calc(80vh-100px)] overflow-y-auto">
            <h4 style={{ marginBottom: 8 }}>Lịch sử tương tác</h4>
            {isLoading ? (
                <div className="text-center text-muted-foreground p-8">Đang tải...</div>
            ) : history.length > 0 ? (
                <div className="space-y-3">
                    {history.map((item, i) => (
                        <div key={item._id || i} className="border p-3 rounded-md bg-muted/20">
                            <div className="flex justify-between items-center mb-1">
                                <h5 className="font-semibold text-sm">Hành động: {item.type || 'Hành động'}</h5>
                                <h6 className="text-xs text-muted-foreground">
                                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                                </h6>
                            </div>
                            <h6 className={`text-sm font-medium ${item?.status?.status ? 'text-green-600' : 'text-red-600'}`}>
                                Trạng thái: {item?.status?.status ? 'Thành công' : 'Thất bại'}
                            </h6>
                            {item.createBy && (
                                <h6 className="text-xs text-muted-foreground">
                                    Thực hiện bởi: {item.createBy.name}
                                </h6>
                            )}
                            <h6 className="text-sm text-muted-foreground mt-1">
                                Nội dung: {item.status.message || 'Không có mô tả.'}
                            </h6>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center text-muted-foreground p-8">Chưa có lịch sử.</div>
            )}
        </div>
    );
}