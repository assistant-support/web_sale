const getActionTypeName = (type) => {
    switch (type) {
        case 'findUid': return 'Tìm UID';
        case 'sendMessage': return 'Gửi Tin';
        case 'addFriend': return 'Kết bạn';
        default: return 'Hành động';
    }
}

function SubmitButton({ text = 'Thực hiện' }) {
    const { user } = useAuth();
    const dispatch = useDispatch();
    const [jobToCancel, setJobToCancel] = useState(null);
    const [notification, setNotification] = useState({ open: false, status: true, mes: '' });
    const [cancelState, cancelAction, isCancelPending] = useActionState(cancelScheduleAction, { success: null, message: null, error: null });

    // State cho các bộ lọc mới
    const [displayMode, setDisplayMode] = useState('current');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDate, setSelectedDate] = useState('');

    const currentZaloId = user?.[0]?.zalo?._id;
    const currentZaloJobs = useMemo(() => {
        return (user?.[0]?.zalo?.jobs || []).filter(job => job.status !== 'completed');
    }, [user]);

    const running = useSelector(state => state.jobs.running);

    // Logic lọc và hiển thị
    const jobsToDisplay = useMemo(() => {
        let list = displayMode === 'current' ? currentZaloJobs : running;
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            list = list.filter(job =>
                job.jobName.toLowerCase().includes(lowercasedFilter) ||
                job.zaloAccount?.name.toLowerCase().includes(lowercasedFilter)
            );
        }
        if (selectedDate) {
            list = list.filter(job => {
                const jobDate = new Date(job.createdAt).toISOString().split('T')[0];
                return jobDate === selectedDate;
            });
        }
        return list;
    }, [displayMode, currentZaloJobs, running, searchTerm, selectedDate]);

    const categorizedTasks = useMemo(() => {
        if (!viewingDetailsFor) return { pending: [], success: [], failed: [], all: [] };
        const all = viewingDetailsFor;
        const pending = all.filter(job => job.status === 'pending');
        const success = all.filter(job => job.status === 'success');
        const failed = all.filter(job => job.status === 'failed');
        return { pending, success, failed, all };
    }, [viewingDetailsFor]);

    useEffect(() => {
        if (cancelState.success) {
            setNotification({ open: true, status: true, mes: 'Hủy lịch thành công' });
            setJobToCancel(null);
        } else if (cancelState.error) {
            setNotification({ open: true, status: false, mes: 'Hủy lịch thất bại' });
        }
    }, [cancelState]);
    if (!running || running.length === 0) return null;
    const handleOpenPopup = () => {
        setDisplayMode('current');
        setSearchTerm('');
        setSelectedDate('');
        setIsPopupOpen(true);
    };
    const handleShowDetails = (job) => { setActiveFilter('all'); setViewingDetailsFor(job); };
    const handleCloseDetails = () => setViewingDetailsFor(null);

    return (
        <div>
            <Button onClick={handleOpenPopup}>{text}</Button>
            <Popup open={isPopupOpen} onClose={() => setIsPopupOpen(false)} modal>
                {close => (
                    <div className={styles.popupContent}>
                        <button className={styles.closeButton} onClick={close}>×</button>
                        <h2 className={styles.popupTitle}>Danh sách hành động</h2>
                        <div className={styles.popupControls}>
                            <ModeToggleSwitch mode={displayMode} onModeChange={setDisplayMode} />
                            <input type="text" placeholder="Tìm theo tên lịch, tên zalo..." value={searchTerm} style={{ flex: 1 }} onChange={(e) => setSearchTerm(e.target.value)} className={`input ${styles.searchInput}`} />
                        </div>
                        <div className={`${styles.popupList} scroll`}>
                            {jobsToDisplay.length > 0 ? jobsToDisplay.map(job => (
                                <ActionDetailItem key={job._id} job={job} onShowDetails={handleShowDetails} onCancel={handleOpenCancelConfirm} />
                            )) : (
                                <div className={styles.noResults}>Không có kết quả nào</div>
                            )}
                        </div>
                    </div>
                )}
            </Popup>
            <Notification
                open={notification.open}
                status={notification.status}
                message={notification.mes}
                onClose={() => setNotification({ ...notification, open: false })}
            />
        </div>
    );
}

export default SubmitButton;