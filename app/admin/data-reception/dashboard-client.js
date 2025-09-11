'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle, AlertTriangle, Clock, History, ChevronDown, Check } from 'lucide-react';

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
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(prev => (prev + 1) % options.length);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(prev => (prev - 1 + options.length) % options.length);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const opt = options[active] || options.find(o => o.value === value);
            if (opt) onChange(opt.value);
            setOpen(false);
        }
    };

    return (
        <div className="w-full">
            {label && <label className="block mb-5 text-sm text-muted-foreground">{label}</label>}
            <div className="relative mt-2" onKeyDown={handleKeyDown}>
                <button
                    ref={btnRef}
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    onClick={() => setOpen(v => !v)}
                    className={`inline-flex w-full items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-sm ${buttonClassName}`}
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                >
                    <span className="truncate">{current.label}</span>
                    <ChevronDown
                        className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-primary)' }}
                    />
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
                            return (
                                <li
                                    key={opt.value ?? `opt-${idx}`}
                                    role="option"
                                    aria-selected={selected}
                                    onMouseEnter={() => setActive(idx)}
                                    onClick={() => { onChange(opt.value); setOpen(false); }}
                                    className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between ${isActive ? 'bg-muted' : 'bg-white'
                                        } ${selected ? 'font-medium' : ''}`}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    {selected && <Check className="w-4 h-4" />}
                                </li>
                            );
                        })}
                        {options.length === 0 && (
                            <li className="px-3 py-2 text-sm text-muted-foreground">Không có lựa chọn</li>
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
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-5 w-5 text-muted-foreground" style={{ color }} />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            <h5 className="text-xs text-muted-foreground">{description}</h5>
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
            legend: { position: 'bottom' },
            title: { display: true, text: 'Tỷ lệ chất lượng Data', font: { size: 16 } },
        },
    };
    return <Doughnut data={data} options={options} />;
};

function ReceptionLogTable({ logs, visibleCount, onReachEnd }) {
    const containerRef = useRef(null);
    const rows = logs.slice(0, visibleCount);

    const handleScroll = (e) => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
            onReachEnd?.();
        }
    };

    return (
        <Card className="shadow-lg col-span-1 lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5" />Log Tiếp nhận Data</CardTitle>
                <CardDescription>Danh sách data được ghi nhận vào hệ thống gần đây nhất.</CardDescription>
            </CardHeader>
            <CardContent>
                <div
                    ref={containerRef}
                    className="max-h-[400px] overflow-y-auto"
                    onScroll={handleScroll}
                >
                    <Table>
                        <TableHeader className="sticky top-0 bg-secondary">
                            <TableRow>
                                <TableHead>Khách hàng</TableHead>
                                <TableHead>Nguồn</TableHead>
                                <TableHead className="text-right">Thời gian</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length > 0 ? rows.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell className="font-medium">{log.customerName}</TableCell>
                                    <TableCell><Badge variant="outline">{log.source}</Badge></TableCell>
                                    <TableCell className="text-right text-xs">{new Date(log.createdAt).toLocaleString('vi-VN')}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Chưa có dữ liệu.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                    {visibleCount < logs.length && (
                        <div className="flex justify-center py-3">
                            <button
                                className="text-sm px-4 py-2 rounded-[6px] border"
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

/* ======================= Helpers ======================= */

function hasZalo(customer) {
    const hasUid = Array.isArray(customer.uid) && customer.uid.length > 0 && customer.uid[0]?.uid;
    const noteSuccess = Array.isArray(customer.care) && customer.care.some(
        n => /tìm uid zalo/i.test(n.content || '') && /thành công/i.test(n.content || '')
    );
    return !!(hasUid || noteSuccess);
}

function isMissingInfo(customer) {
    return !customer?.name || !customer?.phone;
}

function deriveGroup(customer, serviceMap) {
    const tagTypes = new Set(
        (customer?.tags || [])
            .map(id => serviceMap.get(String(id))?.type)
            .filter(Boolean)
    );
    if (tagTypes.has('ngoai_khoa')) return 'ngoai_khoa';
    if (tagTypes.has('noi_khoa')) return 'noi_khoa';
    return 'unknown';
}

/* ======================= Main Component ======================= */
const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};
export default function DataReceptionClient({ initialData, service = [] }) {
    const [data] = useState(initialData);

    // Filters
    const [groupFilter, setGroupFilter] = useState('all'); // all | noi_khoa | ngoai_khoa
    const [tagFilter, setTagFilter] = useState('all');     // 'all' | service.name
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 7);
        return toYMD(d);
    });

    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return toYMD(d);
    });         // YYYY-MM-DD

    // Infinite scroll for log
    const [visibleCount, setVisibleCount] = useState(10);
    const handleReachEnd = useCallback(() => setVisibleCount(c => c + 10), []);

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
    ]), []);

    const tagOptions = useMemo(() => ([
        { value: 'all', label: 'Tất cả dịch vụ' },
        ...(service || []).map(s => ({ value: s.name, label: s.name }))
    ]), [service]);

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
            return true;
        });
    }, [data, startDate, endDate, groupFilter, tagFilter, serviceMap]);

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

        const avgResponseTime = leadsWithResponse > 0
            ? (totalResponseTime / leadsWithResponse / 1000)
            : 0;

        return {
            stats: {
                total: filteredData.length,
                valid: validCount,
                invalid: invalidCount,
                missing: missingInfoCount,
                avgResponseTime: avgResponseTime.toFixed(2) + ' giây'
            },
            receptionLog: log
        };
    }, [filteredData]);

    // Reset paging when filters change
    useEffect(() => { setVisibleCount(10); }, [groupFilter, tagFilter, startDate, endDate]);

    return (
        <div className="flex-1 space-y-4 py-4 pt-6 min-h-screen">

            {/* ====== Filters (responsive) ====== */}
            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle>Lọc theo nhóm, dịch vụ quan tâm và khoảng thời gian tiếp nhận.</CardTitle>
                </CardHeader>

                <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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

                    <div>
                        <label className="block mb-2 text-sm text-muted-foreground">Từ ngày</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full rounded-[6px] border px-3 py-2 text-sm mt-2"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>

                    <div>
                        <label className="block mb-2 text-sm text-muted-foreground">Đến ngày</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full rounded-[6px] border px-3 py-2 text-sm mt-2"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* ====== Stats (responsive cards) ====== */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
                <StatCard title="Tổng Data" value={stats.total} icon={Users} description="Tổng data theo bộ lọc" color="#3b82f6" />
                <StatCard title="Data Hợp lệ" value={stats.valid} icon={CheckCircle} description="Có Zalo (UID) hoặc tìm UID thành công" color="#10b981" />
                <StatCard title="Data Không hợp lệ" value={stats.invalid} icon={AlertTriangle} description="Không tìm thấy Zalo (không có UID)" color="#ef4444" />
                <StatCard title="T.gian P.hồi TB" value={stats.avgResponseTime} icon={Clock} description="Từ lúc nhận đến hoạt động đầu tiên" color="#8b5cf6" />
            </div>

            {/* ====== Chart + Log ====== */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                <Card className="shadow-lg lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Chất lượng Data</CardTitle>
                        <CardDescription>Tỷ lệ hợp lệ, không hợp lệ và thiếu thông tin.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[360px] sm:h-[400px] relative">
                        <DataQualityChart valid={stats.valid} invalid={stats.invalid} missing={stats.missing} />
                    </CardContent>
                </Card>

                <ReceptionLogTable
                    logs={receptionLog}
                    visibleCount={visibleCount}
                    onReachEnd={() => {
                        if (visibleCount < receptionLog.length) handleReachEnd();
                    }}
                />
            </div>
        </div>
    );
}
