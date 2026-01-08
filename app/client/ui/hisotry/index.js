'use client';

import { useState, useMemo, useEffect } from 'react';
import styles from './index.module.css'; // Đổi tên file CSS để khớp
import FlexiblePopup from '@/components/(features)/(popup)/popup_right';
import { Svg_History } from '@/components/(icon)/svg';

// --- CÁC COMPONENT CON & HÀM HỖ TRỢ ---

const getActionTypeName = (type) => {
    switch (type) {
        case 'findUid': return 'Tìm UID';
        case 'sendMessage': return 'Gửi Tin';
        case 'addFriend': return 'Kết bạn';
        default: return 'Hành động';
    }
}

function HistoryItem({ job, onShowTasks, onShowJobDetails }) {
    if (!job || !job._id) return null;
    const { total, completed, failed } = job.statistics;

    return (
        <div className={styles.detailItem}>
            <div className={styles.detailHeader}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <h5>{job.jobName}</h5>
                    <h6>Người tạo: {job.createdBy?.name || 'Không rõ'}</h6>
                </div>
                <h6>{job.zaloAccount?.name || 'Không rõ'} - {getActionTypeName(job.actionType)}</h6>
            </div>
            <div className={styles.progressInfo}>
                <h6>Hoàn thành: {new Date(job.updatedAt).toLocaleString('vi-VN')}</h6>
            </div>
            <div className={styles.messageContent}>
                <h6>Thống kê:
                    <span style={{ color: 'var(--green)', marginLeft: '8px' }}>Thành công: {completed}</span>,
                    <span style={{ color: 'var(--red)', marginLeft: '8px' }}>Thất bại: {failed}</span>,
                    <span style={{ marginLeft: '8px' }}>Tổng: {total}</span>
                </h6>
            </div>
            <div className={styles.detailActions}>
                <button className='btn_s' onClick={() => onShowTasks(job)}>
                    <h6 style={{ color: 'var(--text-primary)' }}>Danh sách thực hiện</h6>
                </button>
                <button className='btn_s_b' onClick={() => onShowJobDetails(job)}>
                    <h6 style={{ color: 'white' }}>Chi tiết lịch trình</h6>
                </button>
            </div>
        </div>
    );
}

// Component hiển thị chi tiết một Task
function HistoryTaskItem({ task, actionType, zaloAccountId }) {
    const [isFriend, setIsFriend] = useState(null);
    const [isLoadingFriendStatus, setIsLoadingFriendStatus] = useState(false);
    
    const didSucceed = task.history?.status?.status === true;
    const statusText = didSucceed ? 'Thành công' : 'Thất bại';
    const statusKey = didSucceed ? 'success' : 'failed';
    const errorMessage = !didSucceed ? task.history?.status?.message : null;

    // Khởi tạo giá trị từ database
    const initialIsFriend = task.person?.uid?.[0]?.isFriend;
    
    // Gọi API để kiểm tra và cập nhật trạng thái bạn bè (chỉ khi actionType === 'checkFriend')
    useEffect(() => {
        if (actionType !== 'checkFriend') {
            return;
        }
        
        if (!task.person?._id || !zaloAccountId) {
            // Nếu không có zaloAccountId, vẫn hiển thị giá trị từ database
            if (initialIsFriend !== undefined && initialIsFriend !== null) {
                setIsFriend(initialIsFriend === 1);
            }
            return;
        }
        
        // Nếu đã có giá trị từ database, hiển thị ngay
        if (initialIsFriend !== undefined && initialIsFriend !== null) {
            setIsFriend(initialIsFriend === 1);
        }
        
        // Gọi API để kiểm tra và cập nhật trạng thái bạn bè
        setIsLoadingFriendStatus(true);
        fetch('/api/zalo/friend-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customerIds: [task.person._id],
                zaloAccountId: zaloAccountId
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.results?.[0]) {
                const friendStatus = data.results[0].isFriend;
                setIsFriend(friendStatus === 1);
            } else {
                // Nếu API thất bại, vẫn hiển thị giá trị từ database
                if (initialIsFriend !== undefined && initialIsFriend !== null) {
                    setIsFriend(initialIsFriend === 1);
                }
            }
        })
        .catch(err => {
            console.error('[HistoryTaskItem] Lỗi khi kiểm tra bạn bè:', err);
            // Nếu có lỗi, vẫn hiển thị giá trị từ database
            if (initialIsFriend !== undefined && initialIsFriend !== null) {
                setIsFriend(initialIsFriend === 1);
            }
        })
        .finally(() => {
            setIsLoadingFriendStatus(false);
        });
    }, [actionType, task.person?._id, zaloAccountId, initialIsFriend]);

    return (
        <div className={styles.taskItem}>
            <div className={styles.taskInfo}>
                <h5>{task.person.name}</h5>
                <h6>{task.person.phone}</h6>
                {errorMessage && <h6 className={styles.errorMessage}>Lý do: {errorMessage}</h6>}
                {/* Hiển thị trạng thái bạn bè (chỉ khi actionType === 'checkFriend') */}
                {actionType === 'checkFriend' && (
                    <>
                        {isLoadingFriendStatus ? (
                            <h6 style={{ 
                                color: 'var(--text-secondary)', 
                                fontSize: '12px',
                                marginTop: '4px'
                            }}>
                                Đang kiểm tra...
                            </h6>
                        ) : isFriend !== null && (
                            <h6 style={{ 
                                color: isFriend ? '#22c55e' : '#ef4444',
                                fontSize: '12px',
                                fontWeight: 500,
                                marginTop: '4px'
                            }}>
                                {isFriend ? 'Bạn bè' : 'Không phải bạn bè'}
                            </h6>
                        )}
                    </>
                )}
            </div>
            <div className={styles.taskStatusContainer}>
                <div className={`${styles.statusIndicator} ${styles[statusKey]}`}></div>
                <h6>{statusText}</h6>
                <h6>{new Date(task.scheduledFor).toLocaleTimeString('vi-VN')}</h6>
            </div>
        </div>
    );
}

