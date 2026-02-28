'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './LeadTagConversations.module.css';

/**
 * Khi lọc theo thẻ LEAD/NOT_LEAD (leadStatusLabelId), hiển thị danh sách hội thoại từ conversationleadstatuses
 * và link mở từng hội thoại trong Pancake (pageId + conversationId).
 */
export default function LeadTagConversations({ labels = [] }) {
    const searchParams = useSearchParams();
    const leadStatusLabelId = searchParams.get('leadStatusLabelId');
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const labelName = leadStatusLabelId && labels.length
        ? (labels.find((l) => String(l._id) === leadStatusLabelId)?.name || 'Thẻ')
        : '';

    useEffect(() => {
        if (!leadStatusLabelId) {
            setList([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetch(`/api/conversation-lead-status?leadStatusLabelId=${encodeURIComponent(leadStatusLabelId)}`)
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return;
                if (data.success && Array.isArray(data.data)) {
                    setList(data.data);
                } else {
                    setList([]);
                    setError(data.error || 'Không tải được danh sách');
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err?.message || 'Lỗi kết nối');
                    setList([]);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [leadStatusLabelId]);

    if (!leadStatusLabelId) return null;

    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <span className={styles.title}>
                    Các hội thoại ({labelName || 'thẻ đã chọn'})
                </span>
                {list.length > 0 && (
                    <span className={styles.count}>{list.length} hội thoại</span>
                )}
            </div>
            {loading && <div className={styles.loading}>Đang tải...</div>}
            {error && <div className={styles.error}>{error}</div>}
            {!loading && !error && list.length > 0 && (
                <div className={styles.list}>
                    {list.map((item) => (
                        <div key={`${item.pageId}_${item.conversationId}`} className={styles.row}>
                            <span className={styles.name}>{item.name || '(Không tên)'}</span>
                            <span className={styles.page}>{item.pageDisplayName || item.pageId}</span>
                            {item.note && (
                                <span className={styles.note} title={item.note}>
                                    Lý do: {item.note}
                                </span>
                            )}
                            <Link
                                href={`/pancake/${item.pageId}?conversationId=${encodeURIComponent(item.conversationId)}`}
                                className={styles.link}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Mở hội thoại
                            </Link>
                        </div>
                    ))}
                </div>
            )}
            {!loading && !error && list.length === 0 && leadStatusLabelId && (
                <div className={styles.empty}>Chưa có hội thoại nào gán thẻ này.</div>
            )}
        </div>
    );
}
