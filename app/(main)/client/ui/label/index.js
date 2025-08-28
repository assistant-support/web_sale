'use client';

import React, { useState, useCallback, useMemo } from 'react';
import FlexiblePopup from '@/components/(features)/(popup)/popup_right';
import { Svg_Label, Svg_Pen } from '@/components/(icon)/svg';
import styles from './index.module.css';
import WrapIcon from '@/components/(ui)/(button)/hoveIcon';
import Noti from '@/components/(features)/(noti)/noti';
import { useRouter } from 'next/navigation';

const LabelRow = React.memo(({ label, onEdit }) => (
    <div className={styles.labelRow}>
        <div className={styles.labelInfo}>
            <p className='text_6'>Tiêu đề nhãn: </p>
            <p className='text_6_400'>{label.title}</p>
        </div>
        <div className={styles.labelActions}>
            <WrapIcon
                icon={<Svg_Pen w={16} h={16} c={'white'} />}
                content='Sửa nhãn'
                placement='left'
                style={{ backgroundColor: 'var(--yellow)' }}
                click={() => onEdit(label._id)}
            />
        </div>
    </div>
));

const EditLabelForm = React.memo(({ label, onSubmit, isLoading }) => {
    const [formData, setFormData] = useState({
        title: label?.title || '',
        desc: label?.desc || '',
        content: label?.content || '',
    });

    React.useEffect(() => {
        if (label) {
            setFormData({
                title: label.title || '',
                desc: label.desc || '',
                content: label.content || '',
            });
        }
    }, [label]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isLoading) return; // Không cho submit khi đang loading
        onSubmit(label._id, formData);
    };

    if (!label) return null;

    return (
        <form onSubmit={handleSubmit} className={styles.editForm}>
            {/* Các trường input không đổi */}
            <div className={styles.formGroup}>
                <label htmlFor="title" className='text_6'>Tiêu đề</label>
                <input id="title" name="title" type="text" value={formData.title} onChange={handleChange} className='input' />
            </div>
            <div className={styles.formGroup}>
                <label htmlFor="desc" className='text_6'>Mô tả</label>
                <textarea id="desc" name="desc" value={formData.desc} onChange={handleChange} className='input' rows={3} />
            </div>
            <div className={styles.formGroup}>
                <label htmlFor="content" className='text_6'>Nội dung</label>
                <textarea id="content" name="content" value={formData.content} onChange={handleChange} className='input' rows={5} />
            </div>
            <button type="submit" className='btn' disabled={isLoading}>
                {isLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
        </form>
    );
});


export default function Label({ data, onUpdateSuccess }) {
    const router = useRouter();
    const [isListPopupOpen, setListPopupOpen] = useState(false);
    const [editingLabelId, setEditingLabelId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [notification, setNotification] = useState({ open: false, mes: '', status: false, });

    const editingLabel = useMemo(() =>
        data.find(label => label._id === editingLabelId),
        [data, editingLabelId]
    );

    // --- HANDLERS ---
    const handleOpenListPopup = useCallback(() => setListPopupOpen(true), []);
    const handleOpenEditPopup = useCallback((labelId) => setEditingLabelId(labelId), []);

    const handleCloseAllPopups = useCallback(() => {
        setListPopupOpen(false);
        setEditingLabelId(null);
    }, []);

    const handleCloseEditPopup = useCallback(() => setEditingLabelId(null), []);
    const handleCloseNoti = useCallback(() => setNotification(prev => ({ ...prev, open: false })), []);

    const handleLabelUpdate = useCallback(async (labelId, formData) => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/label', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    _id: labelId,
                    ...formData,
                }),
            });

            const result = await response.json();
            const isSuccess = result.status === 2;

            setNotification({
                open: true,
                mes: result.mes,
                status: isSuccess,
            });

            if (isSuccess) {
                router.refresh(); 
                handleCloseEditPopup();
                if (onUpdateSuccess) {
                    onUpdateSuccess();
                }
            }
        } catch (error) {
            console.error("Lỗi khi cập nhật nhãn:", error);
            setNotification({
                open: true,
                mes: 'Không thể kết nối đến máy chủ. Vui lòng thử lại.',
                status: false,
            });
        } finally {

            setIsLoading(false);
        }
    }, [handleCloseEditPopup, onUpdateSuccess]);

    const renderLabelList = useCallback((labels) => {
        if (!labels || labels.length === 0) {
            return <p>Không có nhãn nào.</p>;
        }
        return (
            <div className={styles.listContainer}>
                {labels.map(label => (
                    <LabelRow key={label._id} label={label} onEdit={handleOpenEditPopup} />
                ))}
            </div>
        );
    }, [handleOpenEditPopup]);
    return (
        <>
            <div className='btn' style={{ margin: 0, transform: 'none' }} onClick={handleOpenListPopup}>
                <Svg_Label w={16} h={16} c="white" />
                <p className='text_6' style={{ color: 'white' }}>Quản lý chiến dịch</p>
            </div>

            <FlexiblePopup
                open={isListPopupOpen}
                onClose={handleCloseAllPopups}
                title="Quản lý nhãn"
                data={data}
                renderItemList={renderLabelList}
                secondaryOpen={!!editingLabel}
                onCloseSecondary={handleCloseEditPopup}
                secondaryTitle={`Chỉnh sửa nhãn: ${editingLabel?.title || ''}`}
                renderSecondaryList={() => (
                    <EditLabelForm
                        label={editingLabel}
                        onSubmit={handleLabelUpdate}
                        isLoading={isLoading}
                    />
                )}
            />

            <Noti
                open={notification.open}
                onClose={handleCloseNoti}
                status={notification.status}
                mes={notification.mes}
                button={<div onClick={handleCloseNoti} className='btn' style={{ width: 'calc(100% - 24px)', justifyContent: 'center' }}>Tắt thông báo</div>}
            />
        </>
    );
}