// Component mới: Hiển thị chi tiết Lịch trình
function ScheduleDetailsView({ job }) {
    if (!job || !job._id) return null;
    return (
        <div className={styles.detailItem} style={{ border: 'none' }}>
            <div className={styles.detailHeader}>
                <h5>{job.jobName}</h5>
                <h6>{getActionTypeName(job.actionType)}</h6>
            </div>
            <div className={styles.jobMetaGrid}>
                <div>
                    <h6>Tài khoản Zalo:</h6>
                    <h5>{job.zaloAccount?.name || 'N/A'}</h5>
                </div>
                <div>
                    <h6>Người tạo:</h6>
                    <h5>{job.createdBy?.name || 'N/A'}</h5>
                </div>
                <div>
                    <h6>Ngày tạo:</h6>
                    <h5>{new Date(job.createdAt).toLocaleString('vi-VN')}</h5>
                </div>
                <div>
                    <h6>Hoàn thành:</h6>
                    <h5>{new Date(job.updatedAt).toLocaleString('vi-VN')}</h5>
                </div>
            </div>
            {job.config.messageTemplate && (
                <div className={styles.messageContent}>
                    <h5>Nội dung tin nhắn:</h5>
                    <blockquote style={{ marginTop: 5 }}>{job.config.messageTemplate}</blockquote>
                </div>
            )}
        </div>
    );
}


