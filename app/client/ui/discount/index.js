'use client';
import React, { useState, useEffect, useActionState, useCallback } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createDiscountAction, updateDiscountAction, deleteDiscountAction } from '@/app/actions/discount.actions';
import AlertPopup from '@/components/(features)/(noti)/alert';
import FlexiblePopup from '@/components/(features)/(popup)/popup_right';
import CenterPopup from '@/components/(features)/(popup)/popup_center';
import Noti from '@/components/(features)/(noti)/noti';
import Loading from '@/components/(ui)/(loading)/loading';
import { Svg_Add } from '@/components/(icon)/svg';
import { Tag, DollarSign, Percent, Trash2, Pencil } from 'lucide-react';
import styles from './index.module.css';
import Title from '@/components/(features)/(popup)/title';
import { formatDate } from '@/function';
import { Button } from '@/components/ui/button';

function SubmitButton({ text = 'Thực hiện' }) {
    const { pending } = useFormStatus();
    return (
        <button type="submit" disabled={pending} className='btn' style={{ transform: 'none', margin: 0 }}>
            {text}
        </button>
    );
}

function DiscountForm({ formAction, formState, initialData = null, submitText }) {
    const [name, setName] = useState(initialData?.name || '');
    const [discount_value, setDiscountValue] = useState(initialData?.discount_value?.toString() || '');
    const [discount_unit, setDiscountUnit] = useState(initialData?.discount_unit || 'none');
    const [note, setNote] = useState(initialData?.note || '');

    useEffect(() => {
        if (formState.status === true && !initialData) {
            setName('');
            setDiscountValue('');
            setDiscountUnit('none');
            setNote('');
        }
    }, [formState, initialData]);

    useEffect(() => {
        setName(initialData?.name || '');
        setDiscountValue(initialData?.discount_value?.toString() || '');
        setDiscountUnit(initialData?.discount_unit || 'none');
        setNote(initialData?.note || '');
    }, [initialData]);

    const getDiscountUnitLabel = (unit) => {
        switch (unit) {
            case 'none': return 'Không';
            case 'amount': return 'VND';
            case 'percent': return '%';
            default: return 'Không';
        }
    };

    return (
        <form action={formAction} className={styles.createForm}>
            {initialData?._id && <input type="hidden" name="id" value={initialData._id} />}
            <div className={styles.inputGroup}>
                <label htmlFor="name">Tên chương trình khuyến mãi *</label>
                <input 
                    className='input' 
                    type="text" 
                    id="name" 
                    name="name" 
                    placeholder="Ví dụ: Khuyến mãi mùa hè" 
                    required 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                />
            </div>
            <div className={styles.inputGroup}>
                <label htmlFor="discount_value">Giá trị giảm *</label>
                <input 
                    className='input' 
                    type="number" 
                    id="discount_value" 
                    name="discount_value" 
                    placeholder="Nhập giá trị giảm" 
                    required 
                    min="0"
                    step="0.01"
                    value={discount_value} 
                    onChange={(e) => setDiscountValue(e.target.value)} 
                />
            </div>
            <div className={styles.inputGroup}>
                <label htmlFor="discount_unit">Đơn vị giảm *</label>
                <select 
                    className='input' 
                    id="discount_unit" 
                    name="discount_unit" 
                    required 
                    value={discount_unit} 
                    onChange={(e) => setDiscountUnit(e.target.value)}
                >
                    <option value="none">Không</option>
                    <option value="amount">VND</option>
                    <option value="percent">%</option>
                </select>
            </div>
            <div className={styles.inputGroup}>
                <label htmlFor="note">Ghi chú</label>
                <textarea 
                    style={{ resize: 'vertical', height: 100 }} 
                    className='input' 
                    id="note" 
                    name="note" 
                    rows={3} 
                    placeholder="Ghi chú về chương trình khuyến mãi" 
                    value={note} 
                    onChange={(e) => setNote(e.target.value)} 
                />
            </div>
            <SubmitButton text={submitText} />
        </form>
    );
}

