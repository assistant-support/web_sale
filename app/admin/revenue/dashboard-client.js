'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ShoppingCart, UserCheck, Percent, History, ChevronDown, RefreshCw, Check } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/* ================== Helpers ================== */
const fmtVND = (n = 0) => (Number(n) || 0).toLocaleString('vi-VN') + ' đ';
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

const startOfWeek = (d) => { // tuần bắt đầu Thứ 2
    const x = startOfDay(d);
    const day = (x.getDay() + 6) % 7; // 0=Mon
    x.setDate(x.getDate() - day);
    return x;
};
const endOfWeek = (d) => { const x = startOfWeek(d); x.setDate(x.getDate() + 6); return endOfDay(x); };

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
const getQuarter = (d) => Math.floor(d.getMonth() / 3) + 1;
const startOfQuarter = (d) => new Date(d.getFullYear(), (getQuarter(d) - 1) * 3, 1);
const endOfQuarter = (d) => endOfDay(new Date(d.getFullYear(), (getQuarter(d) - 1) * 3 + 3, 0));
const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
const endOfYear = (d) => endOfDay(new Date(d.getFullYear(), 11, 31));

const daysBetween = (a, b) => Math.max(1, Math.ceil((endOfDay(b) - startOfDay(a)) / 86400000));

const isoWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { week, year: d.getUTCFullYear() };
};

const bucketKey = (date, mode) => {
    const d = new Date(date);
    switch (mode) {
        case 'day': return d.toLocaleDateString('vi-VN');                           // dd/mm/yyyy
        case 'week': { const { week, year } = isoWeekNumber(d); return `Tuần ${week}/${year}`; }
        case 'month': return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; // mm/yyyy
        case 'quarter': return `Q${getQuarter(d)}/${d.getFullYear()}`;
        case 'year': return String(d.getFullYear());
        default: return d.toLocaleDateString('vi-VN');
    }
};

const chooseBucketMode = (start, end) => {
    const diff = daysBetween(start, end);
    if (diff <= 45) return 'day';
    if (diff <= 200) return 'week';
    if (diff <= 730) return 'month';
    if (diff <= 1460) return 'quarter';
    return 'year';
};

const resolveDealDate = (customer) => {
    // Ưu tiên ngày chốt từ serviceDetails
    if (customer?.serviceDetails?.closedAt) return new Date(customer.serviceDetails.closedAt);
    // Suy ra từ care step 6 hoặc note "[Chốt dịch vụ]"
    const logs = Array.isArray(customer?.care) ? customer.care : [];
    // tìm note step 6 mới nhất
    const step6 = logs
        .filter(n => n?.step === 6 || String(n?.content || '').includes('[Chốt dịch vụ]'))
        .sort((a, b) => new Date(b.createAt) - new Date(a.createAt))[0];
    if (step6?.createAt) return new Date(step6.createAt);
    return null;
};

const isDeal = (c) => {
    // là deal khi có ngày chốt suy ra, hoặc status chốt/in_progress, hoặc có doanh thu > 0
    if (resolveDealDate(c)) return true;
    const st = c?.serviceDetails?.status;
    if (st === 'completed' || st === 'in_progress') return true;
    if ((Number(c?.serviceDetails?.revenue) || 0) > 0) return true;
    return false;
};

/* ================== Listbox (dropdown button) ================== */
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
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(p => (p + 1) % options.length); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(p => (p - 1 + options.length) % options.length); return; }
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
                    <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-primary)' }} />
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
                        {options.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Không có lựa chọn</li>}
                    </ul>
                )}
            </div>
        </div>
    );
}

/* ================== Sub Components ================== */
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

const RevenueChart = ({ chartData, title }) => {
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: title, font: { size: 16 } },
        },
        scales: {
            y: {
                ticks: {
                    callback: function (value) { return (value / 1_000_000) + 'tr'; }
                }
            }
        }
    };
    return <Bar options={options} data={chartData} />;
};