// --- COMPONENT CHÍNH ---
export default function ActionHistory({ history = [] }) {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [viewingDetailsFor, setViewingDetailsFor] = useState(null);
    const [secondaryView, setSecondaryView] = useState('tasks'); // 'tasks' hoặc 'details'
    const [activeFilter, setActiveFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const jobsToDisplay = useMemo(() => {
        let list = history;
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            list = list.filter(job =>
                job.jobName.toLowerCase().includes(lowercasedFilter) ||
                job.zaloAccount?.name.toLowerCase().includes(lowercasedFilter)
            );
        }
        return list;
    }, [history, searchTerm]);

    const categorizedTasks = useMemo(() => {
        if (!viewingDetailsFor) return { success: [], failed: [], all: [] };
        const success = [], failed = [];
        viewingDetailsFor.tasks.forEach(task => {
            if (task.history?.status?.status === true) success.push(task);
            else failed.push(task);
        });
        return { success, failed, all: [...success, ...failed] };
    }, [viewingDetailsFor]);

    const filteredTasks = useMemo(() => categorizedTasks[activeFilter] || [], [activeFilter, categorizedTasks]);

    if (!history || history.length === 0) return null;

    const handleOpenPopup = () => {
        setSearchTerm('');
        setIsPopupOpen(true);
    };
    const handleShowTasks = (job) => {
        setViewingDetailsFor(job);
        setSecondaryView('tasks');
        setActiveFilter('all');
    };
    const handleShowJobDetails = (job) => {
        setViewingDetailsFor(job);
        setSecondaryView('details');
    };
    const handleCloseSecondary = () => setViewingDetailsFor(null);

    return (
        <>
            <button className='btn_s' onClick={handleOpenPopup}>
                <Svg_History w={'var(--font-size-sm)'} h={'var(--font-size-sm)'} c={'var(--text-primary)'} />
                <h5>Lịch sử: {history.length}</h5>
            </button>
            <FlexiblePopup
                open={isPopupOpen}
                onClose={() => setIsPopupOpen(false)}
                title="Lịch sử hành động"
                width={'600px'}
                renderItemList={() => (
                    <div>
                        <div className={styles.popupControls}>
                            <input
                                type="text"
                                placeholder="Tìm theo tên lịch, tên zalo..."
                                value={searchTerm}
                                style={{ flex: 1 }}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className={`input ${styles.searchInput}`}
                            />
                        </div>
                        <div className={`${styles.popupList} scroll`}>
                            {jobsToDisplay.length > 0 ? jobsToDisplay.map(job => (
                                <HistoryItem
                                    key={job._id}
                                    job={job}
                                    onShowTasks={handleShowTasks}
                                    onShowJobDetails={handleShowJobDetails}
                                />
                            )) : (
                                <div className={styles.noJobsText}><h6>Không có lịch sử nào phù hợp.</h6></div>
                            )}
                        </div>
                    </div>
                )}
                secondaryOpen={!!viewingDetailsFor}
                onCloseSecondary={handleCloseSecondary}
                secondaryTitle={secondaryView === 'tasks' ? `Danh sách thực hiện (${viewingDetailsFor?.tasks?.length || 0})` : `Chi tiết lịch trình`}
                dataSecondary={viewingDetailsFor}
                width2={'550px'}
                renderSecondaryList={() => (
                    <div className={`${styles.popupList} scroll`}>
                        {secondaryView === 'tasks' ? (
                            <>
                                <div className={styles.filterControls}>
                                    <button className={activeFilter === 'all' ? styles.activeFilter : ''} onClick={() => setActiveFilter('all')}><h6>Tất cả ({categorizedTasks.all.length})</h6></button>
                                    <button className={activeFilter === 'success' ? styles.activeFilter : ''} onClick={() => setActiveFilter('success')}><h6>Thành công ({categorizedTasks.success.length})</h6></button>
                                    <button className={activeFilter === 'failed' ? styles.activeFilter : ''} onClick={() => setActiveFilter('failed')}><h6>Thất bại ({categorizedTasks.failed.length})</h6></button>
                                </div>
                                {filteredTasks.map(task => {
                                    // Xử lý zaloAccountId: có thể là ObjectId hoặc object đã populate
                                    let zaloAccountId = null;
                                    if (viewingDetailsFor?.zaloAccount) {
                                        if (typeof viewingDetailsFor.zaloAccount === 'object' && viewingDetailsFor.zaloAccount._id) {
                                            zaloAccountId = viewingDetailsFor.zaloAccount._id;
                                        } else if (typeof viewingDetailsFor.zaloAccount === 'string') {
                                            zaloAccountId = viewingDetailsFor.zaloAccount;
                                        } else {
                                            zaloAccountId = String(viewingDetailsFor.zaloAccount);
                                        }
                                    }
                                    
                                    return (
                                        <HistoryTaskItem 
                                            key={task._id} 
                                            task={task} 
                                            actionType={viewingDetailsFor?.actionType}
                                            zaloAccountId={zaloAccountId}
                                        />
                                    );
                                })}
                            </>
                        ) : (
                            <ScheduleDetailsView job={viewingDetailsFor} />
                        )}
                    </div>
                )}
            />
        </>
    );
}