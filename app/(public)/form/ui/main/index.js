"use client";

import { useEffect, useRef, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import styles from './index.module.css';
import { addRegistrationToAction } from '@/app/actions/data.actions';

// Trạng thái ban đầu cho action
const INITIAL_ACTION_STATE = {
    message: null,
    type: null,
};

// Component nút Submit (giữ nguyên)
function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button type="submit" className={styles.button} disabled={pending}>
            {pending ? 'Đang xử lý...' : 'Đăng ký ngay'}
        </button>
    );
}

// Cấu hình tất cả các trường có thể có
const allPossibleFields = {
    1: {
        id: 'name', name: 'name', label: 'Tên học sinh', type: 'text', required: true
    },
    2: {
        id: 'nameparent', name: 'nameparent', label: 'Tên phụ huynh', type: 'text', required: true
    },
    3: {
        id: 'phone', name: 'phone', label: 'Số điện thoại liên lạc', type: 'tel', required: true,
        note: 'Lưu ý: Vui lòng sử dụng SĐT có đăng ký Zalo để nhận thông tin.'
    },
    4: {
        id: 'email', name: 'email', label: 'Email', type: 'email', required: false
    },
    5: {
        id: 'area', name: 'area', label: 'Khu vực', type: 'select', required: true,
        options: ['Long Khánh', 'Long Thành', 'TP HCM', 'Biên Hòa', 'Khác']
    },
    6: {
        id: 'bd', name: 'bd', label: 'Ngày sinh học sinh', type: 'date', required: true
    },
};

export default function RegistrationForm({ id }) {
    // ⬇️ Đổi sang React.useActionState
    const [state, formAction] = useActionState(addRegistrationToAction, INITIAL_ACTION_STATE);
    const formRef = useRef(null);

    useEffect(() => {
        if (state.type === 'success') {
            formRef.current?.reset();
        }
    }, [state.type]);

    const fieldsToRender = id?.formInput || [];

    return (
        <div className={styles.container}>
            <div className={styles.banner}></div>
            <div className={styles.header}>
                <h1 className={styles.title}>{id?.name || 'Đăng ký khóa học'}</h1>
                <p className={styles.subtitle}>{id?.describe || 'Khai phá tiềm năng và chuẩn bị cho tương lai ngay từ hôm nay!'}</p>
            </div>

            <form ref={formRef} action={formAction} className={styles.form}>
                <input type="hidden" name="source" value={id?._id} />
                <input type="hidden" name="sourceName" value={id?.name} />

                {fieldsToRender.map((fieldId) => {
                    const field = allPossibleFields[fieldId];
                    if (!field) return null;

                    if (field.type === 'select') {
                        return (
                            <div key={field.id} className={styles.formGroup}>
                                <label htmlFor={field.id} className={styles.label}>
                                    {field.label} {field.required && <span>*</span>}
                                </label>
                                <select
                                    id={field.id}
                                    name={field.name}
                                    className={styles.input}
                                    required={field.required}
                                    defaultValue=""
                                >
                                    <option value="" disabled>-- Chọn {field.label.toLowerCase()} --</option>
                                    {field.options.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    }

                    return (
                        <div key={field.id} className={styles.formGroup}>
                            <label htmlFor={field.id} className={styles.label}>
                                {field.label} {field.required && <span>*</span>}
                            </label>
                            <input
                                type={field.type}
                                id={field.id}
                                name={field.name}
                                className={styles.input}
                                required={field.required}
                            />
                            {field.note && <p className={styles.note}>{field.note}</p>}
                        </div>
                    );
                })}

                <SubmitButton />

                {state.message && (
                    <div className={`${styles.message} ${state.type === 'success' ? styles.success : styles.error}`}>
                        {state.message}
                    </div>
                )}
            </form>
        </div>
    );
}
