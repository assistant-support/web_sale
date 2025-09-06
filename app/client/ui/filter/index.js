'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useMemo, useRef } from 'react';
import styles from './index.module.css';
import Menu from '@/components/(ui)/(button)/menu';

export default function FilterControls({
    sources = [], // Dữ liệu cho bộ lọc "Nguồn"
    users = [],   // Dữ liệu cho bộ lọc "Người phụ trách"
    tags = [],    // Dữ liệu cho bộ lọc "Dịch vụ quan tâm"
    auth
}) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { replace } = useRouter();
    const searchTimeout = useRef(null);

    // State cho trạng thái mở/đóng của các menu lọc
    const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
    const [isPipelineStatusMenuOpen, setIsPipelineStatusMenuOpen] = useState(false);
    const [isTagsMenuOpen, setIsTagsMenuOpen] = useState(false);
    const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);
    // Hàm tạo URL mới với các tham số đã cập nhật
    const createURL = useCallback((paramsToUpdate) => {
        const params = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(paramsToUpdate)) {
            if (value || value === false || value === 0) {
                params.set(key, String(value));
            } else {
                params.delete(key);
            }
        }
        params.set('page', '1');
        replace(`${pathname}?${params.toString()}`);
    }, [searchParams, pathname, replace]);

    // Hàm xử lý tìm kiếm với độ trễ (debounce)
    const handleSearch = useCallback((term) => {
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            createURL({ query: term });
        }, 500);
    }, [createURL]);

    // Các tùy chọn tĩnh cho các bộ lọc dropdown
    const staticOptions = useMemo(() => ({
        pipelineStatus: [
            { value: 'new_unconfirmed', name: 'Mới - Chưa xác nhận' },
            { value: 'missing_info', name: 'Thiếu thông tin' },
            { value: 'valid_waiting_msg', name: 'Chờ nhắn tin' },
            { value: 'assigned', name: 'Đã phân bổ' },
            { value: 'consulted', name: 'Đã tư vấn' },
            { value: 'appointed', name: 'Đặt lịch' },
            { value: 'serviced', name: 'Đã sử dụng dịch vụ' },
            { value: 'rejected', name: 'Từ chối' },
        ],
        zaloPhase: [
            { value: 'welcome', name: 'Chào mừng' },
            { value: 'nurturing', name: 'Nuôi dưỡng' },
            { value: 'post_surgery', name: 'Hậu phẫu' },
        ]
    }), []);

    // Hàm tiện ích để lấy tên của tùy chọn đang được chọn
    const getSelectedName = useCallback((param, data, defaultText, keyField = '_id', nameField = 'name') => {
        const value = searchParams.get(param);
        if (!value) return defaultText;
        if (param === 'tags' && value === 'null') return 'Chưa xác định';
        const selected = data.find(item => String(item[keyField]) === value);
        return selected ? selected[nameField] : defaultText;
    }, [searchParams]);

    return (
        <div className={styles.wrapper}>
            {/* Hàng 1: Tìm kiếm & các bộ lọc chính */}
            <div className={styles.filterRow}>
                <div style={{ flex: 1, display: 'flex' }}>
                    <input
                        type="text"
                        placeholder="Tìm theo tên, SĐT..."
                        className='input'
                        style={{ width: '100%' }}
                        defaultValue={searchParams.get('query') || ''}
                        onChange={(e) => handleSearch(e.target.value)}
                    />
                </div>

                {/* Lọc theo Trạng thái Chăm sóc */}
                <div style={{ flex: 1 }}>
                    <Menu
                        isOpen={isPipelineStatusMenuOpen} onOpenChange={setIsPipelineStatusMenuOpen}
                        customButton={<div className='input text_6_400'>{getSelectedName('pipelineStatus', staticOptions.pipelineStatus, 'Trạng thái chăm sóc', 'value')}</div>}
                        menuItems={
                            <div className={styles.menulist}>
                                <p className='text_6_400' onClick={() => { createURL({ pipelineStatus: '' }); setIsPipelineStatusMenuOpen(false); }}>Tất cả trạng thái</p>
                                {staticOptions.pipelineStatus.map(s => <p key={s.value} className='text_6_400' onClick={() => { createURL({ pipelineStatus: s.value }); setIsPipelineStatusMenuOpen(false); }}>{s.name}</p>)}
                            </div>
                        } menuPosition="bottom"
                    />
                </div>
                {/* Lọc theo Người phụ trách */}
                {!auth.role.includes('Sale') && (
                    <div style={{ flex: 1 }}>
                        <Menu
                            isOpen={isAssigneeMenuOpen} onOpenChange={setIsAssigneeMenuOpen}
                            customButton={<div className='input text_6_400'>{getSelectedName('assignee', users, 'Người phụ trách')}</div>}
                            menuItems={
                                <div className={styles.menulist}>
                                    <p className='text_6_400' onClick={() => { createURL({ assignee: '' }); setIsAssigneeMenuOpen(false); }}>Tất cả</p>
                                    {users.map(u => <p key={u._id} className='text_6_400' onClick={() => { createURL({ assignee: u._id }); setIsAssigneeMenuOpen(false); }}>{u.name}</p>)}
                                </div>
                            } menuPosition="bottom"
                        />
                    </div>
                )}
            </div>

            {/* Hàng 2: Các bộ lọc phụ */}
            <div className={styles.filterRow}>
                {/* Lọc theo Nguồn */}
                <div style={{ flex: 1 }}>
                    <Menu
                        isOpen={isSourceMenuOpen} onOpenChange={setIsSourceMenuOpen}
                        customButton={<div className='input text_6_400'>{getSelectedName('source', sources, 'Tất cả nguồn')}</div>}
                        menuItems={
                            <div className={styles.menulist}>
                                <p className='text_6_400' onClick={() => { createURL({ source: '' }); setIsSourceMenuOpen(false); }}>Tất cả nguồn</p>
                                {sources.map(s => <p key={s._id} className='text_6_400' onClick={() => { createURL({ source: s._id }); setIsSourceMenuOpen(false); }}>{s.name}</p>)}
                            </div>
                        } menuPosition="bottom"
                    />
                </div>
                {/* Lọc theo Dịch vụ quan tâm */}
                <div style={{ flex: 1 }}>
                    <Menu
                        isOpen={isTagsMenuOpen} onOpenChange={setIsTagsMenuOpen}
                        customButton={<div className='input text_6_400'>{getSelectedName('tags', tags, 'Dịch vụ quan tâm', 'name', 'name')}</div>}
                        menuItems={
                            <div className={styles.menulist}>
                                <p className='text_6_400' onClick={() => { createURL({ tags: '' }); setIsTagsMenuOpen(false); }}>Tất cả dịch vụ</p>
                                {tags.map(t => <p key={t.name} className='text_6_400' onClick={() => { createURL({ tags: t.name }); setIsTagsMenuOpen(false); }}>{t.name}</p>)}
                                <p className='text_6_400' onClick={() => { createURL({ tags: 'null' }); setIsTagsMenuOpen(false); }}>Chưa xác định</p>
                            </div>
                        } menuPosition="bottom"
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <input
                        type="date"
                        className='input'
                        defaultValue={searchParams.get('startDate') || ''}
                        onChange={(e) => createURL({ startDate: e.target.value, endDate: searchParams.get('endDate') })}
                        style={{ flex: 1 }}
                    />
                    <h5>đến</h5>
                    <input
                        type="date"
                        className='input'
                        defaultValue={searchParams.get('endDate') || ''}
                        onChange={(e) => createURL({ startDate: searchParams.get('startDate'), endDate: e.target.value })}
                        style={{ flex: 1 }}
                    />
                </div>
            </div>
        </div>
    );
}