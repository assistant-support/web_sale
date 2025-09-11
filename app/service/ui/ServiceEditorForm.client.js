'use client';

import { useMemo, useState } from 'react';
import { Headset, Upload } from 'lucide-react';
import { viewUrlFromId } from '@/function/client';

const TYPES = [
    { value: 'noi_khoa', label: 'Nội khoa' },
    { value: 'ngoai_khoa', label: 'Ngoại khoa' },
];

export default function ServiceEditorForm({ mode = 'create', initial, onSubmit }) {
    // Basic
    const [name, setName] = useState(initial?.name || '');
    const [type, setType] = useState(initial?.type || 'noi_khoa');
    const [description, setDescription] = useState(initial?.description || '');
    const [price, setPrice] = useState(Number(initial?.price ?? 0));

    // Cover upload (1 ảnh) + preview
    const [coverPreview, setCoverPreview] = useState(viewUrlFromId(initial?.cover) || '');
    const [coverDataUrl, setCoverDataUrl] = useState(''); // tạm gửi base64 nếu chưa có endpoint upload
    const [uploading, setUploading] = useState(false);

    const canSubmit = useMemo(
        () => name.trim().length > 0 && TYPES.some(t => t.value === type),
        [name, type]
    );

    const onPickFile = (file) => {
        if (!file) return;
        setUploading(true);
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result?.toString() || '';
            setCoverPreview(dataUrl);
            setCoverDataUrl(dataUrl);
            setUploading(false);
        };
        reader.readAsDataURL(file);
    };

    const submit = async (e) => {
        e?.preventDefault?.();
        if (!canSubmit) return;

        const payload = {
            name,
            type,
            description,
            price: Number(price) || 0,
            // Khi có service upload, thay bằng URL trả về
            cover: coverDataUrl || coverPreview || '',
        };
        await onSubmit?.(payload);
    };
    console.log(coverPreview);
    
    return (
        <form id="service-editor-form" onSubmit={submit} className="space-y-5">
            {/* Cover upload + preview */}
            <div className="rounded-[6px] border" style={{ borderColor: 'var(--border)' }}>
                <div className="grid grid-cols-[1fr_220px] md:grid-cols-[1fr_260px]">
                    <div className="p-3">
                        <div
                            className="relative rounded-[6px] overflow-hidden bg-[var(--surface-2)] border"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <div className="aspect-[16/9]">
                                {coverPreview ? (
                                    <img src={coverPreview} alt="cover" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                        <div
                                            className="w-16 h-16 rounded-full flex items-center justify-center"
                                            style={{ background: 'var(--primary-100)', border: '1px solid var(--border)' }}
                                        >
                                            <Headset className="w-8 h-8 text-[var(--primary-700)]" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-3 space-y-2">
                        <label className="text-xs font-medium text-[var(--muted)]">Ảnh nền</label>
                        <label
                            className="flex items-center gap-2 rounded-[6px] border px-3 py-2 cursor-pointer hover:bg-[var(--primary-50)]"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <Upload className="w-4 h-4" />
                            <span className="text-sm">{uploading ? 'Đang xử lý ảnh…' : 'Chọn ảnh từ máy (1 ảnh)'}</span>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => onPickFile(e.target.files?.[0])}
                            />
                        </label>
                        <h6>Chỉ nhận những dạng file hình ảnh như .png, .jpg, .jpeg</h6>
                    </div>
                </div>
            </div>

            {/* Basic fields */}
            <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--muted)]">Tên dịch vụ</label>
                    <input
                        className="w-full rounded-[6px] border px-3 py-2 outline-none focus:ring text-sm"
                        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="VD: Nâng mũi cấu trúc"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--muted)]">Loại</label>
                    <select
                        className="w-full rounded-[6px] border px-3 py-2 outline-none focus:ring text-sm"
                        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                    >
                        {TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--muted)]">Mô tả</label>
                <textarea
                    rows={6}
                    className="w-full rounded-[6px] border px-3 py-2 outline-none focus:ring text-sm"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface)', resize: 'none' }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Mô tả ngắn gọn về dịch vụ"
                />
            </div>
        </form>
    );
}