export default function SettingDiscount({ data }) {
    const router = useRouter();
    const [isListOpen, setIsListOpen] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isUpdateOpen, setIsUpdateOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [notification, setNotification] = useState({ open: false, status: true, mes: '' });
    const [createState, createAction] = useActionState(createDiscountAction, { message: null, status: null });
    const [updateState, updateAction] = useActionState(updateDiscountAction, { message: null, status: null });
    const [deleteState, deleteAction] = useActionState(deleteDiscountAction, { message: null, status: null });
    const isActionPending = createState.pending || updateState.pending || deleteState.pending;

    const handleActionComplete = useCallback((state, callback) => {
        if (state.message) {
            setNotification({ open: true, status: state.status, mes: state.message });
            if (state.status) {
                router.refresh();
                if (callback) callback();
            }
        }
    }, [router]);

    useEffect(() => { handleActionComplete(createState, () => setIsCreateOpen(false)) }, [createState, handleActionComplete]);
    useEffect(() => { handleActionComplete(updateState, () => setIsUpdateOpen(false)) }, [updateState, handleActionComplete]);
    useEffect(() => { 
        handleActionComplete(deleteState, () => {
            setIsDeleteConfirmOpen(false);
            setItemToDelete(null);
        });
    }, [deleteState, handleActionComplete]);

    const handleOpenUpdate = (item) => {
        setEditingItem(item);
        setIsUpdateOpen(true);
    };

    const handleOpenDeleteConfirm = (item, e) => {
        e?.stopPropagation(); // Ngăn click event bubble lên parent
        setItemToDelete(item);
        setIsDeleteConfirmOpen(true);
    };

    const getDiscountUnitLabel = (unit) => {
        switch (unit) {
            case 'none': return 'Không';
            case 'amount': return 'VND';
            case 'percent': return '%';
            default: return 'Không';
        }
    };

    const formatDiscountValue = (value, unit) => {
        if (unit === 'percent') {
            return `${value}%`;
        } else if (unit === 'amount') {
            return new Intl.NumberFormat('vi-VN').format(value) + ' đ';
        }
        return value;
    };

    return (
        <>
            <button className='btn_s' onClick={() => setIsListOpen(true)}>
                <Tag className="w-4 h-4" style={{ width: 'var(--font-size-sm)', height: 'var(--font-size-sm)' }} />
                <h5 className='text_w_400'>Khuyến mãi</h5>
            </button>
            <FlexiblePopup 
                open={isListOpen} 
                onClose={() => setIsListOpen(false)} 
                title="Cài đặt Chương trình Khuyến mãi" 
                width={'600px'}
                renderItemList={() => (
                    <div className={styles.popupContentWrapper}>
                        <div className={styles.actionsHeader} style={{ paddingBottom: 8, borderBottom: 'thin solid var(--border-color)' }}>
                            <button className='btn_s' onClick={() => setIsCreateOpen(true)}>
                                <Svg_Add w={'var(--font-size-sm)'} h={'var(--font-size-sm)'} c={'var(--text-primary)'} />
                                <h5 className='text_w_400'>Thêm chương trình khuyến mãi</h5>
                            </button>
                        </div>
                        <div className={styles.itemsContainer}>
                            {data && data.length > 0 ? (
                                data.map((item) => (
                                    <div key={item._id} className={styles.item}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                                            <div style={{ flex: 1 }} onClick={() => handleOpenUpdate(item)}>
                                                <h5 style={{ textTransform: 'uppercase', marginBottom: 8 }}>{item.name}</h5>
                                                <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                                                    <h6>Giá trị: <strong>{formatDiscountValue(item.discount_value, item.discount_unit)}</strong></h6>
                                                    <h6>Đơn vị: <strong>{getDiscountUnitLabel(item.discount_unit)}</strong></h6>
                                                </div>
                                                {item.note && (
                                                    <h5 className="text_w_400" style={{ marginBottom: 8 }}>{item.note}</h5>
                                                )}
                                                <h6 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    Ngày tạo: {formatDate(new Date(item.createdAt)) || 'Không rõ'}
                                                </h6>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <Button 
                                                    size="sm" 
                                                    variant="outline" 
                                                    onClick={() => handleOpenUpdate(item)}
                                                    style={{ minWidth: 'auto', padding: '4px 8px' }}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="destructive" 
                                                    onClick={(e) => handleOpenDeleteConfirm(item, e)}
                                                    style={{ minWidth: 'auto', padding: '4px 8px' }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                    <h5>Chưa có chương trình khuyến mãi nào</h5>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            />
            <CenterPopup open={isCreateOpen} onClose={() => setIsCreateOpen(false)} size="md">
                <Title content="Thêm chương trình khuyến mãi" click={() => setIsCreateOpen(false)} />
                <div className={styles.mainform}>
                    <DiscountForm formAction={createAction} formState={createState} submitText="Thêm chương trình khuyến mãi" />
                </div>
            </CenterPopup>
            <CenterPopup key={editingItem?._id || 'update'} open={isUpdateOpen} onClose={() => setIsUpdateOpen(false)} size="md">
                {editingItem && (
                    <>
                        <Title content="Chỉnh sửa chương trình khuyến mãi" click={() => setIsUpdateOpen(false)} />
                        <div className={styles.mainform}>
                            <DiscountForm formAction={updateAction} formState={updateState} initialData={editingItem} submitText="Cập nhật" />
                        </div>
                    </>
                )}
            </CenterPopup>
            <AlertPopup 
                open={isDeleteConfirmOpen} 
                onClose={() => setIsDeleteConfirmOpen(false)} 
                title="Bạn có chắc chắn muốn xóa chương trình khuyến mãi này?" 
                type="warning" 
                width={600}
                content={
                    itemToDelete && (
                        <h5>Hành động này sẽ xóa vĩnh viễn chương trình khuyến mãi <strong>&quot;{itemToDelete.name}&quot;</strong>. Bạn sẽ không thể hoàn tác.</h5>
                    )
                }
                actions={
                    <form action={deleteAction} className={styles.deleteConfirmForm}>
                        <input type="hidden" name="id" value={itemToDelete?._id || ''} />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" style={{ whiteSpace: 'nowrap' }} onClick={() => setIsDeleteConfirmOpen(false)} className='btn_s'>
                                <h5>Quay lại</h5>
                            </button>
                            <SubmitButton text="Tiếp tục xóa" />
                        </div>
                    </form>
                }
            />
            <Noti open={notification.open} onClose={() => setNotification(p => ({ ...p, open: false }))} status={notification.status} mes={notification.mes} />
            {isActionPending && (
                <div className='loadingOverlay' style={{ zIndex: 9999 }}>
                    <Loading content={<h5>Đang xử lý...</h5>} />
                </div>
            )}
        </>
    );
}

