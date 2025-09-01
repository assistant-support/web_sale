'use client';
import styles from './index.module.css';
import { useState, Suspense, useMemo } from 'react';
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
import { reloadUser } from '@/data/actions/reload';

function TableSkeleton() {
    return <div style={{ height: '500px', background: '#f8f9fa', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Đang tải dữ liệu...</div>;
}
export default function CustomerView({ c, running, initialResult, user, sources, labelData, formData, zaloData, users, variant, workflow }) {
    const [selectedCustomers, setSelectedCustomers] = useState(new Map());
    const [viewMode, setViewMode] = useState('manage');
    const handleActionComplete = () => {
        setSelectedCustomers(new Map());
    };
    const toggleViewMode = () => {
        setViewMode(prev => prev === 'manage' ? 'view' : 'manage');
    };

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

    return (
        <div className={styles.container}>
            {viewMode === 'manage' && (
                <>
                    <div className={styles.filterSection}>
                        <div className={styles.filterHeader}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <SettingZalo user={user[0]} zalo={zaloData} />
                                <RunningActions user={user} running={runningSchedules} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {!c.type && (
                                    <BulkActions
                                        selectedCustomers={selectedCustomers}
                                        onActionComplete={handleActionComplete}
                                        labels={labelData}
                                        variants={variant}
                                        users={users.filter(u => u.role[0] === 'Sale' || u.role[0] === 'Admin')}
                                        workflows={workflow}
                                    />
                                )}
                                <ActionHistory history={historySchedules} />
                                <SettingZaloRoles data={zaloData} allUsers={users.filter(u => u.role[0] === 'Sale' || u.role[0] === 'Admin')} />
                                <SettingVariant data={variant} />
                                <SettingLabel data={labelData} />
                                <SettingData data={formData} />
                            </div>
                        </div>
                    </div>
                    <FilterControls zaloAccounts={zaloData} users={users.filter(u => u.role[0] === 'Sale' || u.role[0] === 'Admin')} labels={labelData} sources={sources} areas={['Biên Hòa', 'Long Khánh', 'Long Thành', 'TP HCM', 'Khác']} />
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
                />
            </Suspense>
        </div>
    );
}