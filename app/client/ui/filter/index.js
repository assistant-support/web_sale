// components/FilterControls/index.jsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useMemo, useRef } from 'react';
import styles from './index.module.css';
import Menu from '@/components/(ui)/(button)/menu';

export default function FilterControls({
    sources = [],
    messageSources = [],
    users = [],
    // Bạn có thể truyền "services" (mới) hoặc "service" (cũ). Ưu tiên "services".
    services: servicesProp = [],
    service = [],
    auth = { role: [] },
    areaCustomers = [],
    filterCustomer = {},
}) {
    const services = servicesProp.length ? servicesProp : service;
    
    // Đảm bảo auth luôn có giá trị hợp lệ, tránh lỗi khi auth là null hoặc undefined
    const safeAuth = auth || { role: [] };

    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { replace } = useRouter();
    const searchTimeout = useRef(null);

    // Local state cho bộ lọc ngày; chỉ áp dụng khi người dùng nhấn Enter
    const [startDateLocal, setStartDateLocal] = useState(searchParams.get('startDate') || '');
    const [endDateLocal, setEndDateLocal] = useState(searchParams.get('endDate') || new Date().toISOString().split('T')[0]);

    const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
    const [isPipelineStatusMenuOpen, setIsPipelineStatusMenuOpen] = useState(false);
    const [isTagsMenuOpen, setIsTagsMenuOpen] = useState(false);
    const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);
    const [isAreaCustomerMenuOpen, setIsAreaCustomerMenuOpen] = useState(false);
    const [isBirthMonthMenuOpen, setIsBirthMonthMenuOpen] = useState(false);

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

    const handleSearch = useCallback((term) => {
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            createURL({ query: term });
        }, 500);
    }, [createURL]);

    // Trạng thái cứng đầy đủ
    const staticOptions = useMemo(() => ({
        pipelineStatus: [
            { value: 'new_unconfirmed_1', name: 'Data mới' },
            { value: 'missing_info_1', name: 'Thiếu thông tin' },
            { value: 'not_valid_1', name: 'Không hợp lệ' },
            { value: 'duplicate_merged_1', name: 'Trùng lặp (đã gộp)' },
            { value: 'rejected_immediate_1', name: 'Từ chối ngay' },
            { value: 'valid_1', name: 'Hợp lệ (chờ xử lý)' },
            { value: 'msg_success_2', name: 'Gửi tin nhắn thành công' },
            { value: 'msg_error_2', name: 'Gửi tin nhắn thất bại' },
            { value: 'noikhoa_3', name: 'Đã phân bổ: nội khoa' },
            { value: 'ngoaikhoa_3', name: 'Đã phân bổ: ngoại khoa' },
            { value: 'undetermined_3', name: 'Chưa phân bổ' },
            { value: 'consulted_pending_4', name: 'Đã tư vấn, chờ quyết định' },
            { value: 'scheduled_unconfirmed_4', name: 'Đã lên lịch, chưa xác nhận' },
            { value: 'callback_4', name: 'Yêu cầu gọi lại' },
            { value: 'not_interested_4', name: 'Không quan tâm' },
            { value: 'no_contact_4', name: 'Không liên lạc được' },
            { value: 'confirmed_5', name: 'Lịch hẹn đã xác nhận' },
            { value: 'postponed_5', name: 'Lịch hẹn đã hoãn' },
            { value: 'canceled_5', name: 'Lịch hẹn đã hủy' },
            { value: 'serviced_completed_6', name: 'Dịch vụ đã hoàn thành' },
            { value: 'serviced_in_progress_6', name: 'Dịch vụ đang thực hiện' },
            { value: 'rejected_after_consult_6', name: 'Từ chối sau tư vấn' },
        ],
        zaloPhase: [
            { value: 'welcome', name: 'Chào mừng' },
            { value: 'nurturing', name: 'Nuôi dưỡng' },
            { value: 'pre_surgery', name: 'Tiền phẫu' },
            { value: 'post_surgery', name: 'Hậu phẫu' },
            { value: 'longterm', name: 'Dài hạn' },
        ],
    }), []);

    // Nguồn đặc biệt (cố định)
    const specialSources = useMemo(() => [
        { _id: 'Trực tiếp', name: 'Trực tiếp', isSpecialSource: true }
    ], []);

    const getSelectedName = useCallback((param, data, defaultText, keyField = '_id', nameField = 'name') => {
        const value = searchParams.get(param);
        if (!value) return defaultText;
        if (param === 'tags' && value === 'null') return 'Chưa xác định';
        // Kiểm tra nguồn đặc biệt trước
        if (param === 'source') {
            const specialSource = specialSources.find((item) => String(item[keyField]) === value);
            if (specialSource) return specialSource[nameField];
        }
        // Kiểm tra cả sources thường và messageSources
        let selected = data.find((item) => String(item[keyField]) === value);
        if (!selected && param === 'source') {
            // Nếu không tìm thấy trong data, tìm trong messageSources
            selected = messageSources.find((item) => String(item[keyField]) === value);
        }
        return selected ? selected[nameField] : defaultText;
    }, [searchParams, messageSources, specialSources]);

    return (
        <div className={styles.wrapper}>
            {/* Hàng 1 */}
            <div className={styles.filterRow}>
                <div style={{ flex: 1, display: 'flex' }}>
                    <input
                        type="text"
                        placeholder="Tìm theo tên, SĐT..."
                        className="input"
                        style={{ width: '100%' }}
                        defaultValue={searchParams.get('query') || ''}
                        onChange={(e) => handleSearch(e.target.value)}
                    />
                </div>

                {/* Trạng thái chăm sóc */}
                <div style={{ flex: 1 }}>
                    <Menu
                        isOpen={isPipelineStatusMenuOpen}
                        onOpenChange={setIsPipelineStatusMenuOpen}
                        customButton={
                            <div className="input text_6_400">
                                {getSelectedName('pipelineStatus', staticOptions.pipelineStatus, 'Trạng thái chăm sóc', 'value', 'name')}
                            </div>
                        }
                        menuItems={
                            <div className={`${styles.menulist} scroll`}>
                                <p className="text_6_400" onClick={() => { createURL({ pipelineStatus: '' }); setIsPipelineStatusMenuOpen(false); }}>
                                    Tất cả trạng thái
                                </p>
                                {staticOptions.pipelineStatus.map((s) => (
                                    <p key={s.value} className="text_6_400" onClick={() => { createURL({ pipelineStatus: s.value }); setIsPipelineStatusMenuOpen(false); }}>
                                        {s.name}
                                    </p>
                                ))}
                            </div>
                        }
                        menuPosition="bottom"
                    />
                </div>

                {/* Người phụ trách */}
                {!safeAuth.role?.includes?.('Sale') && (
                    <div style={{ flex: 1 }}>
                        <Menu
                            isOpen={isAssigneeMenuOpen}
                            onOpenChange={setIsAssigneeMenuOpen}
                            customButton={<div className="input text_6_400">{getSelectedName('assignee', users, 'Người phụ trách')}</div>}
                            menuItems={
                                <div className={styles.menulist}>
                                    <p className="text_6_400" onClick={() => { createURL({ assignee: '' }); setIsAssigneeMenuOpen(false); }}>
                                        Tất cả
                                    </p>
                                    {users.map((u) => (
                                        <p key={u._id} className="text_6_400" onClick={() => { createURL({ assignee: u._id }); setIsAssigneeMenuOpen(false); }}>
                                            {u.name}
                                        </p>
                                    ))}
                                </div>
                            }
                            menuPosition="bottom"
                        />
                    </div>
                )}

                {/* Khu vực */}
                <div style={{ flex: 1 }}>
                    <Menu
                        isOpen={isAreaCustomerMenuOpen}
                        onOpenChange={setIsAreaCustomerMenuOpen}
                        customButton={<div className="input text_6_400">{getSelectedName('areaCustomer', areaCustomers, 'Khu vực', '_id', 'name')}</div>}
                        menuItems={
                            <div className={`${styles.menulist} scroll`}>
                                <p className="text_6_400" onClick={() => { createURL({ areaCustomer: '' }); setIsAreaCustomerMenuOpen(false); }}>
                                    Tất cả khu vực
                                </p>
                                {areaCustomers.map((area) => (
                                    <p key={area._id} className="text_6_400" onClick={() => { createURL({ areaCustomer: area._id }); setIsAreaCustomerMenuOpen(false); }}>
                                        {area.name} {area.type_area ? `(${area.type_area})` : ''}
                                    </p>
                                ))}
                            </div>
                        }
                        menuPosition="bottom"
                    />
                </div>
            </div>

            {/* Hàng 2 */}
            <div className={styles.filterRow}>
                {/* Nguồn */}
                <div style={{ flex: 1 }}>
                    <Menu
                        isOpen={isSourceMenuOpen}
                        onOpenChange={setIsSourceMenuOpen}
                        customButton={<div className="input text_6_400">{getSelectedName('source', [...sources, ...specialSources, ...messageSources], 'Tất cả nguồn')}</div>}
                        menuItems={
                            <div className={`${styles.menulist} scroll`}>
                                <p className="text_6_400" onClick={() => { createURL({ source: '' }); setIsSourceMenuOpen(false); }}>
                                    Tất cả nguồn
                                </p>
                                {sources.length > 0 && (
                                    <>
                                        {sources.map((s) => (
                                            <p key={s._id} className="text_6_400" onClick={() => { createURL({ source: s._id }); setIsSourceMenuOpen(false); }}>
                                                {s.name}
                                            </p>
                                        ))}
                                    </>
                                )}
                                {specialSources.length > 0 && (
                                    <>
                                        {specialSources.map((s) => (
                                            <p key={s._id} className="text_6_400" onClick={() => { createURL({ source: s._id }); setIsSourceMenuOpen(false); }}>
                                                {s.name}
                                            </p>
                                        ))}
                                    </>
                                )}
                                {messageSources.length > 0 && (
                                    <>
                                        {messageSources.map((s) => (
                                            <p key={s._id} className="text_6_400" onClick={() => { createURL({ source: s._id }); setIsSourceMenuOpen(false); }}>
                                                {s.name}
                                            </p>
                                        ))}
                                    </>
                                )}
                            </div>
                        }
                        menuPosition="bottom"
                    />
                </div>

                {/* Dịch vụ quan tâm (tags theo ObjectId) */}
                <div style={{ flex: 1 }}>
                    <Menu
                        isOpen={isTagsMenuOpen}
                        onOpenChange={setIsTagsMenuOpen}
                        customButton={<div className="input text_6_400">{getSelectedName('tags', services, 'Dịch vụ quan tâm', '_id', 'name')}</div>}
                        menuItems={
                            <div className={styles.menulist}>
                                <p className="text_6_400" onClick={() => { createURL({ tags: '' }); setIsTagsMenuOpen(false); }}>
                                    Tất cả dịch vụ
                                </p>
                                {services.map((t) => (
                                    <p key={t._id} className="text_6_400" onClick={() => { createURL({ tags: t._id }); setIsTagsMenuOpen(false); }}>
                                        {t.name}
                                    </p>
                                ))}
                                <p className="text_6_400" onClick={() => { createURL({ tags: 'null' }); setIsTagsMenuOpen(false); }}>
                                    Chưa xác định
                                </p>
                            </div>
                        }
                        menuPosition="bottom"
                    />
                </div>

                {/* Tháng sinh */}
                <div style={{ flex: 1 }}>
                    <Menu
                        isOpen={isBirthMonthMenuOpen}
                        onOpenChange={(open) => {
                            setIsBirthMonthMenuOpen(open);
                            if (open) {
                                // Log để debug khi mở dropdown
                                console.log('📊 [FilterControls] filterCustomer data:', filterCustomer);
                                console.log('📊 [FilterControls] Số lượng mỗi tháng:', {
                                    month1: filterCustomer?.month1?.length || 0,
                                    month2: filterCustomer?.month2?.length || 0,
                                    month3: filterCustomer?.month3?.length || 0,
                                    month4: filterCustomer?.month4?.length || 0,
                                    month5: filterCustomer?.month5?.length || 0,
                                    month6: filterCustomer?.month6?.length || 0,
                                    month7: filterCustomer?.month7?.length || 0,
                                    month8: filterCustomer?.month8?.length || 0,
                                    month9: filterCustomer?.month9?.length || 0,
                                    month10: filterCustomer?.month10?.length || 0,
                                    month11: filterCustomer?.month11?.length || 0,
                                    month12: filterCustomer?.month12?.length || 0,
                                });
                            }
                        }}
                        customButton={
                            <div className="input text_6_400">
                                {(() => {
                                    const month = searchParams.get('birthMonth');
                                    if (!month) return 'Tháng sinh';
                                    const monthNames = [
                                        'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
                                        'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
                                        'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
                                    ];
                                    return monthNames[parseInt(month) - 1] || 'Tháng sinh';
                                })()}
                            </div>
                        }
                        menuItems={
                            <div className={`${styles.menulist} scroll`}>
                                <p className="text_6_400" onClick={() => { createURL({ birthMonth: '' }); setIsBirthMonthMenuOpen(false); }}>
                                    Tất cả tháng
                                </p>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => {
                                    const monthKey = `month${month}`;
                                    const customerCount = filterCustomer && filterCustomer[monthKey] ? filterCustomer[monthKey].length : 0;
                                    return (
                                        <p 
                                            key={month} 
                                            className="text_6_400" 
                                            onClick={() => { 
                                                console.log(`🖱️ [FilterControls] Click vào Tháng ${month}, số lượng: ${customerCount}`);
                                                createURL({ birthMonth: String(month) }); 
                                                setIsBirthMonthMenuOpen(false); 
                                            }}
                                        >
                                            Tháng {month} ({customerCount})
                                        </p>
                                    );
                                })}
                            </div>
                        }
                        menuPosition="bottom"
                    />
                </div>

                {/* Khoảng ngày */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <input
                        type="date"
                        className="input"
                        value={startDateLocal}
                        onChange={(e) => setStartDateLocal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') createURL({ startDate: startDateLocal, endDate: endDateLocal }); }}
                        style={{ flex: 1 }}
                    />
                    <h5>đến</h5>
                    <input
                        type="date"
                        className="input"
                        value={endDateLocal}
                        onChange={(e) => setEndDateLocal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') createURL({ startDate: startDateLocal, endDate: endDateLocal }); }}
                        style={{ flex: 1 }}
                    />
                </div>
            </div>
        </div>
    );
}
