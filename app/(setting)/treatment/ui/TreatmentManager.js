'use client';
import React, { useState, useEffect, useActionState, useCallback } from 'react';
import { useFormStatus } from 'react-dom';
import { 
    createMedicineAction, 
    updateMedicineAction, 
    deleteMedicineAction,
    createUnitMedicineAction,
    updateUnitMedicineAction,
    deleteUnitMedicineAction,
    createTreatmentDoctorAction,
    updateTreatmentDoctorAction,
    deleteTreatmentDoctorAction
} from '@/app/actions/treatment.actions';
import AlertPopup from '@/components/(features)/(noti)/alert';
import CenterPopup from '@/components/(features)/(popup)/popup_center';
import Noti from '@/components/(features)/(noti)/noti';
import { Trash2, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

function SubmitButton({ text = 'Thực hiện' }) {
    const { pending } = useFormStatus();
    return (
        <button type="submit" disabled={pending} className='btn' style={{ transform: 'none', margin: 0 }}>
            {pending ? 'Đang xử lý...' : text}
        </button>
    );
}

// Form cho Thuốc
function MedicineForm({ formAction, formState, initialData = null, submitText }) {
    const [name, setName] = useState(initialData?.name || '');
    const [note, setNote] = useState(initialData?.note || '');

    useEffect(() => {
        if (formState.status === true && !initialData) {
            setName('');
            setNote('');
        }
    }, [formState, initialData]);

    useEffect(() => {
        setName(initialData?.name || '');
        setNote(initialData?.note || '');
    }, [initialData]);

    return (
        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {initialData?._id && <input type="hidden" name="id" value={initialData._id} />}
            <div>
                <label htmlFor="name" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Tên thuốc *
                </label>
                <Input
                    type="text"
                    id="name"
                    name="name"
                    placeholder="Nhập tên thuốc"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>
            <div>
                <label htmlFor="note" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Ghi chú
                </label>
                <Textarea
                    id="note"
                    name="note"
                    placeholder="Nhập ghi chú (tùy chọn)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <SubmitButton text={submitText} />
            </div>
        </form>
    );
}

// Form cho Đơn vị thuốc
function UnitMedicineForm({ formAction, formState, initialData = null, submitText }) {
    const [name, setName] = useState(initialData?.name || '');
    const [note, setNote] = useState(initialData?.note || '');

    useEffect(() => {
        if (formState.status === true && !initialData) {
            setName('');
            setNote('');
        }
    }, [formState, initialData]);

    useEffect(() => {
        setName(initialData?.name || '');
        setNote(initialData?.note || '');
    }, [initialData]);

    return (
        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {initialData?._id && <input type="hidden" name="id" value={initialData._id} />}
            <div>
                <label htmlFor="name" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Tên đơn vị thuốc *
                </label>
                <Input
                    type="text"
                    id="name"
                    name="name"
                    placeholder="Nhập tên đơn vị thuốc"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>
            <div>
                <label htmlFor="note" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Ghi chú
                </label>
                <Textarea
                    id="note"
                    name="note"
                    placeholder="Nhập ghi chú (tùy chọn)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <SubmitButton text={submitText} />
            </div>
        </form>
    );
}

// Form cho Bác sĩ liệu trình
function TreatmentDoctorForm({ formAction, formState, initialData = null, submitText }) {
    const [name, setName] = useState(initialData?.name || '');
    const [expertise, setExpertise] = useState(initialData?.expertise || '');
    const [note, setNote] = useState(initialData?.note || '');

    useEffect(() => {
        if (formState.status === true && !initialData) {
            setName('');
            setExpertise('');
            setNote('');
        }
    }, [formState, initialData]);

    useEffect(() => {
        setName(initialData?.name || '');
        setExpertise(initialData?.expertise || '');
        setNote(initialData?.note || '');
    }, [initialData]);

    return (
        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {initialData?._id && <input type="hidden" name="id" value={initialData._id} />}
            <div>
                <label htmlFor="name" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Tên bác sĩ *
                </label>
                <Input
                    type="text"
                    id="name"
                    name="name"
                    placeholder="Nhập tên bác sĩ"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>
            <div>
                <label htmlFor="expertise" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Chuyên môn
                </label>
                <Input
                    type="text"
                    id="expertise"
                    name="expertise"
                    placeholder="Nhập chuyên môn (tùy chọn)"
                    value={expertise}
                    onChange={(e) => setExpertise(e.target.value)}
                />
            </div>
            <div>
                <label htmlFor="note" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    Ghi chú
                </label>
                <Textarea
                    id="note"
                    name="note"
                    placeholder="Nhập ghi chú (tùy chọn)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <SubmitButton text={submitText} />
            </div>
        </form>
    );
}

// Component quản lý từng phần
function SectionManager({ 
    title, 
    data = [], 
    onCreate, 
    onUpdate, 
    onDelete, 
    createAction, 
    updateAction, 
    deleteAction,
    FormComponent
}) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isUpdateOpen, setIsUpdateOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [notification, setNotification] = useState({ open: false, status: true, mes: '' });
    const [createState, createActionFn] = useActionState(createAction, { message: null, status: null });
    const [updateState, updateActionFn] = useActionState(updateAction, { message: null, status: null });
    const [deleteState, deleteActionFn] = useActionState(deleteAction, { message: null, status: null });

    const handleActionComplete = useCallback((state, callback) => {
        if (state.message) {
            setNotification({ open: true, status: state.status, mes: state.message });
            if (state.status) {
                if (callback) callback();
            }
        }
    }, []);

    useEffect(() => {
        if (createState.message) {
            handleActionComplete(createState, () => {
                setIsCreateOpen(false);
                onCreate?.();
            });
        }
    }, [createState, handleActionComplete, onCreate]);

    useEffect(() => {
        if (updateState.message) {
            handleActionComplete(updateState, () => {
                setIsUpdateOpen(false);
                setEditingItem(null);
                onUpdate?.();
            });
        }
    }, [updateState, handleActionComplete, onUpdate]);

    useEffect(() => {
        if (deleteState.message) {
            handleActionComplete(deleteState, () => {
                setIsDeleteConfirmOpen(false);
                setItemToDelete(null);
                onDelete?.();
            });
        }
    }, [deleteState, handleActionComplete, onDelete]);

    const handleEdit = (item) => {
        setEditingItem(item);
        setIsUpdateOpen(true);
    };

    const handleDelete = (item, e) => {
        e?.stopPropagation();
        setItemToDelete(item);
        setIsDeleteConfirmOpen(true);
    };

    return (
        <div style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: '#fff'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{title}</h3>
                <Button 
                    size="sm" 
                    onClick={() => setIsCreateOpen(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <Plus className="w-4 h-4" />
                    Thêm
                </Button>
            </div>
            
            <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                maxHeight: data.length > 10 ? '400px' : 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                padding: '8px'
            }}>
                {data.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#6b7280', padding: '16px' }}>
                        Chưa có dữ liệu
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {data.map((item) => (
                            <div 
                                key={item._id} 
                                style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    padding: '12px',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    backgroundColor: '#f9fafb'
                                }}
                            >
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontWeight: 500, marginBottom: '4px' }}>{item.name}</p>
                                    {item.expertise && (
                                        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                                            Chuyên môn: {item.expertise}
                                        </p>
                                    )}
                                    {item.note && (
                                        <p style={{ fontSize: '12px', color: '#6b7280' }}>
                                            {item.note}
                                        </p>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEdit(item)}
                                        style={{ minWidth: 'auto', padding: '4px 8px' }}
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={(e) => handleDelete(item, e)}
                                        style={{ minWidth: 'auto', padding: '4px 8px' }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Popup tạo mới */}
            <CenterPopup
                open={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                title={`Thêm ${title}`}
                size="md"
            >
                <FormComponent
                    formAction={createActionFn}
                    formState={createState}
                    submitText="Thêm"
                />
            </CenterPopup>

            {/* Popup sửa */}
            <CenterPopup
                open={isUpdateOpen}
                onClose={() => {
                    setIsUpdateOpen(false);
                    setEditingItem(null);
                }}
                title={`Sửa ${title}`}
                size="md"
            >
                {editingItem && (
                    <FormComponent
                        formAction={updateActionFn}
                        formState={updateState}
                        initialData={editingItem}
                        submitText="Lưu"
                    />
                )}
            </CenterPopup>

            {/* Popup xác nhận xóa */}
            <AlertPopup
                open={isDeleteConfirmOpen}
                onClose={() => setIsDeleteConfirmOpen(false)}
                title={`Bạn có chắc chắn muốn xóa ${title.toLowerCase()} này?`}
                type="warning"
                width={600}
                content={
                    itemToDelete && (
                        <h5>
                            Hành động này sẽ xóa vĩnh viễn <strong>&quot;{itemToDelete.name}&quot;</strong>. 
                            Bạn sẽ không thể hoàn tác.
                        </h5>
                    )
                }
                actions={
                    <form action={deleteActionFn} style={{ display: 'flex', gap: 8 }}>
                        <input type="hidden" name="id" value={itemToDelete?._id || ''} />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button 
                                type="button" 
                                style={{ whiteSpace: 'nowrap' }} 
                                onClick={() => setIsDeleteConfirmOpen(false)} 
                                className='btn_s'
                            >
                                <h5>Quay lại</h5>
                            </button>
                            <SubmitButton text="Tiếp tục xóa" />
                        </div>
                    </form>
                }
            />

            {/* Thông báo */}
            <Noti
                open={notification.open}
                onClose={() => setNotification({ open: false, status: true, mes: '' })}
                status={notification.status ? 'success' : 'error'}
                mes={notification.mes}
            />
        </div>
    );
}

export default function TreatmentManager({ medicines = [], unitMedicines = [], treatmentDoctors = [] }) {
    const [medicineList, setMedicineList] = useState(medicines);
    const [unitMedicineList, setUnitMedicineList] = useState(unitMedicines);
    const [treatmentDoctorList, setTreatmentDoctorList] = useState(treatmentDoctors);

    const refreshData = async () => {
        // Reload page để lấy dữ liệu mới từ server
        window.location.reload();
    };

    return (
        <div style={{ 
            display: 'flex', 
            gap: '16px', 
            height: '100%',
            flexDirection: 'column'
        }}>
            <div style={{ 
                display: 'flex', 
                gap: '16px', 
                flex: 1,
                minHeight: 0
            }}>
                {/* Phần 1: Thuốc */}
                <SectionManager
                    title="Thuốc"
                    data={medicineList}
                    onCreate={refreshData}
                    onUpdate={refreshData}
                    onDelete={refreshData}
                    createAction={createMedicineAction}
                    updateAction={updateMedicineAction}
                    deleteAction={deleteMedicineAction}
                    FormComponent={MedicineForm}
                />

                {/* Phần 2: Đơn vị thuốc */}
                <SectionManager
                    title="Đơn vị thuốc"
                    data={unitMedicineList}
                    onCreate={refreshData}
                    onUpdate={refreshData}
                    onDelete={refreshData}
                    createAction={createUnitMedicineAction}
                    updateAction={updateUnitMedicineAction}
                    deleteAction={deleteUnitMedicineAction}
                    FormComponent={UnitMedicineForm}
                />

                {/* Phần 3: Bác sĩ liệu trình */}
                <SectionManager
                    title="Bác sĩ liệu trình"
                    data={treatmentDoctorList}
                    onCreate={refreshData}
                    onUpdate={refreshData}
                    onDelete={refreshData}
                    createAction={createTreatmentDoctorAction}
                    updateAction={updateTreatmentDoctorAction}
                    deleteAction={deleteTreatmentDoctorAction}
                    FormComponent={TreatmentDoctorForm}
                />
            </div>
        </div>
    );
}

