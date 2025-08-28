'use client';
import { useState, useEffect, useActionState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import styles from './index.module.css';
import { truncateString } from '@/function';
import { FaCalendarDay } from "react-icons/fa";

// Import các action của Customer, đã loại bỏ convertToStudentAction
import {
    updateCustomerInfo,
    addCareNoteAction,
    updateCustomerStatusAction,
    revalidateData
} from '@/app/actions/customer.actions';

// Import các action và hàm lấy dữ liệu của Appointment
import {
    createAppointmentAction,
    updateAppointmentStatusAction as updateApptStatusAction,
    cancelAppointmentAction,
} from '@/app/actions/appointment.actions';
import { appointment_data } from '@/data/appointment_db/wraperdata.db';

// Giữ nguyên các import UI và Icon
import FlexiblePopup from '@/components/(features)/(popup)/popup_right';
import CenterPopup from '@/components/(features)/(popup)/popup_center';
import Title from '@/components/(features)/(popup)/title';
import Noti from '@/components/(features)/(noti)/noti';
import Loading from '@/components/(ui)/(loading)/loading';
import Image from 'next/image';
import { Svg_Send, Svg_Pen, Svg_Out, Svg_History, Svg_Chat_1, Svg_Check } from '@/components/(icon)/svg';
import { history_data } from '@/data/actions/get';

// =============================================================
// SUB-COMPONENT MỚI: QUẢN LÝ LỊCH HẸN TRONG POPUP
// =============================================================
function AppointmentManager({ customer, previousState, createAction, updateAction, cancelAction, pending, setNotification }) {
    const [appointmentData, setAppointmentData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const createFormRef = useRef(null);
    const processedActionState = useRef(null);
    const { pending: createPending } = useFormStatus();

    const fetchAppointments = async () => {
        setIsLoading(true);
        try {
            const appointments = await appointment_data({ customerId: customer._id });
            setAppointmentData(appointments);
        } catch (error) {
            console.error("Lỗi khi tải danh sách lịch hẹn:", error);
            setNotification({ open: true, status: false, mes: "Không thể tải danh sách lịch hẹn." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!customer?._id) return;
        fetchAppointments();
    }, [customer._id]);

    useEffect(() => {
        const anyActionState = previousState[0] || previousState[1] || previousState[2];
        if (anyActionState && anyActionState !== processedActionState.current) {
            if (anyActionState.status === true) {
                setNotification({ open: true, status: true, mes: anyActionState.message });
                if (createFormRef.current) createFormRef.current.reset();
                fetchAppointments();
            } else if (anyActionState.status === false) {
                setNotification({ open: true, status: false, mes: anyActionState.message });
            }
            processedActionState.current = anyActionState;
        }
    }, [previousState, setNotification]);


    const getStatusInfo = (status) => {
        switch (status) {
            case 'pending': return { text: 'Sắp diễn ra', color: 'var(--blue)' };
            case 'completed': return { text: 'Hoàn thành', color: 'var(--green)' };
            case 'cancelled': return { text: 'Đã hủy', color: '#989898' };
            case 'missed': return { text: 'Vắng mặt', color: 'var(--red)' };
            default: return { text: status, color: 'var(--text-secondary)' };
        }
    };

    return (
        <div className={styles.appointmentManager}>
            <div className={styles.section}>
                <h4>Tạo Lịch Hẹn Mới</h4>
                <form action={createAction} ref={createFormRef} className={styles.appointmentForm}>
                    <input type="hidden" name="customerId" value={customer._id} />
                    <input name="title" placeholder="Mục đích cuộc hẹn..." className='input' required disabled={pending} />
                    <input name="appointmentDate" type="datetime-local" className='input' required disabled={pending} />
                    <textarea name="notes" placeholder="Ghi chú thêm..." rows={2} className='input' disabled={pending}></textarea>
                    <button type="submit" className='btn_s_b' disabled={pending || createPending}>
                        <h5 style={{ color: 'white' }}>{createPending ? 'Đang tạo...' : 'Tạo Lịch Hẹn'}</h5>
                    </button>
                </form>
            </div>
            <div className={styles.section}>
                <h4>Danh Sách Lịch Hẹn</h4>
                <div className={`${styles.appointmentList} scroll`}>
                    {isLoading ? <Loading content="Đang tải..." /> :
                        appointmentData.length > 0 ? (
                            appointmentData.map(app => (
                                <div key={app._id} className={styles.appointmentItem}>
                                    <div className={styles.appointmentInfo}>
                                        <h5>{app.title}</h5>
                                        <h6>Ngày hẹn: {new Date(app.appointmentDate).toLocaleString('vi-VN')}</h6>
                                        <h6>Tạo bởi: {app.createdBy.name}</h6>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: getStatusInfo(app.status).color }}></span>
                                            <h6 style={{ color: getStatusInfo(app.status).color }}>{getStatusInfo(app.status).text}</h6>
                                        </div>
                                    </div>
                                    {app.status === 'pending' && (
                                        <div className={styles.appointmentActions}>
                                            <form action={updateAction}> <input type="hidden" name="appointmentId" value={app._id} /> <input type="hidden" name="newStatus" value="completed" /> <button type="submit" disabled={pending} className='btn_s'>Hoàn thành</button> </form>
                                            <form action={updateAction}> <input type="hidden" name="appointmentId" value={app._id} /> <input type="hidden" name="newStatus" value="missed" /> <button type="submit" disabled={pending} className='btn_s'>Vắng mặt</button> </form>
                                            <form action={cancelAction}> <input type="hidden" name="appointmentId" value={app._id} /> <button type="submit" disabled={pending} className='btn_s'>Hủy</button> </form>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <h5 style={{ fontStyle: 'italic', textAlign: 'center' }}>Chưa có lịch hẹn nào.</h5>
                        )}
                </div>
            </div>
        </div>
    );
}

function HistoryLogItem({ log }) {
    const getActionTypeName = (type) => {
        switch (type) { case 'findUid': return 'Tìm UID'; case 'sendMessage': return 'Gửi Tin Nhắn'; case 'addFriend': return 'Kết Bạn'; default: return 'Hành động'; }
    };
    const statusSuccess = log.status?.status === true;
    const message = (log.status?.message ?? '').replace(/\r\n?/g, '\n');
    return (
        <div className={styles.noteItem} style={{ padding: '12px 16px', alignItems: 'flex-start' }}>
            <Image src={log.zalo?.avt || 'https://lh3.googleusercontent.com/d/1iq7y8VE0OyFIiHmpnV_ueunNsTeHK1bG'} alt={log.zalo?.name || 'Zalo'} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 50, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div className={styles.noteContent}>
                <h5 style={{ lineHeight: 1.3 }}>{getActionTypeName(log.type)} - Zalo thực hiện: {log.zalo?.name || 'Không rõ'}</h5>
                <div style={{ display: 'flex', gap: 8 }}>
                    <h6>Người thực hiện: {log.createBy?.name || 'Hệ thống'}</h6>
                    <h6>Thời gian: {new Date(log.createdAt).toLocaleString('vi-VN')}</h6>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusSuccess ? 'var(--green)' : 'var(--red)' }}></span>
                    {log.type == 'checkFriend' ?
                        <h5 className='text_w_400' style={{ fontStyle: 'italic', color: statusSuccess ? 'var(--green)' : 'var(--red)' }}>{log.status?.data?.error_message == 1 ? 'Đã là bạn bè' : 'Chưa là bạn bè'}</h5> :
                        <h5 className='text_w_400' style={{ fontStyle: 'italic', color: statusSuccess ? 'var(--green)' : 'var(--red)' }}>{log.status?.data?.error_message == 'Successful.' ? 'Thành công!' : 'Lỗi'}</h5>
                    }
                </div>
                {log.type != 'findUid' && log.type != 'checkFriend' && <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}><h6 className='text_w_400'>Nội dung gửi :</h6><h6 style={{ whiteSpace: 'pre-line' }}>{message}</h6></div>}
            </div>
        </div>
    );
}

function MiniSubmitButton({ text, pending }) {
    return <button type="submit" disabled={pending} className='btn_s'> <Svg_Send w={'var(--font-size-xs)'} h={'var(--font-size-xs)'} c={'var(--text-primary)'} /> <h5>{text}</h5> </button>;
}

function CustomerUpdateForm({ formAction, initialData, onClose, isAnyActionPending }) {
    const { pending } = useFormStatus();
    const formatDateForInput = (isoDate) => {
        if (!isoDate) return '';
        try { return new Date(isoDate).toISOString().split('T')[0]; } catch { return ''; }
    };
    return (
        <form action={formAction} className={styles.updateForm}>
            <input type="hidden" name="_id" value={initialData._id} />
            <div className={styles.inputGroup}> <label htmlFor="name">Tên khách hàng</label> <input id="name" name="name" defaultValue={initialData.name} className='input' required disabled={isAnyActionPending} /> </div>
            <div className={styles.inputGroup}> <label htmlFor="bd">Ngày sinh</label> <input id="bd" name="bd" type="date" defaultValue={formatDateForInput(initialData.bd)} className='input' disabled={isAnyActionPending} /> </div>
            <div className={styles.inputGroup}> <label htmlFor="nameparent">Tên phụ huynh</label> <input id="nameparent" name="nameparent" defaultValue={initialData.nameparent} className='input' disabled={isAnyActionPending} /> </div>
            <div className={styles.inputGroup}> <label htmlFor="email">Email</label> <input id="email" name="email" type="email" defaultValue={initialData.email} className='input' disabled={isAnyActionPending} /> </div>
            <div className={styles.formActions}> <button type="button" onClick={onClose} className='btn_s' disabled={pending || isAnyActionPending}><h5>Hủy</h5></button> <button type="submit" className='btn_s_b' disabled={pending || isAnyActionPending}><h5>Lưu thay đổi</h5></button> </div>
        </form>
    );
}

export default function CustomerRow({ customer, index, isSelected, onSelect, visibleColumns, user, viewMode, zalo }) {
    const router = useRouter();
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [notification, setNotification] = useState({ open: false, status: true, mes: '' });
    const [isUpdatePopupOpen, setIsUpdatePopupOpen] = useState(false);
    const [comment, setComment] = useState('');
    const noteFormRef = useRef(null);
    const [historyData, setHistoryData] = useState(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [isHistoryPopupOpen, setIsHistoryPopupOpen] = useState(false);
    const [infoState, updateInfoAction, isInfoPending] = useActionState(updateCustomerInfo, null);
    const [noteState, addNoteAction, isNotePending] = useActionState(addCareNoteAction, null);
    const [statusState, updateStatusAction, isStatusPending] = useActionState(updateCustomerStatusAction, null);
    const [isAppointmentPopupOpen, setIsAppointmentPopupOpen] = useState(false);
    const [createAppointmentState, createAppointmentActionFn, isCreateAppointmentPending] = useActionState(createAppointmentAction, null);
    const [updateAppointmentState, updateAppointmentStatusActionFn, isUpdateAppointmentPending] = useActionState(updateApptStatusAction, null);
    const [cancelAppointmentState, cancelAppointmentActionFn, isCancelAppointmentPending] = useActionState(cancelAppointmentAction, null);

    const isAnyActionPending = isInfoPending || isNotePending || isStatusPending || isCreateAppointmentPending || isUpdateAppointmentPending || isCancelAppointmentPending;

    const handleClosePopup = () => setIsPopupOpen(false);

    useEffect(() => {
        if (!infoState) return;
        if (infoState.success) {
            setNotification({ open: true, status: true, mes: 'Cập nhật thông tin thành công!' });
            router.refresh();
            setIsUpdatePopupOpen(false);
        } else if (infoState.error) { setNotification({ open: true, status: false, mes: infoState.error }); }
    }, [infoState, router]);

    useEffect(() => {
        if (noteState?.success) {
            setNotification({ open: true, status: true, mes: 'Thêm ghi chú thành công!' });
            setComment('');
            noteFormRef.current?.reset();
            router.refresh();
        } else if (noteState?.error) { setNotification({ open: true, status: false, mes: noteState.error }); }
        if (statusState?.success) {
            setNotification({ open: true, status: true, mes: statusState.message });
            router.refresh();
        } else if (statusState?.error) { setNotification({ open: true, status: false, mes: statusState.error }); }
    }, [noteState, statusState, router]);

    const handleOpenPopup = (e) => {
        if (!e.target.closest(`.${styles.checkboxContainer}`) && !isAnyActionPending) {
            setIsPopupOpen(true);
        }
    };

    const handleCloseNoti = () => setNotification(p => ({ ...p, open: false }));

    const getStatusText = (status) => {
        switch (status) { case 0: return 'Mới'; case 1: return 'Tiềm năng'; case 2: return 'Đã liên hệ'; case 3: return 'Chốt đơn'; case 4: return 'Từ chối'; default: return 'Mới'; }
    };

    const handleShowHistory = async () => {
        if (isAnyActionPending) return;
        setIsHistoryPopupOpen(true);
        setIsLoadingHistory(true);
        setHistoryError('');
        const result = await history_data(customer._id, customer.type ? 'student' : 'customer');
        if (result.success) { setHistoryData(result.data); }
        else { setHistoryError(result.error); }
        setIsLoadingHistory(false);
    };

    const handleCloseHistory = () => {
        setIsHistoryPopupOpen(false);
        setHistoryData(null);
        setHistoryError('');
    };

    const handleOpenAppointmentPopup = () => !isAnyActionPending && setIsAppointmentPopupOpen(true);
    const handleCloseAppointmentPopup = () => !isAnyActionPending && setIsAppointmentPopupOpen(false);

    return (
        <>
            <div className={`${styles.row} ${isAnyActionPending ? styles.disabledRow : ''} ${viewMode === 'manage' ? '' : styles.manageRow}`} onClick={handleOpenPopup}>
                {viewMode === 'manage' && <div className={`${styles.td} ${styles.fixedColumn}`}>
                    <label className={styles.checkboxContainer}>
                        <input type="checkbox" checked={isSelected} onChange={(e) => onSelect(customer, e.target.checked)} onClick={(e) => e.stopPropagation()} disabled={isAnyActionPending} />
                        <span className={styles.checkmark}></span>
                    </label>
                </div>}
                <div className={`${styles.td} ${styles.fixedColumn}`}><h6>{index}</h6></div>
                {visibleColumns.map(colKey => (
                    <div key={colKey} className={styles.td}>
                        <h6 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {(() => {
                                const value = customer[colKey];
                                if (value === null || value === undefined || value === '') return '-';
                                switch (colKey) {
                                    case 'bd': return new Date(value).toLocaleDateString('vi-VN');
                                    case 'status': return <>
                                        <span style={{
                                            width: 8, height: 8, borderRadius: 50, display: 'block',
                                            background: customer.status == 3 ? 'var(--green)' : customer.status == 4 ? 'var(--red)' : customer.status == 2 ? 'var(--yellow)' : customer.status == 1 ? 'var(--main_b)' : '#989898'
                                        }}></span> {getStatusText(customer.status)} ({customer.care.length} ghi chú)</>;
                                    case 'type': return value ? 'Học viên' : 'Khách hàng';
                                    case 'statusaction': return value ? value.actionType == "findUid" ? "Đang tìm uid" : 'Đang gửi tin nhắn' : 'Chưa có hành động';
                                    default: return truncateString(value.toString(), 30, 1);
                                }
                            })()}
                        </h6>
                    </div>
                ))}
            </div>
            {isAnyActionPending && (<div className='loadingOverlay' style={{ zIndex: 9999 }}> <Loading content={<h5>Đang xử lý...</h5>} /> </div>)}
            <FlexiblePopup
                open={isPopupOpen}
                onClose={handleClosePopup}
                title={`Chi tiết: ${customer.name}`}
                width={'500px'}
                secondaryOpen={isHistoryPopupOpen}
                onCloseSecondary={handleCloseHistory}
                secondaryTitle={`Lịch sử hành động`}
                providedDataSecondary={customer.care}
                width2={'550px'}
                renderSecondaryList={() => (
                    <div className={`${styles.historywrap} scroll`}>
                        {isLoadingHistory && <Loading content="Đang tải lịch sử..." />}
                        {historyError && <p style={{ color: 'red', textAlign: 'center', padding: '16px' }}>{historyError}</p>}
                        {!isLoadingHistory && !historyError && (
                            historyData && historyData.length > 0 ? (
                                historyData.map((log) => (<HistoryLogItem key={log._id} log={log} />))
                            ) : (
                                <div className='flex_center' style={{ height: 30 }}>
                                    <h5 className='text_w_400' style={{ fontStyle: 'italic' }}>Không có lịch sử Zalo nào</h5>
                                </div>
                            )
                        )}
                    </div>
                )}
                renderItemList={() => (
                    <div className={styles.popupContainer}>
                        <div style={{ borderBottom: 'thin solid var(--border-color)', padding: 16 }}>
                            <h4 style={{ paddingBottom: 8, borderBottom: 'thin dashed var(--border-color)' }}>Hành động</h4>
                            <div className={styles.actionsGrid}>
                                {customer.type === false && (
                                    <>
                                        <form action={updateStatusAction} className={styles.actionItem}>
                                            <input type="hidden" name="customerId" value={customer._id} />
                                            <input type="hidden" name="status" value="2" />
                                            <button type="submit" disabled={isAnyActionPending} className={styles.actionItemButton}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Svg_Chat_1 w={'var(--font-size-sm)'} h={'var(--font-size-sm)'} c={'var(--text-primary)'} />
                                                    <h5 className='text_w_500'>Đã liên hệ</h5>
                                                </div>
                                                <h6 className='text_w_400'>Đang tiến hành chăm sóc</h6>
                                            </button>
                                        </form>
                                        <button className={styles.actionItem} onClick={() => setIsUpdatePopupOpen(true)} disabled={isAnyActionPending}>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <Svg_Pen w={'var(--font-size-sm)'} h={'var(--font-size-sm)'} c={'var(--text-primary)'} />
                                                <h5 className='text_w_500'>Cập nhật thông tin</h5>
                                            </div>
                                            <h6 className='text_w_400'>Chỉnh sửa thông tin khách hàng</h6>
                                        </button>
                                        <form action={updateStatusAction} className={styles.actionItem}>
                                            <input type="hidden" name="customerId" value={customer._id} />
                                            <input type="hidden" name="status" value="4" />
                                            <button type="submit" disabled={isAnyActionPending} className={styles.actionItemButton}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Svg_Out w={'var(--font-size-sm)'} h={'var(--font-size-sm)'} c={'var(--text-primary)'} />
                                                    <h5 className='text_w_500'>Không quan tâm</h5>
                                                </div>
                                                <h6 className='text_w_400'>Kết thúc chăm sóc</h6>
                                            </button>
                                        </form>
                                        <form action={updateStatusAction} className={styles.actionItem}>
                                            <input type="hidden" name="customerId" value={customer._id} />
                                            <input type="hidden" name="status" value="3" />
                                            <button type="submit" disabled={isAnyActionPending} className={styles.actionItemButton}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Svg_Check w={'var(--font-size-sm)'} h={'var(--font-size-sm)'} c={'var(--text-primary)'} />
                                                    <h5 className='text_w_500'>Chốt đơn</h5>
                                                </div>
                                                <h6 className='text_w_400'>Xác nhận chốt đơn</h6>
                                            </button>
                                        </form>
                                        <form action={updateStatusAction} className={styles.actionItem}>
                                            <input type="hidden" name="customerId" value={customer._id} />
                                            <input type="hidden" name="status" value="1" />
                                            <button type="submit" disabled={isAnyActionPending} className={styles.actionItemButton}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Svg_History w={'var(--font-size-sm)'} h={'var(--font-size-sm)'} c={'var(--text-primary)'} />
                                                    <h5 className='text_w_500'>Tiềm năng</h5>
                                                </div>
                                                <h6 className='text_w_400'>Khách hàng có tương tác</h6>
                                            </button>
                                        </form>


                                        <div className={styles.actionItem}>
                                            <button type="button" onClick={handleOpenAppointmentPopup} disabled={isAnyActionPending} className={styles.actionItemButton}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <FaCalendarDay style={{ width: 'var(--font-size-sm)' }} color={'var(--text-primary)'} />
                                                    <h5 className='text_w_500'>Quản lý lịch hẹn</h5>
                                                </div>
                                                <h6 className='text_w_400'>Tạo và xem các cuộc hẹn</h6>
                                            </button>
                                        </div>

                                    </>
                                )}
                                <button className={styles.actionItem} onClick={handleShowHistory} disabled={isAnyActionPending}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <Svg_History w={'var(--font-size-sm)'} h={'var(--font-size-sm)'} c={'var(--text-primary)'} />
                                        <h5 className='text_w_500'>Lịch sử chăm sóc</h5>
                                    </div>
                                    <h6 className='text_w_400'>Lịch sử gửi tin nhắn zalo</h6>
                                </button>
                            </div>
                        </div>
                        {customer.type === false && (
                            <>
                                <div className={styles.wrapDetail} >
                                    <h4 style={{ paddingBottom: 8, borderBottom: 'thin dashed var(--border-color)' }}>Chi tiết khách hàng</h4>
                                    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <div className={styles.formGroup}><h5>Tên:</h5> <h5>{customer.name}</h5></div>
                                        <div className={styles.formGroup}><h5>Ngày sinh: </h5><h5>{customer.bd ? new Date(customer.bd).toLocaleDateString('vi-VN') : 'Thiếu thông tin'}</h5></div>
                                        <div className={styles.formGroup}><h5>Tên phụ huynh:</h5> <h5>{customer.nameparent || 'Thiếu thông tin'}</h5></div>
                                        <div className={styles.formGroup}><h5>Số điện thoại: </h5><h5>{customer.phone}</h5></div>
                                        <div className={styles.formGroup}><h5>Email: </h5><h5>{customer.email || 'Thiếu thông tin'}</h5></div>
                                        <div className={styles.formGroup}><h5>Kết quả chăm sóc: </h5><h5>{getStatusText(customer.status)}</h5></div>
                                        <div className={styles.formGroup}><h5>Nguồn dữ liệu: </h5><h5>{customer.source}</h5></div>
                                    </div>
                                </div>
                                <div className={styles.wrapDetail} >
                                    <h4 style={{ paddingBottom: 8, borderBottom: 'thin dashed var(--border-color)' }}>Thông tin zalo</h4>
                                    <div style={{ display: 'flex', gap: 8, paddingTop: 8, flexDirection: 'column' }}>
                                        {customer.uid == null ? (<h5>Không tìm được zalo</h5>) :
                                            <>
                                                {customer.uid.length > 0 ? customer.zaloname &&
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <div style={{ width: 40, height: 40, objectFit: 'cover', backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 50, backgroundImage: `url(${customer.zaloavt || 'https://lh3.googleusercontent.com/d/1iq7y8VE0OyFIiHmpnV_ueunNsTeHK1bG'})` }} />
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                                            <h5 >{customer.zaloname || 'Chưa rõ'}</h5>
                                                            <h6>{customer.phone}</h6>
                                                        </div>
                                                    </div> :
                                                    customer.uid.length === 0 ? <h6 style={{ fontStyle: 'italic' }}>Chưa tìm kiếm uid</h6> : <h6 style={{ fontStyle: 'italic' }}>Không tìm thấy tài khoản zalo</h6>
                                                }
                                                <h4 style={{ padding: '16px 0 8px 0', borderBottom: 'thin dashed var(--border-color)' }}>Zalo chăm sóc</h4>
                                                {customer.uid.map((r, index) => {
                                                    let ac = zalo.filter(t => t._id == r.zalo);
                                                    if (ac.length) ac = ac[0];
                                                    if (!ac) return null;
                                                    return (
                                                        <div key={index}>
                                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                <h5>{ac.name} </h5> <h6>{ac.phone}</h6>
                                                            </div>
                                                            <h6>Trạng thái kết bạn: {r.isReques ? 'Đang chờ xác nhận' : 'Chưa gửi kết bạn'} ({r.isFriend ? 'Bạn bè' : 'Không phải bạn bè'})</h6>
                                                        </div>
                                                    )
                                                })}
                                            </>
                                        }
                                    </div>
                                </div>
                                <div style={{ borderBottom: 'thin solid var(--border-color)', padding: 16 }}>
                                    <h4 style={{ paddingBottom: 8, borderBottom: 'thin dashed var(--border-color)' }}>Ghi chú chăm sóc</h4>
                                    <div className={`${styles.notesList} scroll`}>
                                        {customer.care?.slice().reverse().map((note, index) => (
                                            <div key={index} className={styles.noteItem}>
                                                <Image src={note.createBy?.avt || 'https://lh3.googleusercontent.com/d/1iq7y8VE0OyFIiHmpnV_ueunNsTeHK1bG'} alt={note.createBy?.name || 'Chưa rõ'} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 50, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                                                <div className={styles.noteContent}>
                                                    <h5 style={{ lineHeight: 1.3 }}>{note.createBy?.name || 'Chưa rõ'}<small style={{ marginLeft: '8px', fontWeight: '400' }}>{new Date(note.createAt).toLocaleString('vi-VN')}</small></h5>
                                                    <h5 className='text_w_400' style={{ marginTop: 8, lineHeight: 1.3 }}>{note.content}</h5>
                                                </div>
                                            </div>
                                        ))}
                                        {(!customer.care || customer.care.length === 0) && (
                                            <div className='flex_center' style={{ height: 30 }}>
                                                <h5 className='text_w_400' style={{ fontStyle: 'italic' }}>Chưa có ghi chú nào</h5>
                                            </div>
                                        )}
                                    </div>
                                    <form action={addNoteAction} ref={noteFormRef} className={styles.noteForm}>
                                        <Image src={user.avt || 'https://lh3.googleusercontent.com/d/1iq7y8VE0OyFIiHmpnV_ueunNsTeHK1bG'} alt={user.name || 'Chưa rõ'} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 50 }} />
                                        <input type="hidden" name="customerId" value={customer._id} />
                                        <textarea style={{ width: '100%' }} name="content" placeholder="Viết bình luận chăm sóc..." className='input' value={comment} onChange={(e) => setComment(e.target.value)} rows={3} disabled={isAnyActionPending} />
                                        <MiniSubmitButton text={'Gửi'} pending={isAnyActionPending} />
                                    </form>
                                </div>
                            </>
                        )}
                    </div>
                )}
            />
            <CenterPopup open={isAppointmentPopupOpen} onClose={handleCloseAppointmentPopup} size="lg">
                <Title content={`Lịch hẹn cho: ${customer.name}`} click={handleCloseAppointmentPopup} />
                <div className={`${styles.mainform} scroll`}>
                    <AppointmentManager
                        customer={customer}
                        previousState={[createAppointmentState, updateAppointmentState, cancelAppointmentState]}
                        createAction={createAppointmentActionFn}
                        updateAction={updateAppointmentStatusActionFn}
                        cancelAction={cancelAppointmentActionFn}
                        pending={isAnyActionPending}
                        setNotification={setNotification}
                    />
                </div>
            </CenterPopup>

            <CenterPopup open={isUpdatePopupOpen} onClose={() => !isAnyActionPending && setIsUpdatePopupOpen(false)} size="md" >
                <Title content="Chỉnh sửa thông tin khách hàng" click={() => !isAnyActionPending && setIsUpdatePopupOpen(false)} />
                <div className={styles.mainform}>
                    <CustomerUpdateForm
                        formAction={updateInfoAction}
                        initialData={customer}
                        onClose={() => setIsUpdatePopupOpen(false)}
                        isAnyActionPending={isAnyActionPending}
                    />
                </div>
            </CenterPopup >
            <Noti open={notification.open} onClose={handleCloseNoti} status={notification.status} mes={notification.mes} />
        </>
    );
}