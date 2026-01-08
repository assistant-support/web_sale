'use client';
import React, { useState, useEffect, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

import { selectZaloAccountAction } from '@/app/actions/zalo.actions';

import FlexiblePopup from '@/components/(features)/(popup)/popup_right';
import Noti from '@/components/(features)/(noti)/noti';
import Loading from '@/components/(ui)/(loading)/loading';
import { Svg_Logout, Svg_Setting } from '@/components/(icon)/svg';
import styles from './index.module.css';
import { truncateString } from '@/function';
import Image from 'next/image';
function SelectableZaloItem({ item, action, isSelected = false }) {
    const { pending } = useFormStatus();
    // Hiển thị status dựa trên item.status
    const statusColor = item.status === 'active' ? 'var(--green)' : item.status === 'disconnected' ? 'var(--red)' : 'var(--gray)';
    const statusText = item.status === 'active' ? 'Đang hoạt động' : item.status === 'disconnected' ? 'Mất kết nối' : 'Không xác định';
    
    return (
        <form action={action} className={pending ? styles.itemPending : ''}>
            <input type="hidden" name="zaloAccountId" value={item._id} />
            <button type="submit" className={styles.item} disabled={pending} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Checkbox/Tick icon */}
                    <div style={{ 
                        width: 20, 
                        height: 20, 
                        border: '2px solid ' + (isSelected ? 'var(--primary)' : 'var(--border-color)'),
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? 'var(--primary)' : 'transparent',
                        flexShrink: 0
                    }}>
                        {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        )}
                    </div>
                    <div className={styles.avt}>
                        <Image src={item.avt || '/default-avatar.png'} alt={item.name} fill />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                        <h5>{item.name}</h5>
                        <h6 className="text_sm text_w_400">{item.phone || 'Chưa có số điện thoại'}</h6>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 50, background: statusColor }}></div>
                    <h6>{statusText}</h6>
                </div>
            </button>
        </form>
    );
}
export default function SettingZalo({ user, zalo }) {
    const router = useRouter();
    const [isRightPopupOpen, setIsRightPopupOpen] = useState(false);
    const [notification, setNotification] = useState({ open: false, status: true, mes: '' });
    const [selectState, selectAction, isSelectPending] = useActionState(selectZaloAccountAction, { message: null, status: null });
    useEffect(() => {
        if (selectState.message) {
            setNotification({ open: true, status: selectState.status, mes: selectState.message });
            if (selectState.status === true) {
                router.refresh();
                setIsRightPopupOpen(false);
            }
        }
    }, [selectState, router]);
    const handleCloseNoti = () => setNotification(prev => ({ ...prev, open: false }));
    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 150, border: 'thin solid var(--border-color)', height: 'calc(100% - 2px)', borderRadius: '5px 0 0 5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <h5>{user?.zalo ? truncateString(user.zalo.name, 10) : 'Chưa chọn'}</h5>
                </div>
                <button className='btn_s' style={{ borderRadius: '0 5px 5px 0' }} onClick={() => setIsRightPopupOpen(true)}>
                    <Svg_Setting w={'var(--font-size-xs)'} h={'var(--font-size-xs)'} c={'var(--text-primary)'} />
                    <h5 className='text_w_400'>Cấu hình</h5>
                </button>
            </div>
            <FlexiblePopup
                open={isRightPopupOpen}
                onClose={() => setIsRightPopupOpen(false)}
                title="Chọn tài khoản Zalo"
                width={'600px'}
                renderItemList={() => (
                    <div className={styles.popupContentWrapper}>
                        <div className={styles.wraplistForms}>
                            <div className={styles.title}>
                                {user?.zalo ? (
                                    <div className={styles.item} style={{ width: '100%', background: 'transparent' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div className={styles.avt}>
                                                {/* <Image src={user.zalo.avt} alt={user.zalo.profile?.displayName} fill /> */}
                                                    <Image src={user.zalo.profile?.avatar || user.zalo.avt || '/default-avatar.png'} alt={user.zalo.profile?.displayName || user.zalo.name || 'Zalo Account'} fill />
                                                
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                                                <h5>{user.zalo.name}</h5>
                                                <h6>{user.zalo.phone}</h6>
                                            </div>
                                        </div>
                                        <form action={selectAction}>
                                            <input type="hidden" name="zaloAccountId" value="" />
                                            <button type="submit" className='btn_s' disabled={isSelectPending}>
                                                <Svg_Logout w={'var(--font-size-xs)'} h={'var(--font-size-xs)'} c={'var(--text-primary)'} />
                                                <h5>{isSelectPending ? 'Đang xử lý...' : 'Thoát tài khoản'}</h5>
                                            </button>
                                        </form>
                                    </div>
                                ) : (
                                    <div style={{ padding: '12px 16px', width: 'calc(100% - 32px)', border: 'thin dashed var(--border-color)', borderRadius: 5 }}>
                                        <h5>Chưa chọn tài khoản</h5>
                                    </div>
                                )}
                            </div>
                            <div className={styles.itemsContainer}>
                                {zalo?.map((item) => {
                                    const isSelected = user?.zalo?._id === item._id || user?.zalo?._id?.toString() === item._id?.toString();
                                    return <SelectableZaloItem key={item._id} item={item} action={selectAction} isSelected={isSelected} />;
                                })}
                            </div>
                        </div>
                    </div>
                )}
            />
            {isSelectPending && (
                <div className='loadingOverlay'>
                    <Loading content={<h5>Đang xử lý...</h5>} />
                </div>
            )}
            <Noti
                open={notification.open}
                onClose={handleCloseNoti}
                status={notification.status}
                mes={notification.mes}
            />
        </>
    );
}