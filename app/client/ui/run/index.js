'use client';

// Import thêm các hook và action mới
import React, { useState, useEffect, useMemo, useRef, useActionState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { createScheduleAction } from '@/app/actions/schedule.actions';
import { updateCustomerStatusAction, assignRoleToCustomersAction } from '@/app/actions/customer.actions'; // THAY ĐỔI: Import action mới
import FlexiblePopup from '@/components/(features)/(popup)/popup_right';
import Noti from '@/components/(features)/(noti)/noti';
import AlertPopup from '@/components/(features)/(noti)/alert';
import Menu from '@/components/(ui)/(button)/menu';
import Loading from '@/components/(ui)/(loading)/loading';
import { Svg_Send } from '@/components/(icon)/svg';
import styles from './index.module.css';

// Component SubmitButton không đổi
function SubmitButton({ text = 'Xác nhận', disabled = false }) {
    const { pending } = useFormStatus();
    return (
        <button type="submit" disabled={pending || disabled} className='btn_s_b'>
            <h5>{text}</h5>
        </button>
    );
}

// Component ProgressPopup không đổi
function ProgressPopup({ open, progress, onBackdropClick }) {
    if (!open) return null;
    const successPercent = progress.total > 0 ? (progress.success / progress.total) * 100 : 0;
    const failedPercent = progress.total > 0 ? (progress.failed / progress.total) * 100 : 0;
    return (
        <div className={styles.progressBackdrop} onClick={onBackdropClick}>
            <div className={styles.progressPopup} onClick={(e) => e.stopPropagation()}>
                <h5>Đang xử lý hàng loạt...</h5>
                <div className={styles.progressInfo}>
                    <h6>Hoàn thành: {progress.success + progress.failed}/{progress.total}</h6>
                    <h6>Thành công: <span style={{ color: 'var(--green)' }}>{progress.success}</span> - Thất bại: <span style={{ color: 'var(--red)' }}>{progress.failed}</span></h6>
                </div>
                <div className={styles.progressBar}>
                    <div className={styles.success} style={{ width: `${successPercent}%` }}></div>
                    <div className={styles.failed} style={{ width: `${failedPercent}%` }}></div>
                </div>
                <h6>Vui lòng không tắt trang trong khi tiến trình đang chạy.</h6>
            </div>
        </div>
    );
}


// Component MessageEditor không đổi
function MessageEditor({ value, onChange, variants }) {
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const textareaRef = useRef(null);
    const triggerIndexRef = useRef(0);
    const allVariants = useMemo(() => {
        const staticVariants = [
            { _id: 'static_student', name: 'namestudent', description: 'Tên của học sinh/khách hàng.' },
            { _id: 'static_parent', name: 'nameparents', description: 'Tên phụ huynh.' }
        ];
        return [...staticVariants, ...variants];
    }, [variants]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (textareaRef.current && !textareaRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleTextChange = (e) => {
        const text = e.target.value;
        onChange(text);
        const cursorPosition = e.target.selectionStart;
        const lastBraceIndex = text.lastIndexOf('{', cursorPosition - 1);
        if (lastBraceIndex !== -1 && !text.substring(lastBraceIndex + 1, cursorPosition).includes('}') && !text.substring(lastBraceIndex + 1, cursorPosition).includes(' ')) {
            const query = text.substring(lastBraceIndex + 1, cursorPosition);
            setSuggestions(allVariants.filter(v => v.name.toLowerCase().startsWith(query.toLowerCase())));
            setShowSuggestions(true);
            triggerIndexRef.current = lastBraceIndex;
        } else {
            setShowSuggestions(false);
        }
    };

    const handleSuggestionClick = (variantName) => {
        const text = value;
        const cursorPosition = textareaRef.current.selectionStart;
        const textBefore = text.substring(0, triggerIndexRef.current);
        const textAfter = text.substring(cursorPosition);
        const newText = `${textBefore}{${variantName}}${textAfter}`;
        onChange(newText);
        setShowSuggestions(false);
        setTimeout(() => {
            const newCursorPos = textBefore.length + variantName.length + 2;
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };

    return (
        <div className={styles.editorContainer}>
            <textarea name="messageTemplate" className='input scroll' rows="8" placeholder="Nhập nội dung tin nhắn..." value={value} style={{ width: 'calc(100% - 24px)' }} onChange={handleTextChange} ref={textareaRef} />
            {showSuggestions && suggestions.length > 0 && (
                <div className={styles.suggestionsList}>
                    {suggestions.map(variant => (
                        <div key={variant._id} className={styles.suggestionItem} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSuggestionClick(variant.name)}>
                            <h6>{variant.name}</h6>
                            <p>{variant.description}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// THAY ĐỔI: Thêm prop `users`
function ActionForm({ onSubmitAction, selectedCustomers, onClose, currentType, labels, variants, users }) {
    const [actionType, setActionType] = useState('findUid');
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [isLabelMenuOpen, setIsLabelMenuOpen] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false); // THAY ĐỔI: State cho menu user
    const [actionsPerHour, setActionsPerHour] = useState(30);
    const [estimatedTime, setEstimatedTime] = useState('');
    const [messageContent, setMessageContent] = useState('');
    const [selectedLabelTitle, setSelectedLabelTitle] = useState('Chọn chiến dịch có sẵn');
    const [selectedUserId, setSelectedUserId] = useState(''); // THAY ĐỔI: State cho userId được chọn
    const [selectedUserName, setSelectedUserName] = useState('Chọn người phụ trách'); // THAY ĐỔI: State cho tên user được chọn
    const totalCustomers = selectedCustomers.size;

    const actionOptions = useMemo(() => {
        const baseActions = [
            { value: 'findUid', name: 'Tìm kiếm UID' },
            { value: 'sendMessage', name: 'Gửi tin nhắn Zalo' },
            { value: 'assignRole', name: 'Gán người phụ trách' },
            { value: 'checkFriend', name: 'Kiểm tra bạn bè' },
            { value: 'addFriend', name: 'Gửi kết bạn' },
        ];
        const customerActions = [
            { value: 4, name: 'Chuyển trạng thái: Đang chăm sóc' },
            { value: 2, name: 'Chuyển trạng thái: Không quan tâm' },
            { value: 3, name: 'Chuyển trạng thái: Chăm sóc sau' }
        ];
        return !currentType ? [...baseActions, ...customerActions] : baseActions;
    }, [currentType]);

    const isScheduleAction = useMemo(() => ['findUid', 'sendMessage', 'checkFriend', 'addFriend'].includes(actionType), [actionType]);
    const isAssignAction = useMemo(() => actionType === 'assignRole', [actionType]); // THAY ĐỔI: check action mới
    const selectedActionName = useMemo(() => actionOptions.find(opt => opt.value === actionType)?.name, [actionType, actionOptions]);
    const customersArray = useMemo(() => Array.from(selectedCustomers.values()).map(c => ({ _id: c._id, name: c.name, phone: c.phone, uid: c.uid })), [selectedCustomers]);

    // formatDuration không đổi
    function formatDuration(ms) {
        if (ms <= 0) return '~ 0 phút';
        const totalMinutes = Math.ceil(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        let result = '~ ';
        if (hours > 0) result += `${hours} giờ `;
        if (minutes > 0) result += `${minutes} phút`;
        return result.trim();
    }

    useEffect(() => {
        if (isScheduleAction && totalCustomers > 0 && actionsPerHour > 0) {
            const durationMs = (totalCustomers / actionsPerHour) * 3600 * 1000;
            setEstimatedTime(formatDuration(durationMs));
        }
    }, [totalCustomers, actionsPerHour, isScheduleAction]);

    const handleSelectLabel = (label) => {
        setMessageContent(label.content);
        setSelectedLabelTitle(label.title);
        setIsLabelMenuOpen(false);
    };

    // THAY ĐỔI: Hàm xử lý chọn user
    const handleSelectUser = (user) => {
        setSelectedUserId(user._id);
        setSelectedUserName(user.name);
        setIsUserMenuOpen(false);
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        // THAY ĐỔI: Validation cho hành động gán
        if (isAssignAction && !selectedUserId) {
            alert('Vui lòng chọn một người để gán.');
            return;
        }
        const formData = new FormData(event.target);
        onSubmitAction(formData);
    };

    // THAY ĐỔI: check disable nút submit
    const isSubmitDisabled = isAssignAction && !selectedUserId;

    return (
        <form onSubmit={handleSubmit} className={styles.formContainer}>
            <input type="hidden" name="actionType" value={actionType} />
            <input type="hidden" name="selectedCustomersJSON" value={JSON.stringify(customersArray)} />
            {/* THAY ĐỔI: Thêm input ẩn cho userId */}
            {isAssignAction && <input type="hidden" name="userId" value={selectedUserId} />}

            <div className={styles.inputGroup}><label>Hành động</label><Menu isOpen={isActionMenuOpen} onOpenChange={setIsActionMenuOpen} customButton={<div className='input text_6_400'>{selectedActionName}</div>} menuItems={<div className={`${styles.menulist} scroll`}>{actionOptions.map(opt => <p key={opt.value} className='text_6_400' onClick={() => { setActionType(opt.value); setIsActionMenuOpen(false); }}>{opt.name}</p>)}</div>} menuPosition="bottom" /></div>

            {/* THAY ĐỔI: Hiển thị Menu chọn user */}
            {isAssignAction && (
                <div className={styles.inputGroup}>
                    <label>Chọn người phụ trách</label>
                    <Menu
                        isOpen={isUserMenuOpen}
                        onOpenChange={setIsUserMenuOpen}
                        customButton={<div className='input text_6_400'>{selectedUserName}</div>}
                        menuItems={
                            <div className={`${styles.menulist} scroll`}>
                                {users.map(user => (
                                    <p key={user._id} className='text_6_400' onClick={() => handleSelectUser(user)}>
                                        {user.name} ({user.email})
                                    </p>
                                ))}
                            </div>
                        }
                        menuPosition="bottom"
                    />
                </div>
            )}

            {isScheduleAction && (
                <>
                    <div className={styles.inputGroup}><label>Tên lịch trình</label><input name="jobName" className='input' placeholder={`Ví dụ: Gửi tin tháng ${new Date().getMonth() + 1}`} required /></div>
                    {['sendMessage', 'addFriend'].includes(actionType) && (
                        <>
                            <div className={styles.inputGroup}><label>Chọn chiến dịch (Tùy chọn)</label><Menu isOpen={isLabelMenuOpen} onOpenChange={setIsLabelMenuOpen} customButton={<div className='input text_6_400'>{selectedLabelTitle}</div>} menuItems={<div className={`${styles.menulist} scroll`}>{labels.map(l => <p key={l._id} className='text_6_400' onClick={() => handleSelectLabel(l)}>{l.title}</p>)}</div>} menuPosition="bottom" /></div>
                            <div className={styles.inputGroup}><label>Nội dung tin nhắn</label><MessageEditor value={messageContent} onChange={setMessageContent} variants={variants} /></div>
                        </>
                    )}
                    <div className={styles.inputGroup}><label>Số lượng gửi / giờ</label>
                        <div className={styles.estimationBox}>
                            <div className={styles.estimationInfo}><h5 className='text_w_500'>Ước tính</h5><h6>Sẽ thực hiện cho <b>{totalCustomers}</b> người, hoàn thành trong <b>{estimatedTime}</b>.</h6></div>
                            <div className={styles.numberInput}><button type="button" onClick={() => setActionsPerHour(p => Math.max(1, p - 5))}><h5>-</h5></button><input type="number" className='input' name="actionsPerHour" value={actionsPerHour} onChange={(e) => setActionsPerHour(Number(e.target.value))} /><button type="button" onClick={() => setActionsPerHour(p => p + 5)}><h5>+</h5></button></div>
                        </div>
                    </div>
                </>
            )}
            <div className={styles.formActions}>
                <button type="button" className='btn_s' onClick={onClose}><h5>Hủy</h5></button>
                <SubmitButton disabled={isSubmitDisabled} />
            </div>
        </form>
    );
}

// THAY ĐỔI: Thêm prop `users`
export default function BulkActions({ selectedCustomers, onActionComplete, labels = [], variants = [], users = [] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentType = searchParams.get('type');
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [notification, setNotification] = useState({ open: false, status: true, mes: '' });
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ success: 0, failed: 0, total: 0 });
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const stopSignal = useRef(false);

    const [isTransitionPending, startTransition] = useTransition();

    // Action state cho Lịch trình
    const [scheduleState, scheduleAction] = useActionState(createScheduleAction, { success: null, message: null, error: null });
    // THAY ĐỔI: Action state cho Gán người phụ trách
    const [assignState, assignAction] = useActionState(assignRoleToCustomersAction, { success: null, message: null, error: null });

    // Gộp trạng thái pending từ các action
    const isAnyActionPending = isTransitionPending || (scheduleState.success === null && isTransitionPending) || (assignState.success === null && isTransitionPending);


    const onActionCompleteRef = useRef(onActionComplete);
    useEffect(() => {
        onActionCompleteRef.current = onActionComplete;
    }, [onActionComplete]);

    // Effect cho Lịch trình
    useEffect(() => {
        if (scheduleState.success !== null) {
            setNotification({ open: true, status: scheduleState.success, mes: scheduleState.message || scheduleState.error });
            if (scheduleState.success) {
                onActionCompleteRef.current();
                setIsPopupOpen(false);
                router.refresh();
            }
        }
    }, [scheduleState, router]);

    // THAY ĐỔI: Effect cho Gán người phụ trách
    useEffect(() => {
        if (assignState.success !== null) {
            setNotification({ open: true, status: assignState.success, mes: assignState.message || assignState.error });
            if (assignState.success) {
                onActionCompleteRef.current();
                setIsPopupOpen(false);
                router.refresh();
            }
        }
    }, [assignState, router]);

    const startProcessing = async (formData) => {
        // ... (hàm này không đổi)
        const customersArray = JSON.parse(formData.get('selectedCustomersJSON'));
        const actionType = formData.get('actionType');
        setIsPopupOpen(false);
        setIsProcessing(true);
        stopSignal.current = false;
        let successCount = 0, failedCount = 0;
        setProgress({ success: 0, failed: 0, total: customersArray.length });
        for (let i = 0; i < customersArray.length; i++) {
            if (stopSignal.current) break;
            const customer = customersArray[i];
            const singleFormData = new FormData();
            singleFormData.append('customerId', customer._id);
            singleFormData.append('status', actionType);
            const result = await updateCustomerStatusAction(null, singleFormData);
            if (result.success) successCount++; else failedCount++;
            setProgress({ success: successCount, failed: failedCount, total: customersArray.length });
        }
        setIsProcessing(false);
        setNotification({ open: true, status: true, mes: `Hoàn tất! Thành công: ${successCount}, Thất bại: ${failedCount}.` });
        onActionCompleteRef.current();
        router.refresh();
    };

    const handleFormSubmit = (formData) => {
        const actionType = formData.get('actionType');
        startTransition(() => {
            if (['findUid', 'sendMessage', 'checkFriend', 'addFriend'].includes(actionType)) {
                scheduleAction(formData);
            } else if (actionType === 'assignRole') {
                // THAY ĐỔI: Gọi action mới
                assignAction(formData);
            } else {
                // Hủy transition nếu không phải action server
                startTransition(() => startProcessing(formData));
            }
        });
    };


    const handleStopProcess = () => {
        stopSignal.current = true;
        setIsCancelConfirmOpen(false);
    };

    return (
        <>
            <button className='btn_s' onClick={() => setIsPopupOpen(true)} disabled={selectedCustomers.size === 0}>
                <Svg_Send w={'var(--font-size-xs)'} h={'var(--font-size-xs)'} c={'var(--text-primary)'} />
                <h5 className='text_w_400'>Hành động ({selectedCustomers.size})</h5>
            </button>
            <FlexiblePopup
                open={isPopupOpen}
                onClose={() => setIsPopupOpen(false)}
                title="Hành động hàng loạt"
                width="600px"
                renderItemList={() => (
                    <ActionForm
                        onSubmitAction={handleFormSubmit}
                        selectedCustomers={selectedCustomers}
                        onClose={() => setIsPopupOpen(false)}
                        currentType={currentType}
                        labels={labels}
                        variants={variants}
                        users={users} // THAY ĐỔI: Truyền prop users
                    />
                )}
            />
            <ProgressPopup open={isProcessing} progress={progress} onBackdropClick={() => setIsCancelConfirmOpen(true)} />
            <AlertPopup
                open={isCancelConfirmOpen}
                onClose={() => setIsCancelConfirmOpen(false)}
                title="Dừng xử lý hàng loạt?"
                type="warning"
                content={<h5>Bạn có chắc chắn muốn dừng tiến trình? Các hành động đã thực hiện sẽ không được hoàn tác.</h5>}
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => setIsCancelConfirmOpen(false)} className='btn_s'><h5>Tiếp tục chạy</h5></button>
                        <button type="button" onClick={handleStopProcess} className='btn_s_b'><h5>Xác nhận Dừng</h5></button>
                    </div>
                }
            />
            {isAnyActionPending && ( // THAY ĐỔI: Dùng biến gộp
                <div className='loadingOverlay'>
                    <Loading content={<h5>Đang gửi yêu cầu...</h5>} />
                </div>
            )}
            <Noti open={notification.open} onClose={() => setNotification(p => ({ ...p, open: false }))} status={notification.status} mes={notification.mes} />
        </>
    );
}