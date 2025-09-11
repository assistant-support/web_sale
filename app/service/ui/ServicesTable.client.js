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
    ChevronDown,
} from 'lucide-react';
import Popup from '@/components/ui/popup';
import ServiceEditorForm from './ServiceEditorForm.client';
import { useActionFeedback } from '@/hooks/useAction';

export default function ServicesTable({ initialData, actions }) {
    const { createService, updateService, setServiceActive, reloadServices } = actions;

    const [q, setQ] = useState('');
    const [typeFilter, setTypeFilter] = useState('all'); // all | noi_khoa | ngoai_khoa

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

    const TypePill = ({ type }) => (
        <span
            className="inline-flex items-center gap-1 rounded-[999px] border px-2.5 py-1 text-xs"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
            {type === 'noi_khoa' ? <Pill className="w-3.5 h-3.5" /> : <Scissors className="w-3.5 h-3.5" />}
            {type === 'noi_khoa' ? 'Nội khoa' : 'Ngoại khoa'}
        </span>
    ); 

    // build cover URL từ Drive id hoặc giữ nguyên nếu là http(s)/data:
    const coverUrlOf = (cover) => {
        if (!cover) return null;
        if (typeof cover === 'string' && (cover.startsWith('http') || cover.startsWith('data:'))) return cover;
        return `https://lh3.googleusercontent.com/d/${cover}`;
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

                {/* Type filter đặt giữa input & nút Thêm */}
                <TypeSelect value={typeFilter} onChange={setTypeFilter} />

                <button
                    onClick={() => setOpenCreate(true)}
                    className="inline-flex items-center gap-2 cursor-pointer rounded-[6px] px-3 py-2 text-sm font-medium hover:brightness-110"
                    style={{ background: 'var(--main_d)', color: 'white' }}
                >
                    <Plus className="w-4 h-4" />
                    <h5 style={{ color: 'white' }}>Thêm dịch vụ</h5>
                </button>
            </div>

            {/* “Bảng” dạng card — mỗi dòng là một card ngang: content trái, actions giữa, banner phải */}
            <div className="mt-2 space-y-4 flex-1 scroll p-1">
                {data.map((svc) => {
                    const interest = svc.stats?.interest ?? 0;
                    const completed = svc.stats?.completed ?? 0;
                    const reviews = svc.stats?.reviews ?? 0;

                    const coverUrl = coverUrlOf(svc.cover);

                    return (
                        <article
                            key={svc._id}
                            className="rounded-[6px] border bg-[var(--bg-primary)] text-[var(--text)] hover:ring-2 transition-shadow"
                            style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--ring)' }}
                        >
                            {/* Grid row: md = content(1fr) | actions(auto) | banner(260px) */}
                            <div className="grid grid-cols-1 md:[grid-template-columns:1fr_auto_260px]">
                                {/* Content (left) */}
                                <div className="p-4 md:p-5 flex flex-col justify-between">
                                    <div>
                                        <p className="text-[18px] font-semibold leading-tight">{svc.name}</p>
                                        <h5 className="mt-1 text-sm text-[var(--muted)] line-clamp-2">
                                            {svc.description || '—'}
                                        </h5>
                                    </div>

                                    {/* Meta row */}
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        <div className="inline-flex items-center gap-2 text-sm">
                                            <TypePill type={svc.type} />
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

                                {/* Actions (middle) — nhóm nút đẹp hơn */}
                                <div className="hidden md:flex items-end justify-end p-4 md:p-5">
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
                                            className={`px-3 py-2 text-xs font-medium hover:opacity-90
                        ${svc.isActive ? 'text-[var(--danger-700)]' : 'text-[var(--success-600)]'}`}
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
                                </div>

                                {/* Banner (right) */}
                                <div className="relative md:rounded-r-[6px] overflow-hidden bg-[var(--surface-2)] m-2">
                                    <div className="aspect-[16/9]">
                                        {coverUrl ? (
                                            <img
                                                src={coverUrl}
                                                alt={svc.name}
                                                className="h-full w-full object-cover"
                                                loading="lazy"
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

            {/* Create */}
            <Popup
                open={openCreate}
                onClose={() => setOpenCreate(false)}
                header="Thêm dịch vụ"
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

            {/* Edit */}
            <Popup
                open={!!editing}
                onClose={() => setEditing(null)}
                header="Sửa dịch vụ"
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

/* =======================
   Custom Select (Type)
   ======================= */
function TypeSelect({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const items = [
        { value: 'all', label: 'Tất cả loại' },
        { value: 'noi_khoa', label: 'Nội khoa' },
        { value: 'ngoai_khoa', label: 'Ngoại khoa' },
    ];
    const current = items.find((i) => i.value === value) || items[0];

    // close on outside / escape
    useEffect(() => {
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('mousedown', onClick);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onClick);
            window.removeEventListener('keydown', onKey);
        };
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
            >
                <h5>{current.label}</h5>
                <ChevronDown fill='var(--text-primary)' className={` w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown với hiệu ứng trượt */}
            <div
                className={`
          absolute left-0 mt-2 w-[200px] rounded-[6px] border bg-[var(--bg-primary)] shadow-lg overflow-hidden
          transition-all duration-150 ease-out origin-top
          ${open ? 'opacity-100 translate-y-0 scale-y-100 max-h-60' : 'opacity-0 -translate-y-1 scale-y-95 pointer-events-none max-h-0'}
        `}
                style={{ borderColor: 'var(--border)' }}
                role="listbox"
            >
                {items.map((it) => {
                    const active = it.value === value;
                    return (
                        <button
                            key={it.value}
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                                onChange?.(it.value);
                                setOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer
                 ${active ? 'bg-[var(--primary-100)]' : 'hover:bg-[var(--primary-50)]'}
              `}
                        >
                            {it.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
