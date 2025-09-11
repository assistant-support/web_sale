'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, History, RefreshCw, ChevronDown, Check } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

/* ======================= Listbox (Dropdown) ======================= */
function Listbox({ label, options, value, onChange, placeholder = 'Chọn...', buttonClassName = '' }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const listRef = useRef(null);
    const [active, setActive] = useState(-1);

    const current = useMemo(
        () => options.find(o => o.value === value) || { label: placeholder, value: undefined },
        [options, value, placeholder]
    );

    useEffect(() => {
        function onClickOutside(e) {
            if (!open) return;
            if (btnRef.current?.contains(e.target)) return;
            if (listRef.current?.contains(e.target)) return;
            setOpen(false);
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

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
            {label && <label className="block mb-2 text-sm text-muted-foreground">{label}</label>}
            <div className="relative" onKeyDown={handleKeyDown}>
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
            <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
    </Card>
);

const LeadsDistributionChart = ({ assigned, pending }) => {
    const data = {
        labels: ['Đã phân bổ', 'Chờ phân bổ'],
        datasets: [{
            label: 'Tình trạng Leads',
            data: [assigned, pending],
            backgroundColor: ['#10b981', '#f59e0b'],
            borderColor: ['#059669', '#d97706'],
            borderWidth: 1,
        }],
    };
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            title: { display: true, text: 'Tỷ lệ phân bổ Leads', font: { size: 16 } },
        },
    };
    return <Doughnut data={data} options={options} />;
};

function AssignmentLogTable({ rows, visibleCount, onReachEnd, title = 'Lịch sử phân bổ gần đây' }) {
    const containerRef = useRef(null);
    const visible = rows.slice(0, visibleCount);

    const handleScroll = (e) => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) onReachEnd?.();
    };

    return (
        <Card className="shadow-lg col-span-1 lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5" />{title}</CardTitle>
                <CardDescription>
                    {title.includes('chờ phân bổ') ? 'Các leads chưa được giao cho nhân viên.' : 'Danh sách các leads được phân bổ gần đây nhất.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div ref={containerRef} className="max-h-[400px] overflow-y-auto" onScroll={handleScroll}>
                    <Table>
                        <TableHeader className="sticky top-0 bg-secondary">
                            <TableRow>
                                <TableHead>Khách hàng</TableHead>
                                <TableHead>Nhân viên</TableHead>
                                <TableHead className="hidden md:table-cell">Nhóm</TableHead>
                                <TableHead className="text-right">Thời gian</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {visible.length > 0 ? visible.map((log, index) => (
                                <TableRow key={`${log.id}-${index}`}>
                                    <TableCell>
                                        <div className="font-medium">{log.customerName}</div>
                                        <div className="text-xs text-muted-foreground">{log.zaloName || 'N/A'}</div>
                                    </TableCell>
                                    <TableCell>{log.assignedToName || 'chưa phân bổ'}</TableCell>
                                    <TableCell className="hidden md:table-cell"><Badge variant="outline">{log.group || 'chưa phân bổ'}</Badge></TableCell>
                                    <TableCell className="text-right text-xs">{new Date(log.assignedAt).toLocaleString('vi-VN')}</TableCell>
                                </TableRow>
                            )) : (
                                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Chưa có dữ liệu.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                    {visible.length < rows.length && (
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

/* ======================= Main Component ======================= */
const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};
export default function DashboardClient({ initialData, user = [] }) {
    const [data, setData] = useState(initialData);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // ===== Filters =====
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
    });
    const [statusFilter, setStatusFilter] = useState('all'); // all | assigned | pending
    const [groupFilter, setGroupFilter] = useState('all');   // all | noi_khoa | ngoai_khoa
    const [employeeFilter, setEmployeeFilter] = useState('all'); // userId | 'all'

    // Infinite scroll for log
    const [visibleCount, setVisibleCount] = useState(10);
    const handleReachEnd = useCallback(() => setVisibleCount(c => c + 10), []);

    // Map userId -> user info
    const userMap = useMemo(() => {
        const m = new Map();
        (user || []).forEach(u => m.set(String(u._id), u));
        return m;
    }, [user]);

    // Listbox options
    const statusOptions = useMemo(() => ([
        { value: 'all', label: 'Tất cả tình trạng' },
        { value: 'assigned', label: 'Đã phân bổ' },
        { value: 'pending', label: 'Chờ phân bổ' },
    ]), []);

    const groupOptions = useMemo(() => ([
        { value: 'all', label: 'Tất cả nhóm' },
        { value: 'noi_khoa', label: 'Nội khoa' },
        { value: 'ngoai_khoa', label: 'Ngoại khoa' },
    ]), []);

    const employeeOptions = useMemo(() => ([
        { value: 'all', label: 'Tất cả nhân viên' },
        ...(user || []).map(u => ({ value: String(u._id), label: u.name }))
    ]), [user]);

    // ===== Apply filters to leads =====
    const filteredLeads = useMemo(() => {
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59.999') : null;

        return (data || []).filter(c => {
            // Time by createAt (filter tổng thể nguồn vào hệ thống)
            const ct = new Date(c.createAt);
            if (start && ct < start) return false;
            if (end && ct > end) return false;

            const hasAssignees = Array.isArray(c.assignees) && c.assignees.length > 0;

            // Status filter
            if (statusFilter === 'assigned' && !hasAssignees) return false;
            if (statusFilter === 'pending' && hasAssignees) return false;

            // Group filter — áp cho leads đã phân bổ (dựa vào group của user được giao gần nhất)
            if (groupFilter !== 'all') {
                if (!hasAssignees) return false;
                const last = c.assignees[c.assignees.length - 1];
                const u = userMap.get(String(last.user));
                const g = u?.group || last.group || 'unknown';
                if (g !== groupFilter) return false;
            }

            // Employee filter — lead phải có ít nhất 1 lần phân bổ cho nhân viên đó
            if (employeeFilter !== 'all') {
                if (!hasAssignees) return false;
                const matched = c.assignees.some(a => String(a.user) === employeeFilter);
                if (!matched) return false;
            }

            return true;
        });
    }, [data, startDate, endDate, statusFilter, groupFilter, employeeFilter, userMap]);

    // ===== Stats & Assignment Log (from filteredLeads) =====
    const { stats, assignmentRows, pendingRows } = useMemo(() => {
        // ===== Stats =====
        const assigned = filteredLeads.filter(c => Array.isArray(c.assignees) && c.assignees.length > 0).length;
        const pending = filteredLeads.length - assigned;

        // ===== Assignment rows (đã phân bổ) =====
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59.999') : null;

        const assignmentRows = filteredLeads.flatMap(c => {
            if (!Array.isArray(c.assignees)) return [];
            return c.assignees.map(a => {
                const u = userMap.get(String(a.user));
                return {
                    id: `${c._id}-${a._id || a.assignedAt}`,
                    customerName: c.name,
                    zaloName: c.zaloname,
                    assignedToId: String(a.user),
                    assignedToName: u?.name || 'N/A',
                    group: u?.group || a.group || 'N/A',
                    assignedAt: a.assignedAt,
                };
            });
        })
            .filter(r => {
                const at = new Date(r.assignedAt);
                if (start && at < start) return false;
                if (end && at > end) return false;
                if (employeeFilter !== 'all' && r.assignedToId !== employeeFilter) return false;
                if (groupFilter !== 'all' && r.group !== groupFilter) return false;
                return true;
            })
            .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));

        // ===== Pending rows (chưa phân bổ) =====
        const pendingRows = filteredLeads
            .filter(c => !Array.isArray(c.assignees) || c.assignees.length === 0)
            .map(c => ({
                id: String(c._id),
                customerName: c.name,
                zaloName: c.zaloname,
                assignedToName: '—',
                group: '—',
                // dùng createAt làm mốc thời gian hiển thị/sort
                assignedAt: c.createAt,
            }))
            .filter(r => {
                // lọc theo time range (createAt)
                const at = new Date(r.assignedAt);
                if (start && at < start) return false;
                if (end && at > end) return false;
                // nếu đang lọc theo employee hoặc group thì không áp cho pending (không có người/group)
                if (employeeFilter !== 'all') return false;
                if (groupFilter !== 'all') return false;
                return true;
            })
            .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));

        return { stats: { total: filteredLeads.length, assigned, pending }, assignmentRows, pendingRows };
    }, [filteredLeads, startDate, endDate, employeeFilter, groupFilter, userMap]);
    // Reset paging when filters change
    useEffect(() => { setVisibleCount(10); }, [startDate, endDate, statusFilter, groupFilter, employeeFilter]);

    // (Optional) fake refresh
    useEffect(() => {
        const interval = setInterval(async () => {
            setIsRefreshing(true);
            await new Promise(r => setTimeout(r, 400));
            setIsRefreshing(false);
        }, 30000);
        return () => clearInterval(interval);
    }, []);
    const rowsToShow = statusFilter === 'pending' ? pendingRows : assignmentRows;
    const tableTitle = statusFilter === 'pending' ? 'Danh sách chờ phân bổ' : 'Lịch sử phân bổ gần đây';
    return (
        <div className="flex-1 space-y-4 py-4 pt-6 min-h-screen">

            {/* ===== Filters ===== */}
            <Card className="shadow-md">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Bộ lọc</CardTitle>
                        <CardDescription>Lọc theo nhân viên, nhóm, tình trạng và thời gian.</CardDescription>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setStartDate(''); setEndDate('');
                            setStatusFilter('all'); setGroupFilter('all'); setEmployeeFilter('all');
                        }}
                        className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Đặt lại bộ lọc
                    </button>
                </CardHeader>

                <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                    <Listbox
                        label="Tình trạng"
                        options={statusOptions}
                        value={statusFilter}
                        onChange={setStatusFilter}
                    />
                    <Listbox
                        label="Nhóm nhân viên"
                        options={groupOptions}
                        value={groupFilter}
                        onChange={setGroupFilter}
                    />
                    <Listbox
                        label="Nhân viên"
                        options={employeeOptions}
                        value={employeeFilter}
                        onChange={setEmployeeFilter}
                    />

                    <div>
                        <label className="block mb-2 text-sm text-muted-foreground">Từ ngày</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>
                    <div>
                        <label className="block mb-2 text-sm text-muted-foreground">Đến ngày</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* ===== Stats ===== */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                <StatCard title="Tổng số Leads" value={stats.total} icon={Users} description="Tổng số leads sau bộ lọc" color="#3b82f6" />
                <StatCard title="Đã phân bổ" value={stats.assigned} icon={UserCheck} description="Leads đã được giao cho nhân viên" color="#10b981" />
                <StatCard title="Chờ phân bổ" value={stats.pending} icon={History} description="Leads mới đang chờ được xử lý" color="#f59e0b" />
            </div>

            {/* ===== Chart + Log ===== */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                <Card className="shadow-lg lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Phân bổ Leads</CardTitle>
                        <CardDescription>Tỷ lệ leads đã phân bổ và đang chờ (sau bộ lọc).</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[360px] sm:h-[400px] relative">
                        <LeadsDistributionChart assigned={stats.assigned} pending={stats.pending} />
                    </CardContent>
                </Card>

                <AssignmentLogTable
                    rows={rowsToShow}
                    visibleCount={visibleCount}
                    onReachEnd={() => {
                        if (visibleCount < rowsToShow.length) handleReachEnd();
                    }}
                    title={tableTitle}
                />
            </div>
        </div>
    );
}