const RecentDealsTable = ({ deals }) => (
    <Card className="shadow-lg col-span-1 lg:col-span-2">
        <CardHeader>
            <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5" />Dịch vụ chốt gần đây</CardTitle>
            <CardDescription>Danh sách các khách hàng đã chốt dịch vụ gần nhất.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="max-h-[400px] overflow-y-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary">
                        <TableRow>
                            <TableHead>Khách hàng</TableHead>
                            <TableHead>Doanh thu</TableHead>
                            <TableHead className="hidden md:table-cell">Trạng thái</TableHead>
                            <TableHead className="text-right">Ngày chốt</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {deals.map(deal => (
                            <TableRow key={deal._id}>
                                <TableCell className="font-medium">{deal.name}</TableCell>
                                <TableCell className="font-semibold text-green-600">
                                    {fmtVND(deal.serviceDetails?.revenue)}
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                    {deal.serviceDetails?.status === 'completed'
                                        ? <Badge>Hoàn thành</Badge>
                                        : <Badge variant="secondary">Còn liệu trình</Badge>}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                    {deal.__dealDate ? new Date(deal.__dealDate).toLocaleDateString('vi-VN') : '—'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
    </Card>
);
const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};
/* ================== Main Component ================== */
export default function RevenueStatsClient({ initialData = [] }) {
    // Preset time range
    const [rangePreset, setRangePreset] = useState('custom'); // this_week, last_7, this_month, last_30, this_quarter, this_year, custom
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

    const rangeOptions = [
        { value: 'custom', label: 'Tùy chọn' },
        { value: 'this_week', label: 'Tuần này' },
        { value: 'last_7', label: '7 ngày qua' },
        { value: 'this_month', label: 'Tháng này' },
        { value: 'last_30', label: '30 ngày qua' },
        { value: 'this_quarter', label: 'Quý này' },
        { value: 'this_year', label: 'Năm nay' },
    ];
    // Tính start-end theo preset (nếu không phải custom)
    const { rangeStart, rangeEnd } = useMemo(() => {
        const now = new Date();
        switch (rangePreset) {
            case 'this_week': return { rangeStart: startOfWeek(now), rangeEnd: endOfWeek(now) };
            case 'last_7': { const e = endOfDay(now); const s = new Date(e); s.setDate(s.getDate() - 6); return { rangeStart: startOfDay(s), rangeEnd: e }; }
            case 'this_month': return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
            case 'last_30': { const e = endOfDay(now); const s = new Date(e); s.setDate(s.getDate() - 29); return { rangeStart: startOfDay(s), rangeEnd: e }; }
            case 'this_quarter': return { rangeStart: startOfQuarter(now), rangeEnd: endOfQuarter(now) };
            case 'this_year': return { rangeStart: startOfYear(now), rangeEnd: endOfYear(now) };
            case 'custom': {
                const s = startDate ? startOfDay(new Date(startDate)) : startOfYear(now);
                const e = endDate ? endOfDay(new Date(endDate)) : endOfDay(now);
                return { rangeStart: s, rangeEnd: e };
            }
            default: return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
        }
    }, [rangePreset, startDate, endDate]);

    // Chuẩn hóa deals theo care (tính __dealDate)
    const normalizedDeals = useMemo(() => {
        const list = Array.isArray(initialData) ? initialData : [];
        const mapped = list
            .filter(isDeal)
            .map(c => {
                const dealDate = resolveDealDate(c);
                return { ...c, __dealDate: dealDate ? dealDate.toISOString() : null };
            });
        return mapped;
    }, [initialData]);

    // Lọc theo khoảng thời gian
    const filteredDeals = useMemo(() => {
        return normalizedDeals.filter(d => {
            if (!d.__dealDate) return false;
            const t = new Date(d.__dealDate);
            return t >= rangeStart && t <= rangeEnd;
        });
    }, [normalizedDeals, rangeStart, rangeEnd]);

    // Gom nhóm theo bucket (tự động chọn granularity)
    const { stats, chartData, recentDeals, chartTitle } = useMemo(() => {
        const totalDeals = filteredDeals.length;
        const totalRevenue = filteredDeals.reduce((sum, d) => sum + (Number(d?.serviceDetails?.revenue) || 0), 0);
        const avgRevenue = totalDeals ? totalRevenue / totalDeals : 0;

        // upsellRate dựa serviceDetails.customTags (nếu có)
        const upsellCount = filteredDeals.filter(d =>
            d?.serviceDetails?.customTags?.some(tag => ['upsell', 'cross-sell'].includes(String(tag).toLowerCase()))
        ).length;
        const upsellRate = totalDeals ? Number(((upsellCount / totalDeals) * 100).toFixed(2)) : 0;

        // chọn bucketMode
        const mode = chooseBucketMode(rangeStart, rangeEnd);
        const buckets = new Map();
        filteredDeals.forEach(d => {
            const key = bucketKey(new Date(d.__dealDate), mode);
            const rev = Number(d?.serviceDetails?.revenue) || 0;
            buckets.set(key, (buckets.get(key) || 0) + rev);
        });

        // sắp xếp key theo thời gian thực tế
        const sortKeyToDate = (key) => {
            try {
                switch (mode) {
                    case 'day': return new Date(key.split('/').reverse().join('-')); // rough for vi-VN dd/mm/yyyy
                    case 'week': { const [, wkYear] = key.replace('Tuần ', '').split('/'); return new Date(Number(wkYear), 0, 1); }
                    case 'month': { const [mm, yyyy] = key.split('/'); return new Date(Number(yyyy), Number(mm) - 1, 1); }
                    case 'quarter': { const [q, yyyy] = key.replace('Q', '').split('/'); return new Date(Number(yyyy), (Number(q) - 1) * 3, 1); }
                    case 'year': return new Date(Number(key), 0, 1);
                    default: return new Date(key);
                }
            } catch { return new Date(); }
        };

        const labels = Array.from(buckets.keys()).sort((a, b) => sortKeyToDate(a) - sortKeyToDate(b));
        const values = labels.map(l => buckets.get(l));

        const chartTitle = `Doanh thu theo ${mode === 'day' ? 'ngày' : mode === 'week' ? 'tuần' : mode === 'month' ? 'tháng' : mode === 'quarter' ? 'quý' : 'năm'}`;

        const recentDeals = [...filteredDeals].sort((a, b) => new Date(b.__dealDate) - new Date(a.__dealDate));

        return {
            stats: {
                totalDeals,
                totalRevenue: fmtVND(totalRevenue),
                avgRevenue: fmtVND(avgRevenue),
                upsellRate: `${upsellRate.toFixed(2)}%`,
            },
            chartData: {
                labels,
                datasets: [{
                    label: 'Doanh thu',
                    data: values,
                    backgroundColor: 'rgba(22, 163, 74, 0.7)',
                    borderColor: 'rgba(21, 128, 61, 1)',
                    borderWidth: 1,
                }]
            },
            recentDeals,
            chartTitle
        };
    }, [filteredDeals, rangeStart, rangeEnd]);

    return (
        <div className="flex-1 space-y-4 py-4 pt-6 min-h-screen">
            {/* Filters */}
            <Card className="shadow-md">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Bộ lọc thời gian</CardTitle>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setRangePreset('custom'); setStartDate(''); setEndDate(''); }}
                        className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                    >
                        <RefreshCw className="w-4 h-4" /> Đặt lại
                    </button>
                </CardHeader>

                <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <Listbox
                        label="Khoảng thời gian"
                        options={rangeOptions}
                        value={rangePreset}
                        onChange={(v) => setRangePreset(v)}
                    />
                    {rangePreset === 'custom' && (
                        <>
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
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Tổng Dịch vụ Chốt" value={stats.totalDeals} icon={ShoppingCart} description="Số khách hàng đã chốt (sau lọc)" color="#16a34a" />
                <StatCard title="Tổng Doanh thu" value={stats.totalRevenue} icon={DollarSign} description="Tổng doanh thu (sau lọc)" color="#16a34a" />
                <StatCard title="Doanh thu TB/DV" value={stats.avgRevenue} icon={UserCheck} description="Trung bình mỗi dịch vụ" color="#16a34a" />
                <StatCard title="Tỷ lệ Upsell" value={stats.upsellRate} icon={Percent} description="Upsell/Cross-sell trên tổng" color="#f97316" />
            </div>

            {/* Chart + Table */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle>Biểu đồ Doanh thu</CardTitle>
                        <CardDescription>Tự động đổi thang thời gian theo khoảng lọc.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px] relative">
                        <RevenueChart chartData={chartData} title={chartTitle} />
                    </CardContent>
                </Card>
                <RecentDealsTable deals={recentDeals} />
            </div>
        </div>
    );
}
