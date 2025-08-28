'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    createAreaAction,
    updateAreaAction,
    deleteAreaAction,
} from '@/app/actions/data.actions';

import AlertPopup from '@/components/(features)/(noti)/alert';
import CenterPopup from '@/components/(features)/(popup)/popup_center';
import Title from '@/components/(features)/(popup)/title';
import WrapIcon from '@/components/(ui)/(button)/hoveIcon';
import { BeautifulButton } from '@/components/(ui)/(button)/button';

import { TextField } from '@mui/material';
import { FiPlus, FiTrash2, FiCopy, FiDownload } from 'react-icons/fi';
import { MdOutlineAreaChart } from 'react-icons/md';

import useActionUI from '@/hooks/useActionUI';
import { formatDate } from '@/function';
import styles from './index.module.css';

// ========================= Helpers & Small Components =========================

function SubmitButton({ text = 'Thực hiện' }) {
    return (
        <div style={{ borderTop: 'thin solid var(--border-color)', paddingTop: 16 }}>
            <BeautifulButton type="submit" variant="contained">
                <h5 style={{ color: 'white', margin: 0 }}>{text}</h5>
            </BeautifulButton>
        </div>
    );
}

// Các trường cho phép hiển thị
const fieldOptions = [
    { id: 1, label: 'Họ và Tên' },
    { id: 2, label: 'Tên phụ huynh' },
    { id: 3, label: 'Số điện thoại' },
    { id: 4, label: 'Email' },
    { id: 5, label: 'Khu vực' },
    { id: 6, label: 'Ngày sinh' },
];

function FieldSelector({ selectedFields, setSelectedFields }) {
    const handleToggleField = (fieldId) => {
        setSelectedFields((prev) =>
            prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
        );
    };

    return (
        <div className={styles.inputGroup}>
            <label>Các trường hiển thị trên form</label>
            <div className={styles.fieldSelector}>
                {fieldOptions.map((field) => {
                    const active = selectedFields.includes(field.id);
                    return (
                        <BeautifulButton
                            key={field.id}
                            type="button"
                            size="small"
                            variant={active ? 'contained' : 'outlined'}
                            className={`${styles.fieldButton} ${active ? styles.selected : ''}`}
                            onClick={() => handleToggleField(field.id)}
                        >
                            {field.label}
                        </BeautifulButton>
                    );
                })}
            </div>
        </div>
    );
}

// ========================= AreaForm (Create/Update) =========================

/**
 * AreaForm submit qua callback onSubmit(fd),
 * để phía parent gọi Server Action đúng chữ ký: (prevState, formData)
 */
function AreaForm({ onSubmit, initialData = null, submitText }) {
    const [name, setName] = useState('');
    const [describe, setDescribe] = useState('');
    const defaultFields = [1, 2, 3, 4, 5, 6];
    const [selectedFields, setSelectedFields] = useState(defaultFields);

    useEffect(() => {
        setName(initialData?.name || '');
        setDescribe(initialData?.describe || '');
        setSelectedFields(
            initialData?.formInput && initialData.formInput.length > 0
                ? initialData.formInput
                : defaultFields
        );
    }, [initialData]);

    const handleSubmit = useCallback(
        (e) => {
            e.preventDefault();
            const formEl = e.currentTarget;
            const fd = new FormData(formEl);

            if (initialData?._id) fd.set('id', initialData._id);

            // Chuẩn hoá mảng formInput
            fd.delete('formInput');
            selectedFields.forEach((fieldId) => fd.append('formInput', String(fieldId)));

            onSubmit?.(fd);
        },
        [initialData, selectedFields, onSubmit]
    );

    return (
        <form onSubmit={handleSubmit} className={styles.createForm}>
            {/* Input ẩn hỗ trợ submit bằng Enter */}
            {initialData?._id && <input type="hidden" name="id" value={initialData._id} />}
            {selectedFields.map((fieldId) => (
                <input type="hidden" name="formInput" key={fieldId} value={fieldId} />
            ))}

            <div className={styles.inputGroup}>
                <label htmlFor="name">Tên nguồn</label>
                <TextField
                    size="small"
                    variant="outlined"
                    fullWidth
                    id="name"
                    name="name"
                    placeholder="Ví dụ: Dữ liệu Marketing"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input"
                />
            </div>

            <div className={styles.inputGroup}>
                <label htmlFor="describe">Mô tả nguồn nhận dữ liệu</label>
                <TextField
                    size="small"
                    variant="outlined"
                    fullWidth
                    id="describe"
                    name="describe"
                    placeholder="Mô tả ngắn về nguồn dữ liệu này"
                    multiline
                    minRows={3}
                    value={describe}
                    onChange={(e) => setDescribe(e.target.value)}
                    className="input"
                />
            </div>

            <FieldSelector selectedFields={selectedFields} setSelectedFields={setSelectedFields} />

            <SubmitButton text={submitText} />
        </form>
    );
}

