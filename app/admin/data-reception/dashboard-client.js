'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import Popup from '@/components/ui/popup';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Users, CheckCircle, AlertTriangle, Clock, History, ChevronDown, Check,
    Phone, Mail, MapPin, User, Tag, Calendar, Link as LinkIcon, RefreshCw,
    ChevronLeft, ChevronRight
} from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

/* ======================= Listbox (Dropdown) ======================= */
function Listbox({ label, options, value, onChange, placeholder = 'Chọn...', buttonClassName = '' }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const listRef = useRef(null);

    const current = useMemo(
        () => options.find(o => o.value === value) || { label: placeholder, value: undefined },
        [options, value, placeholder]
    );

    // Close on outside click
    useEffect(() => {
        function onClickOutside(e) {
            if (!open) return;
            const t = e.target;
            if (btnRef.current && btnRef.current.contains(t)) return;
            if (listRef.current && listRef.current.contains(t)) return;
            setOpen(false);
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    // Keyboard
    const [active, setActive] = useState(-1);
    const handleKeyDown = (e) => {
        if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            setOpen(true);
            setActive(Math.max(0, options.findIndex(o => o.value === value)));
            return;
        }
        if (!open) return;

        if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(prev => (prev + 1) % options.length); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(prev => (prev - 1 + options.length) % options.length); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            const opt = options[active] || options.find(o => o.value === value);
            if (opt) onChange(opt.value);
            setOpen(false);
        }
    };

    return (
        <div className="w-full">
            {label && <label className="block mb-2 text-xs text-muted-foreground">{label}</label>}
            <div className="relative" onKeyDown={handleKeyDown}>
                <button
                    ref={btnRef}
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    onClick={() => setOpen(v => !v)}
                    className={`inline-flex w-full items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-xs ${buttonClassName}`}
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                >
                    <span className="truncate">{current.label}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                    <ul
                        ref={listRef}
                        role="listbox"
                        tabIndex={-1}
                        className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-[6px] border bg-white shadow-sm"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        {options.map((opt, idx) => {
                            const selected = opt.value === value;
                            const isActive = idx === active;
                            const isDisabled = opt.disabled === true;
                            return (
                                <li
                                    key={opt.value ?? `opt-${idx}`}
                                    role="option"
                                    aria-selected={selected}
                                    aria-disabled={isDisabled}
                                    onMouseEnter={() => !isDisabled && setActive(idx)}
                                    onClick={() => { 
                                        if (!isDisabled) {
                                            onChange(opt.value); 
                                            setOpen(false);
                                        }
                                    }}
                                    className={`px-3 py-2 text-xs flex items-center justify-between ${
                                        isDisabled 
                                            ? 'opacity-50 cursor-not-allowed bg-gray-50' 
                                            : `cursor-pointer ${isActive ? 'bg-muted' : 'bg-white'}`
                                    } ${selected ? 'font-medium' : ''}`}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    {selected && <Check className="w-4 h-4" />}
                                </li>
                            );
                        })}
                        {options.length === 0 && (
                            <li className="px-3 py-2 text-xs text-muted-foreground">Không có lựa chọn</li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
}

/* ======================= Sub Components ======================= */

const StatCard = ({ title, value, icon: Icon, description, color }) => (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4" style={{ borderLeftColor: color }}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4" style={{ color }} />
        </CardHeader>
        <CardContent>
            <div className="text-xl font-bold leading-tight">{value}</div>
            <h5 className="text-[10px] text-muted-foreground">{description}</h5>
        </CardContent>
    </Card>
);

const DataQualityChart = ({ valid, invalid, missing }) => {
    const data = {
        labels: ['Hợp lệ (có Zalo)', 'Không hợp lệ (không Zalo)', 'Thiếu thông tin'],
        datasets: [{
            label: 'Chất lượng Data',
            data: [valid, invalid, missing],
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
            borderColor: ['#059669', '#dc2626', '#d97706'],
            borderWidth: 1,
        }],
    };
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10 } },
            title: { display: true, text: 'Tỷ lệ chất lượng Data', font: { size: 14 } },
        },
    };
    return <Doughnut data={data} options={options} />;
};

const SocialMediaDistributionChart = ({ sources }) => {
    // Tạo màu sắc động cho từng platform-page
    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
        '#14b8a6', '#a855f7', '#eab308', '#22c55e', '#3b82f6'
    ];
    
    const labels = sources.map(s => s.name);
    const dataValues = sources.map(s => s.total);
    const backgroundColors = sources.map((_, idx) => colors[idx % colors.length]);
    const borderColors = sources.map((_, idx) => {
        const color = colors[idx % colors.length];
        // Làm tối màu border một chút
        return color;
    });

    const data = {
        labels: labels,
        datasets: [{
            label: 'Số lượng Data',
            data: dataValues,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1,
        }],
    };
    
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'bottom', 
                labels: { 
                    boxWidth: 10,
                    font: { size: 11 },
                    padding: 8,
                } 
            },
            title: { 
                display: true, 
                text: 'Phân bổ Data theo Platform - Page', 
                font: { size: 14 } 
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            }
        },
    };
    
    return <Doughnut data={data} options={options} />;
};

/* ======================= Helpers ======================= */

function hasZalo(customer) {
    const hasUid = Array.isArray(customer.uid) && customer.uid.length > 0 && customer.uid[0]?.uid;
    const noteSuccess = Array.isArray(customer.care) && customer.care.some(
        (n) => /tìm uid zalo/i.test(n.content || '') && /thành công/i.test(n.content || '')
    );
    return !!(hasUid || noteSuccess);
}

