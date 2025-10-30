// app/components/services/ServicesTable.client.jsx
'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import {
    BadgeCheck,
    CircleX,
    Headset,
    Pencil,
    Plus,
    Pill,
    Scissors,
    Search,
    Star,
    ToggleLeft,
    ToggleRight,
    Users,
    CheckCircle2,
    Package,
    DollarSign,
    Settings,
} from 'lucide-react';
import Popup from '@/components/ui/popup';
import ServiceEditorForm from './ServiceEditorForm.client';
import CustomSelect from '@/components/ui/CustomSelect.client';
import { useActionFeedback } from '@/hooks/useAction';

// Helper để định dạng tiền tệ
function formatCurrency(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '0 đ';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

const TYPE_FILTER_ITEMS = [
    { value: 'all', label: 'Tất cả loại' },
    { value: 'noi_khoa', label: 'Nội khoa' },
    { value: 'ngoai_khoa', label: 'Ngoại khoa' },
];

export default function ServicesTable({ initialData, actions }) {
    const { createService, updateService, setServiceActive, reloadServices, fixServiceCoverPermissions } = actions;

    const [q, setQ] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [openCreate, setOpenCreate] = useState(false);
    const [editing, setEditing] = useState(null);

    const act = useActionFeedback({
        successMessage: 'Thao tác thành công.',
        errorMessage: 'Có lỗi xảy ra.',
        onSuccess: async () => {
            await reloadServices();
        },
    });

    const data = useMemo(() => {
        let list = initialData || [];
        if (q) {
            const s = q.toLowerCase();
            list = list.filter(
                (x) =>
                    x.name?.toLowerCase().includes(s) ||
                    x.slug?.toLowerCase().includes(s) ||
                    x.type?.toLowerCase().includes(s) ||
                    (x.tags || []).some((t) => (t || '').toLowerCase().includes(s)),
            );
        }
        if (typeFilter !== 'all') {
            list = list.filter((x) => x.type === typeFilter);
        }
        return list;
    }, [initialData, q, typeFilter]);

    const toggleActive = async (svc) => {
        await act.run(setServiceActive, [svc._id, !svc.isActive], {
            successMessage: !svc.isActive ? 'Đã bật dịch vụ.' : 'Đã tắt dịch vụ.',
        });
    };

    const fixPermissions = async () => {
        const result = await act.run(fixServiceCoverPermissions, [], {
            successMessage: 'Đã sửa quyền hình ảnh.',
            errorMessage: 'Có lỗi khi sửa quyền hình ảnh.',
        });
        console.log('Fix permissions result:', result);
    };

    const TypePill = ({ type }) => (
        <span
            className="inline-flex items-center gap-1 rounded-[999px] border px-2.5 py-1 text-xs"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
            {type === 'noi_khoa' ? <Pill className="w-3.5 h-3.5" /> : <Scissors className="w-3.5 h-3.5" />}
            {type === 'noi_khoa' ? 'Nội khoa' : 'Ngoại khoa'}
        </span>
    );

    const coverUrlOf = (cover) => {
        console.log('🔍 coverUrlOf called with:', cover, 'type:', typeof cover);
        if (!cover) {
            console.log('❌ No cover provided');
            return null;
        }
        if (typeof cover === 'string' && (cover.startsWith('http') || cover.startsWith('data:'))) {
            console.log('✅ Using direct URL:', cover);
            return cover;
        }
        // Sử dụng format Google Drive uc?export=view cho image embedding
        const imageUrl = `https://drive.google.com/uc?export=view&id=${cover}`;
        
        console.log('✅ Generated image URL:', imageUrl);
        return imageUrl;
    };

    return (
        <div className="p-2 flex-1 flex flex-col" style={{ height: '100%' }}>
            {/* Toolbar */}
            <div
                className="flex flex-wrap items-center gap-3 p-1 pb-3 border-b sticky top-0 bg-[var(--bg-primary)] z-10"
                style={{ borderColor: 'var(--border)' }}
            >
                {/* Search */}
                <div
                    className="flex items-center gap-2 flex-1 min-w-[220px] rounded-[6px] border px-3 py-2"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                >
                    <Search className="w-4 h-4 text-[var(--primary)]" />
                    <input
                        className="bg-transparent outline-none w-full placeholder:text-[var(--primary)] text-sm"
                        placeholder="Tìm theo tên, slug, tag..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>

                {/* Type filter */}
                <CustomSelect value={typeFilter} onChange={setTypeFilter} items={TYPE_FILTER_ITEMS} />

                <button
                    onClick={fixPermissions}
                    className="inline-flex items-center gap-2 cursor-pointer rounded-[6px] px-3 py-2 text-sm font-medium hover:brightness-110"
                    style={{ background: 'var(--border)', color: 'var(--text)' }}
                    title="Sửa quyền hình ảnh cho tất cả dịch vụ"
                >
                    <Settings className="w-4 h-4" />
                    <h5>Sửa quyền ảnh</h5>
                </button>

                <button
                    onClick={() => setOpenCreate(true)}
                    className="inline-flex items-center gap-2 cursor-pointer rounded-[6px] px-3 py-2 text-sm font-medium hover:brightness-110"
                    style={{ background: 'var(--main_d)', color: 'white' }}
                >
                    <Plus className="w-4 h-4" />
                    <h5 style={{ color: 'white' }}>Thêm dịch vụ</h5>
                </button>
            </div>

            {/* “Bảng” dạng card */}
            <div className="mt-2 space-y-4 flex-1 scroll p-1">
                {data.map((svc) => {
                    console.log('🔍 Service data:', svc.name, 'cover:', svc.cover);
                    const interest = svc.stats?.interest ?? 0;
                    const completed = svc.stats?.completed ?? 0;
                    const reviews = svc.stats?.reviews ?? 0;
                    const courseCount = svc.treatmentCourses?.length || 0;
                    // const totalBasePrice = (svc.treatmentCourses || []).reduce(
                    //     (sum, course) => sum + (course.costs?.basePrice || 0),
                    //     0,
                    // );
                    const totalBasePrice = (svc.treatmentCourses || []).reduce((totalSum, course) => {
                        // 1. Lấy ra tất cả các giá trị số từ object 'costs' của liệu trình hiện tại.
                        // Ví dụ: { basePrice: 100, otherFees: 20 } sẽ trở thành [100, 20]
                        const allPricesForCourse = Object.values(course.costs || {});

                        // 2. Tính tổng tất cả chi phí cho liệu trình này.
                        const courseTotal = allPricesForCourse.reduce((courseSum, price) => courseSum + (price || 0), 0);

                        // 3. Cộng tổng của liệu trình vào tổng chung.
                        return totalSum + courseTotal;
                    }, 0);
                    const coverUrl = coverUrlOf(svc.cover);

                    return (
                        <article
                            key={svc._id}
                            className="overflow-hidden rounded-[6px] border bg-[var(--bg-primary)] text-[var(--text)] hover:ring-2 transition-shadow"
                            style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--ring)' }}
                        >
                            <div className="grid grid-cols-1 md:[grid-template-columns:1fr_260px]">
                                {/* Content (left) */}
                                <div className="p-4 md:p-5 flex flex-col justify-between">
                                    <div>
                                        <div className="text-[18px] font-semibold leading-tight flex gap-2">
                                            <p className='text-sm'>{svc.name}</p>
                                            <p className="inline-flex items-center gap-2 text-sm">
                                                <TypePill type={svc.type} />
                                            </p>
                                        </div>
                                        <h5 className="mt-1 text-sm text-[var(--muted)] line-clamp-2">{svc.description || '—'}</h5>
                                    </div>
                                    {/* Actions (middle) */}

                                    {/* Meta row */}

                                    <div className="hidden md:flex items-center justify-start pt-4 gap-16">
                                        <div
                                            className="inline-flex items-stretch rounded-[8px] border overflow-hidden bg-[var(--surface-2)]"
                                            style={{ borderColor: 'var(--border)' }}
                                        >
                                            <button
                                                onClick={() => setEditing(svc)}
                                                className="px-3 py-2 text-xs font-medium hover:bg-[var(--primary-50)] border-r"
                                                style={{ borderColor: 'var(--border)' }}
                                                title="Sửa"
                                            >
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Pencil className="w-3.5 h-3.5" /> Sửa
                                                </span>
                                            </button>

                                            <button
                                                onClick={() => toggleActive(svc)}
                                                className={`px-3 py-2 text-xs font-medium hover:opacity-90 ${svc.isActive ? 'text-[var(--danger-700)]' : 'text-[var(--success-600)]'
                                                    }`}
                                                title={svc.isActive ? 'Tắt dịch vụ' : 'Bật dịch vụ'}
                                            >
                                                <span className="inline-flex items-center gap-1.5">
                                                    {svc.isActive ? (
                                                        <ToggleRight className="w-4 h-4" />
                                                    ) : (
                                                        <ToggleLeft className="w-4 h-4" />
                                                    )}
                                                    {svc.isActive ? 'Tắt' : 'Bật'}
                                                </span>
                                            </button>
                                        </div>
                                        <div className="flex-1 grid gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5">

                                            <div className="inline-flex items-center gap-2 text-sm text-[var(--primary)]">
                                                <Package className="w-4 h-4" />
                                                <span className="font-medium">{courseCount}</span>
                                                <span>liệu trình</span>
                                            </div>
                                            <div className="inline-flex items-center gap-2 text-sm text-[var(--primary)]">
                                                <DollarSign className="w-4 h-4" />
                                                <span className="font-medium">{formatCurrency(totalBasePrice)}</span>
                                            </div>
                                            <div className="inline-flex items-center gap-2 text-sm text-[var(--primary)]">
                                                <Users className="w-4 h-4" />
                                                <span className="font-medium">{interest}</span>
                                                <span>quan tâm</span>
                                            </div>
                                            <div className="inline-flex items-center gap-2 text-sm text-[var(--primary)]">
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span className="font-medium">{completed}</span>
                                                <span>đã chốt</span>
                                            </div>
                                            <div className="inline-flex items-center gap-2 text-sm text-[var(--primary)]">
                                                <Star className="w-4 h-4" />
                                                <span className="font-medium">{reviews}</span>
                                                <span>đánh giá</span>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Status (mobile) */}
                                    <div className="mt-3 md:hidden">
                                        {svc.isActive ? (
                                            <span className="inline-flex items-center gap-1 text-[var(--success-600)]">
                                                <BadgeCheck className="w-4 h-4" /> Đang mở
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[var(--danger-700)]">
                                                <CircleX className="w-4 h-4" /> Đang tắt
                                            </span>
                                        )}
                                    </div>
                                </div>



                                {/* Banner (right) */}
                                <div className="relative md:rounded-r-[6px] overflow-hidden bg-[var(--surface-2)] m-2 md:m-0 md:ml-auto w-auto">
                                    <div className="aspect-[16/9] h-full">
                                        {coverUrl ? (
                                            <img
                                                src={coverUrl}
                                                alt={svc.name}
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                                onError={(e) => {
                                                    console.log('❌ Image load error for:', coverUrl);
                                                    console.log('🔄 Trying thumbnail URL format...');
                                                    // Thử thumbnail format cho Google Drive
                                                    if (svc.cover) {
                                                        const thumbUrl = `https://drive.google.com/thumbnail?id=${svc.cover}&sz=w1000`;
                                                        e.target.src = thumbUrl;
                                                    }
                                                }}
                                                onLoad={() => {
                                                    console.log('✅ Image loaded successfully:', coverUrl);
                                                }}
                                            />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center">
                                                <div
                                                    className="w-16 h-16 rounded-full flex items-center justify-center"
                                                    style={{
                                                        background: 'var(--primary-100)',
                                                        border: '1px solid var(--border)',
                                                    }}
                                                >
                                                    <Headset className="w-8 h-8 text-[var(--primary-700)]" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </article>
                    );
                })}

                {!data.length && (
                    <div
                        className="rounded-[6px] border p-10 text-center text-[var(--muted)]"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        Không có dịch vụ nào.
                    </div>
                )}
            </div>

            {/* Create Popup */}
            <Popup
                open={openCreate}
                onClose={() => setOpenCreate(false)}
                header="Thêm dịch vụ"
                widthClass="max-w-3xl"
                footer={
                    <button
                        form="service-editor-form"
                        type="submit"
                        className="rounded-[6px] px-4 py-2 font-medium hover:brightness-110"
                        style={{ background: 'var(--primary-600)', color: 'white' }}
                    >
                        <h6 style={{ color: 'white' }}>Lưu</h6>
                    </button>
                }
            >
                <ServiceEditorForm
                    mode="create"
                    onSubmit={async (payload) => {
                        const res = await act.run(createService, [payload], {
                            successMessage: 'Tạo dịch vụ thành công.',
                        });
                        if (res?.success) {
                            setOpenCreate(false);
                        }
                    }}
                />
            </Popup>

            {/* Edit Popup */}
            <Popup
                open={!!editing}
                onClose={() => setEditing(null)}
                header="Sửa dịch vụ"
                widthClass="max-w-3xl"
                footer={
                    <button
                        form="service-editor-form"
                        type="submit"
                        className="rounded-[6px] px-4 py-2 font-medium hover:brightness-110"
                        style={{ background: 'var(--primary-600)', color: 'white' }}
                    >
                        <h6 style={{ color: 'white' }}>Lưu thay đổi</h6>
                    </button>
                }
            >
                {editing && (
                    <ServiceEditorForm
                        mode="update"
                        initial={editing}
                        onSubmit={async (payload) => {
                            const res = await act.run(updateService, [editing._id, payload], {
                                successMessage: 'Cập nhật dịch vụ thành công.',
                            });
                            if (res?.success) {
                                setEditing(null);
                            }
                        }}
                    />
                )}
            </Popup>
        </div>
    );
}