// ========================= Main Page =========================

export default function SettingData({ data }) {
    const router = useRouter();
    const { UI, run } = useActionUI();

    const [isCreatePopupOpen, setIsCreatePopupOpen] = useState(false);
    const [isUpdatePopupOpen, setIsUpdatePopupOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    const [editingItem, setEditingItem] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [copyStatus, setCopyStatus] = useState('idle'); // 'idle' | 'copied' | 'error'

    // ---------- Actions via useActionUI.run ----------
    // LƯU Ý: Mọi server action đều nhận (prevState, formData) → ta truyền undefined cho prevState.

    const handleCreateSubmit = useCallback(
        async (formData) => {
            await run(
                async () => {
                    const res = await createAreaAction(undefined, formData);
                    return { ok: res?.status === true, message: res?.message, data: res?.data };
                },
                {
                    loadingText: 'Đang tạo form…',
                    silentOnSuccess: false,
                    refreshOnSuccess: true,
                    onSuccess: () => setIsCreatePopupOpen(false),
                }
            );
        },
        [run]
    );

    const handleUpdateSubmit = useCallback(
        async (formData) => {
            await run(
                async () => {
                    const res = await updateAreaAction(undefined, formData);
                    return { ok: res?.status === true, message: res?.message, data: res?.data };
                },
                {
                    loadingText: 'Đang cập nhật…',
                    silentOnSuccess: false,
                    refreshOnSuccess: true,
                    onSuccess: () => {
                        setIsUpdatePopupOpen(false);
                        setEditingItem(null);
                    },
                }
            );
        },
        [run]
    );

    const handleOpenUpdatePopup = (item) => {
        setEditingItem(item);
        setIsUpdatePopupOpen(true);
    };

    const handleOpenDeleteConfirm = (item) => {
        setItemToDelete(item);
        setIsDeleteConfirmOpen(true);
    };
    const handleCloseDeleteConfirm = () => setIsDeleteConfirmOpen(false);

    const handleDeleteSubmit = useCallback(
        async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            await run(
                async () => {
                    const res = await deleteAreaAction(undefined, fd);
                    return { ok: res?.status === true, message: res?.message };
                },
                {
                    loadingText: 'Đang xoá…',
                    silentOnSuccess: false,
                    refreshOnSuccess: true,
                    onSuccess: () => {
                        setIsDeleteConfirmOpen(false);
                        setIsUpdatePopupOpen(false);
                        setItemToDelete(null);
                        setEditingItem(null);
                    },
                }
            );
        },
        [run]
    );

    const handleSyncSubmit = useCallback(
        async (e) => {
            e.preventDefault();
        },
        [run]
    );

    // ---------- Clipboard ----------
    const handleCopyToClipboard = async (textToCopy) => {
        if (!navigator.clipboard) {
            setCopyStatus('error');
            setTimeout(() => setCopyStatus('idle'), 2000);
            return;
        }
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopyStatus('copied');
        } catch {
            setCopyStatus('error');
        } finally {
            setTimeout(() => setCopyStatus('idle'), 2000);
        }
    };

    // ========================= Render =========================

    return (
        <>
            <div className={styles.popupContentWrapper}>
                <div className={styles.actionsHeader}>
                    <BeautifulButton
                        variant="contained"
                        onClick={() => setIsCreatePopupOpen(true)}
                        startIcon={
                            <FiPlus
                                style={{ width: 'var(--font-size-sm)', height: 'var(--font-size-sm)' }}
                                color="white"
                            />
                        }
                    >
                        <h5 className="text_w_400" style={{ margin: 0, color: 'white' }}>
                            Tạo Form mới
                        </h5>
                    </BeautifulButton>

                    <form onSubmit={handleSyncSubmit}>
                        <BeautifulButton type="submit" variant="contained" className="btn_s_b">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FiDownload
                                    style={{ width: 'var(--font-size-sm)', height: 'var(--font-size-sm)' }}
                                    color="white"
                                />
                                <h5 className="text_w_400" style={{ color: 'white', margin: 0 }}>
                                    Nhận data từ ggsheet
                                </h5>
                            </div>
                        </BeautifulButton>
                    </form>
                </div>

                <div className={styles.wraplistForms}>
                    <div className={styles.title}>
                        <MdOutlineAreaChart
                            style={{ width: 'var(--font-size-xs)', height: 'var(--font-size-xs)' }}
                            color="var(--text-primary)"
                        />
                        <h4>Danh sách sự kiện - nguồn dữ liệu</h4>
                    </div>

                    <div className={styles.itemsContainer}>
                        {data.map((item) => (
                            <div
                                key={item._id}
                                className={styles.item}
                                onClick={() => handleOpenUpdatePopup(item)}
                            >
                                <h5 style={{ textTransform: 'uppercase' }}>{item.name}</h5>
                                <div style={{ display: 'flex', gap: 16 }}>
                                    <h6>Ngày tạo: {formatDate(new Date(item.createdAt)) || 'Không rõ'}</h6>
                                    <h6>Được tạo bởi: {item.createdBy?.name || 'Không rõ'}</h6>
                                    <h6>Số khách hàng: {item.customerCount || 0}</h6>
                                </div>
                                <h5 className="text_w_400">{item.describe}</h5>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Popup tạo mới */}
            <CenterPopup open={isCreatePopupOpen} onClose={() => setIsCreatePopupOpen(false)} size="md">
                <Title content="Tạo Form mới" click={() => setIsCreatePopupOpen(false)} />
                <div className={styles.mainform}>
                    <AreaForm onSubmit={handleCreateSubmit} submitText="Tạo form mới" />
                </div>
            </CenterPopup>

            {/* Popup cập nhật */}
            <CenterPopup
                key={editingItem?._id || 'update-popup'}
                open={isUpdatePopupOpen}
                onClose={() => setIsUpdatePopupOpen(false)}
                size="md"
            >
                {editingItem && (
                    <>
                        <Title content="Chỉnh sửa Form" click={() => setIsUpdatePopupOpen(false)} />
                        <div className={styles.mainform}>
                            <div className={styles.inputGroup}>
                                <h5>Đường dẫn tới form</h5>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        borderRadius: 3,
                                        border: ' thin solid var(--border-color)',
                                        alignItems: 'center',
                                        padding: 3,
                                        paddingLeft: 8,
                                    }}
                                >
                                    <h5>{`http://localhost:3000/form/${editingItem._id}`}</h5>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <WrapIcon
                                            icon={
                                                <FiCopy
                                                    style={{
                                                        width: 'var(--font-size-base)',
                                                        height: 'var(--font-size-base)',
                                                    }}
                                                    color="var(--text-primary)"
                                                />
                                            }
                                            click={() =>
                                                handleCopyToClipboard(
                                                    `http://localhost:3000/form?id=${editingItem._id}`
                                                )
                                            }
                                            placement='left'
                                            style={{backgroundColor: 'var(--bg-btn)'}}
                                            content={
                                                copyStatus === 'copied'
                                                    ? 'Đã sao chép!'
                                                    : copyStatus === 'error'
                                                        ? 'Sao chép lỗi!'
                                                        : 'Sao chép đường dẫn'
                                            }
                                        />
                                        <WrapIcon
                                            icon={
                                                <FiTrash2
                                                    style={{
                                                        width: 'var(--font-size-base)',
                                                        height: 'var(--font-size-base)',
                                                    }}
                                                    color="white"
                                                />
                                            }
                                            placement='left'
                                            click={() => handleOpenDeleteConfirm(editingItem)}
                                            style={{ backgroundColor: 'var(--red)' }}
                                            content="Xóa form này"
                                        />
                                    </div>
                                </div>
                            </div>

                            <AreaForm
                                onSubmit={handleUpdateSubmit}
                                initialData={editingItem}
                                submitText="Cập nhật"
                            />
                        </div>
                    </>
                )}
            </CenterPopup>

            {/* Xác nhận xoá */}
            <AlertPopup
                open={isDeleteConfirmOpen}
                onClose={handleCloseDeleteConfirm}
                title="Bạn có chắc chắn muốn xóa form này?"
                type="warning"
                width={600}
                content={
                    itemToDelete && (
                        <h5>
                            Hành động này sẽ xóa vĩnh viễn form <strong>"{itemToDelete.name}"</strong>. Bạn sẽ
                            không thể hoàn tác hành động này.
                        </h5>
                    )
                }
                actions={
                    <form onSubmit={handleDeleteSubmit}>
                        <input type="hidden" name="id" value={itemToDelete?._id || ''} />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <BeautifulButton
                                type="button"
                                size="small"
                                onClick={handleCloseDeleteConfirm}
                                className="btn_s"
                                variant="outlined"
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                <h5 style={{ margin: 0 }}>Quay lại</h5>
                            </BeautifulButton>
                            <SubmitButton text="Tiếp tục xóa" />
                        </div>
                    </form>
                }
            />
            <UI />
        </>
    );
}
