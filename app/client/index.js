'use client';
import styles from './index.module.css';
import { useState, Suspense, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import CustomerTable from './ui/table';
import FilterControls from "./ui/filter";
import SettingLabel from "./ui/label";
import SettingData from "./ui/data";
import SettingZalo from './ui/zalo';
import BulkActions from './ui/run';
import RunningActions from './ui/action';
import SettingVariant from './ui/variant';
import SettingZaloRoles from './ui/zalos';
import ActionHistory from './ui/hisotry';
import ZaloSystemButton from './ui/zalo-system';
import { reloadCustomers } from '@/data/customers/wraperdata.db';

function TableSkeleton() {
    return (
        <div style={{ height: '500px', background: '#f8f9fa', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Đang tải dữ liệu...
        </div>
    );
}

export default function CustomerView({ customer, c, running, initialResult, user, sources, messageSources = [], labelData, formData, zaloData, users, variant, workflow, service, areaCustomers = [], filterCustomer = {} }) {
    const router = useRouter();
    const intervalRef = useRef(null);

    const [selectedCustomers, setSelectedCustomers] = useState(new Map());
    const [viewMode, setViewMode] = useState('manage');

    const handleActionComplete = () => setSelectedCustomers(new Map());
    const toggleViewMode = () => setViewMode(prev => prev === 'manage' ? 'view' : 'manage');

    // Chia lịch thành 2 trường hợp là đang chạy và đã hoàn thành
    const { runningSchedules, historySchedules } = useMemo(() => {
        return running.reduce((acc, schedule) => {
            const stats = schedule.statistics;
            if ((stats.completed + stats.failed) < stats.total) {
                acc.runningSchedules.push(schedule);
            } else {
                acc.historySchedules.push(schedule);
            }
            return acc;
        }, { runningSchedules: [], historySchedules: [] });
    }, [running]);

    // ===== Auto refresh mỗi 5s với router.refresh() =====
    // useEffect(() => {
    //     // Chỉ refresh khi có job đang chạy; nếu muốn luôn refresh thì bỏ điều kiện này
    //     const shouldPoll = true; // hoặc: runningSchedules.length > 0

    //     const startPolling = () => {
    //         if (intervalRef.current || !shouldPoll) return;
    //         intervalRef.current = setInterval(() => {
    //             // Tránh refresh khi tab ẩn để tiết kiệm tài nguyên
    //             if (typeof document !== 'undefined' && document.hidden) return;
    //             router.refresh();
    //         }, 5000);
    //     };

    //     const stopPolling = () => {
    //         if (intervalRef.current) {
    //             clearInterval(intervalRef.current);
    //             intervalRef.current = null;
    //         }
    //     };

    //     // Bật/tắt theo visibility
    //     const onVisibilityChange = () => {
    //         if (document.hidden) {
    //             stopPolling();
    //         } else {
    //             router.refresh(); // refresh ngay khi quay lại tab
    //             startPolling();
    //         }
    //     };

    //     // Bật lần đầu
    //     startPolling();

    //     // Lắng nghe thay đổi visibility + focus
    //     document.addEventListener('visibilitychange', onVisibilityChange);
    //     window.addEventListener('focus', onVisibilityChange);

    //     // Dọn dẹp
    //     return () => {
    //         stopPolling();
    //         document.removeEventListener('visibilitychange', onVisibilityChange);
    //         window.removeEventListener('focus', onVisibilityChange);
    //     };
    // }, [router /* , runningSchedules.length */]);
    // =====================================================

    return (
        <div className={styles.container}>
            {viewMode === 'manage' && (
                <>
                    <div className={styles.filterSection}>
                        <div className={styles.filterHeader}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <SettingZalo user={user && user[0] ? user[0] : null} zalo={zaloData} />
                                <RunningActions user={user} running={runningSchedules} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <ZaloSystemButton />
                                {!c.type && (
                                    <BulkActions
                                        selectedCustomers={selectedCustomers}
                                        onActionComplete={handleActionComplete}
                                        labels={labelData}
                                        variants={variant}
                                        users={users.filter(u => u.role[0] === 'Sale' || u.role[0] === 'Admin')}
                                        workflows={workflow}
                                        auth={user && user[0] ? user[0] : null}
                                    />
                                )}
                                <ActionHistory history={historySchedules} />
                                {user && user[0] && user[0].role && !user[0].role.includes('Sale') && (
                                    <>
                                        <SettingZaloRoles data={zaloData} allUsers={users.filter(u => u.role[0] === 'Sale' || u.role[0] === 'Admin')} />
                                        <SettingVariant data={variant} />
                                        <SettingLabel data={labelData} />
                                    </>
                                )}
                                <SettingData data={formData} service={service} customer={customer} />
                            </div>
                        </div>
                    </div>
                    <FilterControls
                        auth={user && user[0] ? user[0] : null}
                        zaloAccounts={zaloData}
                        users={users.filter(u => u.role[0] === 'Sale' || u.role[0] === 'Admin')}
                        labels={labelData}
                        sources={sources}
                        messageSources={messageSources}
                        service={service}
                        areaCustomers={areaCustomers}
                        filterCustomer={filterCustomer}
                    />
                </>
            )}
            <Suspense fallback={<TableSkeleton />}>
                <CustomerTable
                    data={initialResult.data}
                    total={initialResult.total}
                    user={user}
                    selectedCustomers={selectedCustomers}
                    setSelectedCustomers={setSelectedCustomers}
                    viewMode={viewMode}
                    onToggleViewMode={toggleViewMode}
                    zalo={zaloData}
                    service={service}
                />
            </Suspense>
        </div>
    );
}