function isMissingInfo(customer) {
    return !customer?.name || !customer?.phone;
}

function deriveGroup(customer, serviceMap) {
    const tagTypes = new Set(
        (customer?.tags || [])
            .map((id) => serviceMap.get(String(id))?.type)
            .filter(Boolean)
    );
    if (tagTypes.has('ngoai_khoa')) return 'ngoai_khoa';
    if (tagTypes.has('noi_khoa')) return 'noi_khoa';
    return 'unknown';
}

// Xác định loại khách hàng dựa trên serviceDetails
// - Khách hàng mới: không có bất kỳ serviceDetails nào (chưa có đơn chốt/không có doanh thu liệu trình)
// - Khách hàng cũ: có ít nhất 1 serviceDetails
function isOldCustomer(customer) {
    if (!customer) return false;
    const list = Array.isArray(customer.serviceDetails)
        ? customer.serviceDetails
        : customer.serviceDetails
            ? [customer.serviceDetails]
            : [];
    return list.length > 0;
}

// Helper để lấy source ID từ customer (xử lý cả trường hợp đã populate và chưa populate)
function getCustomerSourceId(customer) {
    if (!customer?.source) return null;
    
    // Nếu source là object (đã populate), lấy _id
    if (typeof customer.source === 'object' && customer.source !== null && !Array.isArray(customer.source)) {
        // Ưu tiên lấy _id nếu có
        if (customer.source._id) {
            return String(customer.source._id);
        }
        // Nếu không có _id, có thể object này chính là ObjectId (sau serialize)
        // Thử convert toàn bộ object sang string
        try {
            return String(customer.source);
        } catch {
            return null;
        }
    }
    
    // Nếu source là ObjectId hoặc string (chưa populate), convert sang string
    return String(customer.source);
}

const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

const currency = (v) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v || 0);

const prettyStatus = (raw) => {
    if (!raw) return { text: 'Không rõ', color: 'bg-slate-200 text-slate-700' };
    const key = raw.toLowerCase();
    if (key.includes('valid')) return { text: 'Hợp lệ', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' };
    if (key.includes('invalid')) return { text: 'Không hợp lệ', color: 'bg-rose-100 text-rose-700 border border-rose-200' };
    if (key.includes('msg_success')) return { text: 'Đã gửi Zalo', color: 'bg-sky-100 text-sky-700 border border-sky-200' };
    if (key.includes('duplicate_merged')) return { text: 'Đã gộp trùng', color: 'bg-slate-100 text-slate-700 border border-slate-200' };
    if (key.includes('noikhoa')) return { text: 'Nội khoa', color: 'bg-indigo-100 text-indigo-700 border border-indigo-200' };
    // da liễu thuộc sale nội khoa
    if (key.includes('ngoaikhoa')) return { text: 'Ngoại khoa', color: 'bg-violet-100 text-violet-700 border border-violet-200' };
    if (key.includes('scheduled')) return { text: 'Đã đặt lịch', color: 'bg-amber-100 text-amber-700 border border-amber-200' };
    if (key.includes('canceled')) return { text: 'Hủy lịch', color: 'bg-rose-100 text-rose-700 border border-rose-200' };
    if (key.includes('serviced_completed')) return { text: 'Hoàn tất dịch vụ', color: 'bg-green-100 text-green-700 border border-green-200' };
    if (key.includes('serviced_in_progress')) return { text: 'Đang làm dịch vụ', color: 'bg-blue-100 text-blue-700 border border-blue-200' };
    if (key.includes('new_unconfirmed')) return { text: 'Mới (chưa xác nhận)', color: 'bg-zinc-100 text-zinc-700 border border-zinc-200' };
    return { text: raw.replaceAll('_', ' '), color: 'bg-slate-100 text-slate-700 border border-slate-200' };
};

const serviceStatusColor = (s) => {
    const key = (s || '').toLowerCase();
    if (key === 'completed') return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    if (key === 'in_progress') return 'bg-blue-100 text-blue-700 border border-blue-200';
    return 'bg-zinc-100 text-zinc-700 border border-zinc-200';
};

const qualityBadge = (customer) => {
    if (isMissingInfo(customer)) return { text: 'Thiếu thông tin', className: 'bg-amber-100 text-amber-700 border border-amber-200' };
    if (hasZalo(customer)) return { text: 'Data hợp lệ', className: 'bg-emerald-100 text-emerald-700 border border-emerald-200' };
    return { text: 'Không có Zalo', className: 'bg-rose-100 text-rose-700 border border-rose-200' };
};

const lastPipeline = (customer) => {
    const arr = Array.isArray(customer?.pipelineStatus) ? customer.pipelineStatus : [];
    const last = [...arr].reverse().find(Boolean);
    return last || null;
};

/* ======================= Popup Content ======================= */

function Line({ icon: Icon, label, value, mono = false }) {
    return (
        <div className="flex items-start gap-2 py-1">
            <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
            <div className="min-w-[92px] text-[11px] text-muted-foreground">{label}</div>
            <div className={`text-[12px] leading-5 ${mono ? 'font-medium' : ''}`}>{value || <span className="text-muted-foreground">—</span>}</div>
        </div>
    );
}

function Chips({ customer, serviceMap }) {
    const q = qualityBadge(customer);
    const lp = lastPipeline(customer);
    const g = deriveGroup(customer, serviceMap);
    return (
        <div className="flex flex-wrap gap-1.5">
            <span className={`px-2 py-0.5 rounded text-[10px] ${q.className}`}>{q.text}</span>
            {lp && <span className={`px-2 py-0.5 rounded text-[10px] ${prettyStatus(lp).color}`}>{prettyStatus(lp).text}</span>}
            {g !== 'unknown' && (
                <span className={`px-2 py-0.5 rounded text-[10px] ${g === 'noi_khoa' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-violet-100 text-violet-700 border border-violet-200'}`}>
                    {g === 'noi_khoa' ? 'Nội khoa' : 'Ngoại khoa'}
                </span>
            )}
            <span className={`px-2 py-0.5 rounded text-[10px] ${serviceStatusColor(customer?.serviceDetails?.status)}`}>
                Dịch vụ: {customer?.serviceDetails?.status ? customer.serviceDetails.status.replaceAll('_', ' ') : '—'}
            </span>
        </div>
    );
}

function CustomerPopup({ open, onClose, customer, serviceMap }) {
    if (!customer) return null;

    const tags = (customer.tags || [])
        .map((id) => serviceMap.get(String(id))?.name)
        .filter(Boolean);

    const zalo = customer?.uid?.[0];
    const last3Care = (customer?.care || []).slice(-3).reverse();

    const header = (
        <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0">
                {customer.zaloavt ? (
                    <img src={customer.zaloavt} alt={customer.name} className="w-full h-full object-cover" />
                ) : null}
            </div>
            <div className="min-w-0">
                <div className="truncate">{customer.name || 'Khách hàng'}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                    {customer.source?.name || '—'} • {new Date(customer.createAt).toLocaleString('vi-VN')}
                </div>
            </div>
        </div>
    );

    return (
        <Popup open={open} onClose={onClose} header={header} widthClass="max-w-md">
            <Chips customer={customer} serviceMap={serviceMap} />

            <div className="grid grid-cols-1 gap-2 rounded-md border p-2 bg-white mt-3" style={{ borderColor: 'var(--border)' }}>
                <Line icon={User} label="Tên KH" value={customer.name} />
                <Line icon={Phone} label="Số điện thoại" value={customer.phone} mono />
                <Line icon={Mail} label="Email" value={customer.email} mono />
                <Line icon={MapPin} label="Khu vực" value={customer.area} />
                <Line icon={Calendar} label="Tiếp nhận" value={new Date(customer.createAt).toLocaleString('vi-VN')} />
                <Line
                    icon={Tag}
                    label="Dịch vụ quan tâm"
                    value={tags.length ? (
                        <div className="flex flex-wrap gap-1">
                            {tags.map((t, i) => (
                                <span key={t + i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] border border-slate-200">
                                    {t}
                                </span>
                            ))}
                        </div>
                    ) : '—'}
                />
            </div>

            <div className="rounded-md border p-2 bg-white mt-3" style={{ borderColor: 'var(--border)' }}>
                <div className="text-[11px] text-muted-foreground mb-1">Hoạt động gần đây</div>
                {last3Care.length ? (
                    <ul className="space-y-1">
                        {last3Care.map((c) => (
                            <li key={c._id} className="text-[12px] leading-5">
                                <span className="text-[11px] text-muted-foreground">{new Date(c.createAt).toLocaleString('vi-VN')}</span>
                                <span className="mx-1.5 text-muted-foreground">•</span>
                                <span>{c.content}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-[12px] text-muted-foreground">Chưa có hoạt động.</div>
                )}
            </div>
        </Popup>
    );
}

/* ======================= Log Table (clickable rows) ======================= */

function ReceptionLogTable({ logs, visibleCount, onReachEnd, onRowClick }) {
    const containerRef = useRef(null);
    const rows = logs.slice(0, visibleCount);

    const handleScroll = (e) => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) onReachEnd?.();
    };

    return (
        <Card className="shadow-lg col-span-1 lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center text-sm"><History className="mr-2 h-4 w-4" />Log Tiếp nhận Data</CardTitle>
                <CardDescription className="text-xs">Danh sách data được ghi nhận vào hệ thống gần đây nhất.</CardDescription>
            </CardHeader>
            <CardContent>
                <div
                    ref={containerRef}
                    className="max-h-[400px] overflow-y-auto"
                    onScroll={handleScroll}
                >
                    <Table>
                        <TableHeader className="sticky top-0 bg-secondary/60 backdrop-blur supports-[backdrop-filter]:bg-secondary/50">
                            <TableRow>
                                <TableHead className="text-xs">Khách hàng</TableHead>
                                <TableHead className="text-xs">Nguồn</TableHead>
                                <TableHead className="text-right text-xs">Thời gian</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length > 0 ? rows.map((log) => (
                                <TableRow
                                    key={log.id}
                                    onClick={() => onRowClick(log.id)}
                                    className="cursor-pointer hover:bg-muted/60"
                                >
                                    <TableCell className="font-medium text-[12px]">{log.customerName}</TableCell>
                                    <TableCell className="text-[12px]"><Badge variant="outline" className="text-[10px]">{log.source}</Badge></TableCell>
                                    <TableCell className="text-right text-[11px] text-muted-foreground">{new Date(log.createdAt).toLocaleString('vi-VN')}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm">Chưa có dữ liệu.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                    {visibleCount < logs.length && (
                        <div className="flex justify-center py-3">
                            <button
                                className="text-xs px-3 py-1.5 rounded-[6px] border"
                                style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                                onClick={() => onReachEnd?.()}
                            >
                                Tải thêm
                            </button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

/* ======================= Main Component ======================= */

export default function DataReceptionClient({ initialData, service = [], sources = [], messageSources = [] }) {
    const [data] = useState(initialData);
    // Tab state
    const [activeTab, setActiveTab] = useState('data'); // 'data' | 'social' | 'source'
    
    // Filters
    const [groupFilter, setGroupFilter] = useState('all'); // all | noi_khoa | ngoai_khoa
    const [tagFilter, setTagFilter] = useState('all');     // 'all' | service.name
    const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | source._id
    const [customerTypeFilter, setCustomerTypeFilter] = useState('all'); // all | new | old
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState(() => {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        return toYMD(d);
    }); // YYYY-MM-DD

    // Infinite scroll for log
    const [visibleCount, setVisibleCount] = useState(10);
    const handleReachEnd = useCallback(() => setVisibleCount(c => c + 10), []);

    // Slider state for cards (8 cards per page)
    const [socialPage, setSocialPage] = useState(0);
    const [sourcePage, setSourcePage] = useState(0);

    const serviceMap = useMemo(() => {
        const m = new Map();
        (service || []).forEach(s => m.set(String(s._id), s));
        return m;
    }, [service]);

    // Options for listboxes
    const groupOptions = useMemo(() => ([
        { value: 'all', label: 'Tất cả' },
        { value: 'noi_khoa', label: 'Nội khoa' },
        { value: 'ngoai_khoa', label: 'Ngoại khoa' },
        { value: 'da_lieu', label: 'Da liễu' },
    ]), []);

    const tagOptions = useMemo(() => ([
        { value: 'all', label: 'Tất cả dịch vụ' },
        ...(service || []).map(s => ({ value: s.name, label: s.name }))
    ]), [service]);

    const customerTypeOptions = useMemo(() => ([
        { value: 'all', label: 'Tất cả loại KH' },
        { value: 'new', label: 'Khách hàng mới (chưa có đơn chốt)' },
        { value: 'old', label: 'Khách hàng cũ (đã có đơn chốt)' },
    ]), []);

    const sourceOptions = useMemo(() => {
        const allOption = { value: 'all', label: 'Tất cả nguồn' };
        const regularSources = (sources || []).map(s => ({ 
            value: s._id, 
            label: s.name,
            disabled: activeTab === 'social' // Disable nếu đang ở tab social
        }));
        const messageSourcesOptions = (messageSources || []).map(s => ({ 
            value: s._id, 
            label: s.name,
            disabled: false // Luôn enable messageSources
        }));
        
        return [allOption, ...regularSources, ...messageSourcesOptions];
    }, [sources, messageSources, activeTab]);

    // Map để xác định sourceFilter có phải là messageSource không
    const messageSourceIds = useMemo(() => {
        return new Set((messageSources || []).map(s => String(s._id)));
    }, [messageSources]);

    const filteredData = useMemo(() => {
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59.999') : null;

        return (data || []).filter(c => {
            const ct = new Date(c.createAt);
            if (start && ct < start) return false;
            if (end && ct > end) return false;

            const g = deriveGroup(c, serviceMap);
            if (groupFilter !== 'all' && g !== groupFilter) return false;

            if (tagFilter !== 'all') {
                const tagNames = (c.tags || [])
                    .map(id => serviceMap.get(String(id))?.name)
                    .filter(Boolean);
                if (!tagNames.includes(tagFilter)) return false;
            }

            // Lọc theo loại khách hàng (mới/cũ) dựa trên serviceDetails
            if (customerTypeFilter !== 'all') {
                const old = isOldCustomer(c);
                if (customerTypeFilter === 'new' && old) return false;
                if (customerTypeFilter === 'old' && !old) return false;
            }

            if (sourceFilter !== 'all') {
                const isMessageSource = messageSourceIds.has(String(sourceFilter));
                
                if (isMessageSource) {
                    // Nếu là messageSource, so sánh với sourceDetails
                    const customerSourceDetails = c.sourceDetails ? String(c.sourceDetails).trim() : '';
                    if (customerSourceDetails !== String(sourceFilter).trim()) return false;
                } else {
                    // Nếu là source thường, so sánh với source ID
                    // Nếu đang ở tab social, bỏ qua các source thường
                    if (activeTab === 'social') return false;
                    const customerSourceId = getCustomerSourceId(c);
                    if (!customerSourceId || customerSourceId !== String(sourceFilter)) return false;
                }
            }
            return true;
        });
    }, [data, startDate, endDate, groupFilter, tagFilter, sourceFilter, customerTypeFilter, serviceMap, messageSourceIds, activeTab]);

    // Filter data for social media tab (messageSources only)
    const filteredSocialData = useMemo(() => {
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59.999') : null;

        return (data || []).filter(c => {
            const ct = new Date(c.createAt);
            if (start && ct < start) return false;
            if (end && ct > end) return false;

            // Chỉ lấy data có sourceDetails là messageSource
            const customerSourceDetails = c.sourceDetails ? String(c.sourceDetails).trim() : '';
            if (!customerSourceDetails) return false;
            
            // Kiểm tra xem sourceDetails có phải là messageSource không
            const isMessageSource = messageSourceIds.has(customerSourceDetails);
            if (!isMessageSource) return false;

            // Áp dụng các filter khác
            const g = deriveGroup(c, serviceMap);
            if (groupFilter !== 'all' && g !== groupFilter) return false;

            if (tagFilter !== 'all') {
                const tagNames = (c.tags || [])
                    .map(id => serviceMap.get(String(id))?.name)
                    .filter(Boolean);
                if (!tagNames.includes(tagFilter)) return false;
            }

            // Lọc theo loại khách hàng (mới/cũ)
            if (customerTypeFilter !== 'all') {
                const old = isOldCustomer(c);
                if (customerTypeFilter === 'new' && old) return false;
                if (customerTypeFilter === 'old' && !old) return false;
            }

            return true;
        });
    }, [data, startDate, endDate, groupFilter, tagFilter, customerTypeFilter, serviceMap, messageSourceIds]);

    // Stats for each messageSource
    const socialStats = useMemo(() => {
        const statsBySource = new Map();
        
        // Tính tổng cho tất cả messageSources
        let totalAll = 0;
        let validAll = 0;
        let invalidAll = 0;
        let missingAll = 0;

        for (const msgSource of messageSources || []) {
            const sourceId = String(msgSource._id);
            const sourceData = filteredSocialData.filter(c => {
                const customerSourceDetails = c.sourceDetails ? String(c.sourceDetails).trim() : '';
                return customerSourceDetails === sourceId;
            });

            let validCount = 0;
            let invalidCount = 0;
            let missingCount = 0;

            for (const c of sourceData) {
                const missing = isMissingInfo(c);
                const zalo = hasZalo(c);

                if (missing) {
                    missingCount++;
                } else if (zalo) {
                    validCount++;
                } else {
                    invalidCount++;
                }
            }

            const total = sourceData.length;
            const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

            // Parse name để lấy "{Platform} - {Page Name}"
            const fullName = msgSource.name || '';
            const displayName = fullName.startsWith('Tin nhắn - ') 
                ? fullName.replace('Tin nhắn - ', '') 
                : fullName;

            statsBySource.set(sourceId, {
                name: displayName,
                total,
                valid: validCount,
                validPct: pct(validCount),
                invalid: invalidCount,
                invalidPct: pct(invalidCount),
                missing: missingCount,
                missingPct: pct(missingCount),
            });

            totalAll += total;
            validAll += validCount;
            invalidAll += invalidCount;
            missingAll += missingCount;
        }

        const pctAll = (n) => totalAll > 0 ? Math.round((n / totalAll) * 100) : 0;

        return {
            total: {
                total: totalAll,
                valid: validAll,
                validPct: pctAll(validAll),
                invalid: invalidAll,
                invalidPct: pctAll(invalidAll),
                missing: missingAll,
                missingPct: pctAll(missingAll),
            },
            bySource: Array.from(statsBySource.values()).sort((a, b) => b.total - a.total),
        };
    }, [filteredSocialData, messageSources]);

    // Social media reception log
    const socialReceptionLog = useMemo(() => {
        return filteredSocialData.map(customer => {
            const missing = isMissingInfo(customer);
            const zalo = hasZalo(customer);

            // Parse sourceDetails để hiển thị
            const sourceDetails = customer.sourceDetails ? String(customer.sourceDetails).trim() : '';
            const displaySource = sourceDetails.startsWith('Tin nhắn - ')
                ? sourceDetails.replace('Tin nhắn - ', '')
                : sourceDetails;

            return {
                id: customer._id,
                customerName: customer.name || 'N/A',
                source: displaySource || 'N/A',
                createdAt: customer.createAt,
            };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [filteredSocialData]);

    // Filter data for source performance tab (all sources: sources + messageSources)
    const filteredSourceData = useMemo(() => {
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59.999') : null;

        return (data || []).filter(c => {
            const ct = new Date(c.createAt);
            if (start && ct < start) return false;
            if (end && ct > end) return false;

            // Áp dụng các filter khác
            const g = deriveGroup(c, serviceMap);
            if (groupFilter !== 'all' && g !== groupFilter) return false;

            if (tagFilter !== 'all') {
                const tagNames = (c.tags || [])
                    .map(id => serviceMap.get(String(id))?.name)
                    .filter(Boolean);
                if (!tagNames.includes(tagFilter)) return false;
            }

            // Lọc theo loại khách hàng (mới/cũ)
            if (customerTypeFilter !== 'all') {
                const old = isOldCustomer(c);
                if (customerTypeFilter === 'new' && old) return false;
                if (customerTypeFilter === 'old' && !old) return false;
            }

            // Áp dụng filter theo sourceFilter
            if (sourceFilter !== 'all') {
                const isMessageSource = messageSourceIds.has(String(sourceFilter));
                
                if (isMessageSource) {
                    // Nếu là messageSource, so sánh với sourceDetails
                    const customerSourceDetails = c.sourceDetails ? String(c.sourceDetails).trim() : '';
                    if (customerSourceDetails !== String(sourceFilter).trim()) return false;
                } else {
                    // Nếu là source thường, so sánh với source ID
                    const customerSourceId = getCustomerSourceId(c);
                    if (!customerSourceId || customerSourceId !== String(sourceFilter)) return false;
                }
            }

            return true;
        });
    }, [data, startDate, endDate, groupFilter, tagFilter, sourceFilter, customerTypeFilter, serviceMap, messageSourceIds]);

    // Stats for all sources (sources + messageSources)
    const sourceStats = useMemo(() => {
        const statsBySource = new Map();
        
        // Tính tổng cho tất cả sources
        let totalAll = 0;

        // Xử lý sources thường
        for (const source of sources || []) {
            const sourceId = String(source._id);
            const sourceData = filteredSourceData.filter(c => {
                const customerSourceId = getCustomerSourceId(c);
                return customerSourceId === sourceId;
            });

            const total = sourceData.length;
            const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

            statsBySource.set(sourceId, {
                name: source.name || 'N/A',
                total,
            });

            totalAll += total;
        }

        // Xử lý messageSources
        for (const msgSource of messageSources || []) {
            const sourceId = String(msgSource._id);
            const sourceData = filteredSourceData.filter(c => {
                const customerSourceDetails = c.sourceDetails ? String(c.sourceDetails).trim() : '';
                return customerSourceDetails === sourceId;
            });

            const total = sourceData.length;
            const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

            // Parse name để lấy "{Platform} - {Page Name}"
            const fullName = msgSource.name || '';
            const displayName = fullName.startsWith('Tin nhắn - ') 
                ? fullName.replace('Tin nhắn - ', '') 
                : fullName;

            statsBySource.set(sourceId, {
                name: displayName,
                total,
            });

            totalAll += total;
        }

        return {
            total: {
                total: totalAll,
            },
            bySource: Array.from(statsBySource.values()).sort((a, b) => b.total - a.total),
        };
    }, [filteredSourceData, sources, messageSources]);

    // Source reception log (all sources)
    const sourceReceptionLog = useMemo(() => {
        return filteredSourceData.map(customer => {
            // Xác định source name để hiển thị
            let displaySource = 'N/A';
            
            // Kiểm tra xem có phải messageSource không
            const customerSourceDetails = customer.sourceDetails ? String(customer.sourceDetails).trim() : '';
            const isMessageSource = messageSourceIds.has(customerSourceDetails);
            
            if (isMessageSource) {
                // Nếu là messageSource, parse sourceDetails
                displaySource = customerSourceDetails.startsWith('Tin nhắn - ')
                    ? customerSourceDetails.replace('Tin nhắn - ', '')
                    : customerSourceDetails;
            } else {
                // Nếu là source thường, lấy từ customer.source
                displaySource = customer.source?.name || 'N/A';
            }

            return {
                id: customer._id,
                customerName: customer.name || 'N/A',
                source: displaySource,
                createdAt: customer.createAt,
            };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [filteredSourceData, messageSourceIds]);

    const { stats, receptionLog } = useMemo(() => {
        let validCount = 0;
        let invalidCount = 0;
        let missingInfoCount = 0;
        let totalResponseTime = 0;
        let leadsWithResponse = 0;

        const log = filteredData.map(customer => {
            const missing = isMissingInfo(customer);
            const zalo = hasZalo(customer);

            if (missing) {
                missingInfoCount++;
            } else if (zalo) {
                validCount++;
            } else {
                invalidCount++;
            }

            if (Array.isArray(customer.care) && customer.care.length > 1) {
                const createTime = new Date(customer.createAt).getTime();
                const firstActionTime = new Date(customer.care[1].createAt).getTime();
                totalResponseTime += (firstActionTime - createTime);
                leadsWithResponse++;
            }

            return {
                id: customer._id,
                customerName: customer.name || 'N/A',
                source: customer.source?.name || 'N/A',
                createdAt: customer.createAt,
            };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = filteredData.length;
        const avgResponseTime = leadsWithResponse > 0
            ? (totalResponseTime / leadsWithResponse / 1000)
            : 0;

        const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

        return {
            stats: {
                total,
                totalPct: total > 0 ? 100 : 0,
                valid: validCount,
                validPct: pct(validCount),
                invalid: invalidCount,
                invalidPct: pct(invalidCount),
                missing: missingInfoCount,
                missingPct: pct(missingInfoCount),
                avgResponseTime: avgResponseTime.toFixed(2) + ' giây',
                responded: leadsWithResponse,
                respondedPct: pct(leadsWithResponse), // % số data có phản hồi đầu tiên
            },
            receptionLog: log
        };
    }, [filteredData]);

    // Reset paging when filters change
    useEffect(() => { setVisibleCount(10); }, [groupFilter, tagFilter, sourceFilter, customerTypeFilter, startDate, endDate]);
    
    // Reset paging and sourceFilter when tab changes
    useEffect(() => { 
        setVisibleCount(10);
        // Reset slider pages when switching tabs
        setSocialPage(0);
        setSourcePage(0);
        // Nếu chuyển sang tab social và đang chọn source không phải messageSource, reset về 'all'
        if (activeTab === 'social' && sourceFilter !== 'all') {
            const isMessageSource = messageSourceIds.has(String(sourceFilter));
            if (!isMessageSource) {
                setSourceFilter('all');
            }
        }
    }, [activeTab, sourceFilter, messageSourceIds]);

    // Popup state
    const [open, setOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const onRowClick = (id) => {
        const found = (data || []).find(c => c._id === id) || null;
        setSelectedCustomer(found);
        setOpen(true);
    };

    return (
        <div className="flex-1 space-y-4 py-4 pt-6 min-h-screen">

            {/* ====== Filters ====== */}
            <Card className="shadow-md">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="text-sm">Lọc theo nhóm, dịch vụ quan tâm và khoảng thời gian tiếp nhận.</CardTitle>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setGroupFilter('all');
                            setTagFilter('all');
                            setSourceFilter('all');
                            setCustomerTypeFilter('all');
                            const d2 = new Date(); d2.setHours(0, 0, 0, 0);
                            setStartDate('');
                            setEndDate(toYMD(d2));
                        }}
                        className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                    >
                        <RefreshCw className="w-4 h-4" /> Đặt lại bộ lọc
                    </button>
                </CardHeader>

                <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
                    <Listbox
                        label="Nhóm (Group)"
                        options={groupOptions}
                        value={groupFilter}
                        onChange={setGroupFilter}
                    />

                    <Listbox
                        label="Dịch vụ quan tâm (Tag)"
                        options={tagOptions}
                        value={tagFilter}
                        onChange={setTagFilter}
                    />

                    <Listbox
                        label="Loại khách hàng"
                        options={customerTypeOptions}
                        value={customerTypeFilter}
                        onChange={setCustomerTypeFilter}
                    />

                    <Listbox
                        label="Nguồn (Source)"
                        options={sourceOptions}
                        value={sourceFilter}
                        onChange={setSourceFilter}
                    />

                    <div>
                        <label className="block mb-2 text-xs text-muted-foreground">Từ ngày</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full rounded-[6px] border px-3 py-2 text-xs"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>

                    <div>
                        <label className="block mb-2 text-xs text-muted-foreground">Đến ngày</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full rounded-[6px] border px-3 py-2 text-xs"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* ====== Tabs ====== */}
            <Card className="shadow-md">
                <CardHeader className="pb-3">
                    <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
                        <button
                            type="button"
                            onClick={() => setActiveTab('data')}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                                activeTab === 'data'
                                    ? 'border-b-2 text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                            style={activeTab === 'data' ? { borderBottomColor: 'var(--primary)' } : {}}
                        >
                            Hiệu suất data
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('social')}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                                activeTab === 'social'
                                    ? 'border-b-2 text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                            style={activeTab === 'social' ? { borderBottomColor: 'var(--primary)' } : {}}
                        >
                            Hiệu suất social media
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('source')}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                                activeTab === 'source'
                                    ? 'border-b-2 text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                            style={activeTab === 'source' ? { borderBottomColor: 'var(--primary)' } : {}}
                        >
                            Hiệu suất nguồn
                        </button>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    {activeTab === 'data' && (
                        <>
                            {/* ====== Stats (hiển thị "số (tỷ lệ%)") ====== */}
                            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 mb-6">
                                <StatCard
                                    title="Tổng Data"
                                    value={`${stats.total} (${stats.totalPct}%)`}
                                    icon={Users}
                                    description="Tổng data theo bộ lọc"
                                    color="#3b82f6"
                                />
                                <StatCard
                                    title="Data Hợp lệ"
                                    value={`${stats.valid} (${stats.validPct}%)`}
                                    icon={CheckCircle}
                                    description="Có Zalo (UID) hoặc tìm UID thành công"
                                    color="#10b981"
                                />
                                <StatCard
                                    title="Data Không hợp lệ"
                                    value={`${stats.invalid} (${stats.invalidPct}%)`}
                                    icon={AlertTriangle}
                                    description="Không tìm thấy Zalo (không có UID)"
                                    color="#ef4444"
                                />
                                <StatCard
                                    title="T.gian P.hồi TB"
                                    value={`${stats.avgResponseTime}`}
                                    icon={Clock}
                                    description="Tỷ lệ có phản hồi đầu tiên & thời gian trung bình"
                                    color="#8b5cf6"
                                />
                            </div>

                            {/* ====== Chart + Log ====== */}
                            <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                                <Card className="shadow-lg lg:col-span-1">
                                    <CardHeader>
                                        <CardTitle className="text-sm">Chất lượng Data</CardTitle>
                                        <CardDescription className="text-xs">Tỷ lệ hợp lệ, không hợp lệ và thiếu thông tin.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-[340px] sm:h-[380px] relative">
                                        <DataQualityChart valid={stats.valid} invalid={stats.invalid} missing={stats.missing} />
                                    </CardContent>
                                </Card>

                                <ReceptionLogTable
                                    logs={receptionLog}
                                    visibleCount={visibleCount}
                                    onReachEnd={() => {
                                        if (visibleCount < receptionLog.length) handleReachEnd();
                                    }}
                                    onRowClick={onRowClick}
                                />
                            </div>
                        </>
                    )}

                    {activeTab === 'social' && (
                        <>
                            {/* ====== Stats Cards ====== */}
                            <div className="mb-6">
                                {/* Card Tổng Data */}
                                <div className="mb-4">
                                    <StatCard
                                        title="Tổng Data"
                                        value={`${socialStats.total.total}`}
                                        icon={Users}
                                        description="Tổng data từ form Tin nhắn"
                                        color="#3b82f6"
                                    />
                                </div>

                                {/* Cards cho từng messageSource */}
                                {socialStats.bySource.length > 0 ? (() => {
                                    const cardsPerPage = 8;
                                    const totalPages = Math.ceil(socialStats.bySource.length / cardsPerPage);
                                    const startIdx = socialPage * cardsPerPage;
                                    const endIdx = startIdx + cardsPerPage;
                                    const currentCards = socialStats.bySource.slice(startIdx, endIdx);
                                    const showSlider = socialStats.bySource.length > cardsPerPage;

                                    return (
                                        <div className="relative">
                                            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
                                                {currentCards.map((sourceStat, idx) => (
                                                    <StatCard
                                                        key={startIdx + idx}
                                                        title={sourceStat.name}
                                                        value={`${sourceStat.total}`}
                                                        icon={Users}
                                                        description={`Hợp lệ: ${sourceStat.valid} (${sourceStat.validPct}%)`}
                                                        color="#10b981"
                                                    />
                                                ))}
                                            </div>
                                            {showSlider && (
                                                <div className="flex items-center justify-between mt-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSocialPage(p => Math.max(0, p - 1))}
                                                        disabled={socialPage === 0}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-[6px] border text-sm ${
                                                            socialPage === 0 
                                                                ? 'opacity-50 cursor-not-allowed' 
                                                                : 'cursor-pointer hover:bg-muted'
                                                        }`}
                                                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                                                    >
                                                        <ChevronLeft className="w-4 h-4" />
                                                        Trước
                                                    </button>
                                                    <span className="text-sm text-muted-foreground">
                                                        Trang {socialPage + 1} / {totalPages}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSocialPage(p => Math.min(totalPages - 1, p + 1))}
                                                        disabled={socialPage === totalPages - 1}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-[6px] border text-sm ${
                                                            socialPage === totalPages - 1 
                                                                ? 'opacity-50 cursor-not-allowed' 
                                                                : 'cursor-pointer hover:bg-muted'
                                                        }`}
                                                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                                                    >
                                                        Sau
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })() : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <p>Chưa có dữ liệu từ nguồn tin nhắn</p>
                                    </div>
                                )}
                            </div>

                            {/* ====== Chart + Log ====== */}
                            {socialStats.total.total > 0 && (
                                <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                                    <Card className="shadow-lg lg:col-span-1">
                                        <CardHeader>
                                            <CardTitle className="text-sm">Phân bổ Data</CardTitle>
                                            <CardDescription className="text-xs">Tỷ lệ data theo từng Platform - Page Name từ nguồn tin nhắn.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="h-[340px] sm:h-[380px] relative">
                                            {socialStats.bySource.length > 0 ? (
                                                <SocialMediaDistributionChart sources={socialStats.bySource} />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                                    Chưa có dữ liệu
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <ReceptionLogTable
                                        logs={socialReceptionLog}
                                        visibleCount={visibleCount}
                                        onReachEnd={() => {
                                            if (visibleCount < socialReceptionLog.length) handleReachEnd();
                                        }}
                                        onRowClick={onRowClick}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'source' && (
                        <>
                            {/* ====== Stats Cards ====== */}
                            <div className="mb-6">
                                {/* Card Tổng Data */}
                                <div className="mb-4">
                                    <StatCard
                                        title="Tổng Data"
                                        value={`${sourceStats.total.total}`}
                                        icon={Users}
                                        description="Tổng data từ tất cả các nguồn"
                                        color="#3b82f6"
                                    />
                                </div>

                                {/* Cards cho từng source */}
                                {sourceStats.bySource.length > 0 ? (() => {
                                    const cardsPerPage = 8;
                                    const totalPages = Math.ceil(sourceStats.bySource.length / cardsPerPage);
                                    const startIdx = sourcePage * cardsPerPage;
                                    const endIdx = startIdx + cardsPerPage;
                                    const currentCards = sourceStats.bySource.slice(startIdx, endIdx);
                                    const showSlider = sourceStats.bySource.length > cardsPerPage;

                                    return (
                                        <div className="relative">
                                            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
                                                {currentCards.map((sourceStat, idx) => (
                                                    <StatCard
                                                        key={startIdx + idx}
                                                        title={sourceStat.name}
                                                        value={`${sourceStat.total}`}
                                                        icon={Users}
                                                        description={`Tổng số data từ nguồn này`}
                                                        color="#10b981"
                                                    />
                                                ))}
                                            </div>
                                            {showSlider && (
                                                <div className="flex items-center justify-between mt-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSourcePage(p => Math.max(0, p - 1))}
                                                        disabled={sourcePage === 0}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-[6px] border text-sm ${
                                                            sourcePage === 0 
                                                                ? 'opacity-50 cursor-not-allowed' 
                                                                : 'cursor-pointer hover:bg-muted'
                                                        }`}
                                                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                                                    >
                                                        <ChevronLeft className="w-4 h-4" />
                                                        Trước
                                                    </button>
                                                    <span className="text-sm text-muted-foreground">
                                                        Trang {sourcePage + 1} / {totalPages}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSourcePage(p => Math.min(totalPages - 1, p + 1))}
                                                        disabled={sourcePage === totalPages - 1}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-[6px] border text-sm ${
                                                            sourcePage === totalPages - 1 
                                                                ? 'opacity-50 cursor-not-allowed' 
                                                                : 'cursor-pointer hover:bg-muted'
                                                        }`}
                                                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                                                    >
                                                        Sau
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })() : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <p>Chưa có dữ liệu từ các nguồn</p>
                                    </div>
                                )}
                            </div>

                            {/* ====== Chart + Log ====== */}
                            {sourceStats.total.total > 0 && (
                                <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                                    <Card className="shadow-lg lg:col-span-1">
                                        <CardHeader>
                                            <CardTitle className="text-sm">Phân bổ Data</CardTitle>
                                            <CardDescription className="text-xs">Tỷ lệ data theo từng nguồn (tất cả các nguồn).</CardDescription>
                                        </CardHeader>
                                        <CardContent className="h-[340px] sm:h-[380px] relative">
                                            {sourceStats.bySource.length > 0 ? (
                                                <SocialMediaDistributionChart sources={sourceStats.bySource} />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                                    Chưa có dữ liệu
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <ReceptionLogTable
                                        logs={sourceReceptionLog}
                                        visibleCount={visibleCount}
                                        onReachEnd={() => {
                                            if (visibleCount < sourceReceptionLog.length) handleReachEnd();
                                        }}
                                        onRowClick={onRowClick}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* ====== Popup ====== */}
            <CustomerPopup
                open={open}
                onClose={() => setOpen(false)}
                customer={selectedCustomer}
                serviceMap={serviceMap}
            />
        </div>
    );
}
