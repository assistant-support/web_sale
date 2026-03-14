'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, RefreshCw, Download, Plus, BookOpenText } from 'lucide-react';
import Popup from '@/components/ui/popup';

function Listbox({ label, options, value, onChange, placeholder = 'Chọn...' }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const listRef = useRef(null);

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

    return (
        <div className="w-full">
            {label && <label className="block mb-2 text-sm text-muted-foreground">{label}</label>}
            <div className="relative">
                <button
                    ref={btnRef}
                    type="button"
                    onClick={() => setOpen(v => !v)}
                    className="inline-flex w-full items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                >
                    <span className="truncate">{current.label}</span>
                    <span className="text-xs">▼</span>
                </button>
                {open && (
                    <ul
                        ref={listRef}
                        className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-[6px] border bg-white shadow-sm"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        {options.map((opt, idx) => (
                            <li
                                key={opt.value ?? `opt-${idx}`}
                                onClick={() => { onChange(opt.value); setOpen(false); }}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
                            >
                                {opt.label}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

const StatCard = ({ title, value, icon: Icon, color }) => (
    <Card className="shadow-lg border-l-4" style={{ borderLeftColor: color }}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-5 w-5" style={{ color }} />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
);

function DevManualTriggerModal({ open, onClose }) {
    const [step, setStep] = useState('options'); // 'options' | 'password'
    const [selectedMode, setSelectedMode] = useState(null); // 'rebuild_all' | 'current_month' | 'rebuild_daily_all' | 'rebuild_daily_range' | null
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSelectMode = (mode) => {
        setSelectedMode(mode);
        setStep('password');
        setPassword('');
    };

    const handleSubmit = async () => {
        if (password !== '2522026') {
            alert('Mật mã không đúng. Hãy thông báo cho Dev.');
            return;
        }
        if (!selectedMode) return;
        setLoading(true);
        try {
            const body = { mode: selectedMode };
            const res = await fetch('/api/reports/financial/manual-trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Lỗi khi chạy Dev Manual Trigger');
            }
            alert(data.message || 'Đã chạy Dev Manual Trigger thành công.');
            onClose();
            setStep('options');
            setSelectedMode(null);
            setPassword('');
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <Popup
            open={open}
            onClose={() => {
                if (!loading) {
                    onClose();
                    setStep('options');
                    setSelectedMode(null);
                    setPassword('');
                }
            }}
            header="Dev Manual Trigger"
            footer={
                step === 'password' ? (
                    <>
                        <button
                            onClick={() => {
                                if (!loading) {
                                    setStep('options');
                                    setSelectedMode(null);
                                    setPassword('');
                                }
                            }}
                            className="px-4 py-2 rounded border hover:bg-gray-50"
                            disabled={loading}
                        >
                            Quay lại
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                            disabled={loading}
                        >
                            {loading ? 'Đang thực thi...' : 'Thực thi'}
                        </button>
                    </>
                ) : null
            }
        >
            <div className="space-y-4">
                {step === 'options' ? (
                    <>
                        <div className="text-sm text-muted-foreground">
                            Chọn hành động tính toán báo cáo tài chính (chỉ dành cho Dev).
                        </div>
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => handleSelectMode('rebuild_all')}
                                className="w-full text-left px-3 py-2 rounded border hover:bg-muted text-sm"
                                style={{ borderColor: 'var(--border)' }}
                            >
                                Rebuild toàn bộ lịch sử (tất cả tháng)
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectMode('current_month')}
                                className="w-full text-left px-3 py-2 rounded border hover:bg-muted text-sm"
                                style={{ borderColor: 'var(--border)' }}
                            >
                                Chỉ tính lại tháng hiện tại
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectMode('rebuild_daily_all')}
                                className="w-full text-left px-3 py-2 rounded border hover:bg-muted text-sm"
                                style={{ borderColor: 'var(--border)' }}
                            >
                                Rebuild toàn bộ báo cáo theo ngày (financial_reports_daily)
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="space-y-3">
                        <div className="text-sm text-muted-foreground">Bạn có phải là Dev?</div>
                        <div>
                            <label className="block mb-2 text-sm font-medium">Nhập mật mã Dev</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded border px-3 py-2"
                                style={{ borderColor: 'var(--border)' }}
                                placeholder="********"
                            />
                        </div>
                    </div>
                )}
            </div>
        </Popup>
    );
}
function getDefaultMonthRange() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const toStr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { from: toStr(first), to: toStr(last) };
}

function OperationalCostModal({ open, onClose, onSave, services = [] }) {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [costType, setCostType] = useState('');
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [serviceId, setServiceId] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!startDate || !endDate || !costType || !amount) {
            alert('Vui lòng điền đầy đủ thông tin');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/reports/operational-cost', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Gửi kèm serviceId (backend hiện tại có thể bỏ qua nếu chưa dùng)
                body: JSON.stringify({ startDate, endDate, costType, amount: Number(amount), note, serviceId: serviceId || undefined }),
            });

            const data = await res.json();
            if (data.success) {
                onSave?.();
                onClose();
                setStartDate('');
                setEndDate('');
                setCostType('');
                setAmount('');
                setNote('');
                    setServiceId('');
            } else {
                alert(data.error || 'Có lỗi xảy ra');
            }
        } catch (error) {
            alert('Có lỗi xảy ra: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Popup
            open={open}
            onClose={onClose}
            header="Nhập chi phí vận hành"
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded border hover:bg-gray-50"
                        disabled={loading}
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                        disabled={loading}
                    >
                        {loading ? 'Đang lưu...' : 'Lưu'}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="block mb-2 text-sm font-medium">Từ ngày</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                        style={{ borderColor: 'var(--border)' }}
                    />
                </div>
                <div>
                    <label className="block mb-2 text-sm font-medium">Đến ngày</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                        style={{ borderColor: 'var(--border)' }}
                    />
                </div>
                <div>
                    <label className="block mb-2 text-sm font-medium">Loại chi phí</label>
                    <input
                        type="text"
                        value={costType}
                        onChange={(e) => setCostType(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                        style={{ borderColor: 'var(--border)' }}
                        placeholder="Ví dụ: Tiền lương, Thuê mặt bằng, Điện nước..."
                    />
                </div>
                <div>
                    <label className="block mb-2 text-sm font-medium">Dịch vụ (tuỳ chọn)</label>
                    <select
                        value={serviceId}
                        onChange={(e) => setServiceId(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        <option value="">Tất cả dịch vụ / Không gắn dịch vụ</option>
                        {services.map((s) => (
                            <option key={String(s._id)} value={String(s._id)}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block mb-2 text-sm font-medium">Số tiền</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                        style={{ borderColor: 'var(--border)' }}
                        placeholder="Nhập số tiền"
                    />
                </div>
                <div>
                    <label className="block mb-2 text-sm font-medium">Ghi chú</label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                        style={{ borderColor: 'var(--border)' }}
                        rows={3}
                        placeholder="Ghi chú..."
                    />
                </div>
            </div>
        </Popup>
    );
}

export default function FinancialReportClient({ customers = [], services = [], sources = [], messageSources = [] }) {
    const defaultRange = getDefaultMonthRange();
    const [sourceFilter, setSourceFilter] = useState('all');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [startDate, setStartDate] = useState(defaultRange.from);
    const [endDate, setEndDate] = useState(defaultRange.to);
    /** true = lọc theo khoảng ngày (Từ ngày / Đến ngày); false = hiển thị theo tháng (mặc định) */
    const [useDateRangeFilter, setUseDateRangeFilter] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [docOpen, setDocOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [marketingCosts, setMarketingCosts] = useState([]);
    const [operationalCosts, setOperationalCosts] = useState([]);
    const [totalRevenueFromReport, setTotalRevenueFromReport] = useState(0);
    const [marketingCostFromReport, setMarketingCostFromReport] = useState(0);
    const [devTriggerOpen, setDevTriggerOpen] = useState(false);
    const [financialRows, setFinancialRows] = useState([]);
    const [financialSummary, setFinancialSummary] = useState(null);

    const sourceOptions = useMemo(() => {
        const opts = [{ value: 'all', label: 'Tất cả nguồn' }];
        (sources || []).forEach(s => opts.push({ value: String(s._id), label: s.name }));
        (messageSources || []).forEach(s => opts.push({ value: String(s._id), label: s.name }));
        return opts;
    }, [sources, messageSources]);

    const serviceOptions = useMemo(() => {
        const opts = [{ value: 'all', label: 'Tất cả dịch vụ' }];
        (services || []).forEach(s => opts.push({ value: String(s._id), label: s.name }));
        return opts;
    }, [services]);

    // Load costs + tổng doanh thu (dựa trên service_details giống báo cáo doanh thu/marketing)
    useEffect(() => {
        const loadCosts = async () => {
            try {
                const costParams = new URLSearchParams();
                if (startDate && endDate) {
                    costParams.append('startDate', startDate);
                    costParams.append('endDate', endDate);
                }

                const reportParams = new URLSearchParams();
                if (startDate && endDate) {
                    reportParams.append('from', startDate);
                    reportParams.append('to', endDate);
                }

                const [marketingRes, operationalRes, revenueRes, marketingReportRes] = await Promise.all([
                    fetch(`/api/reports/marketing-cost?${costParams}`),
                    fetch(`/api/reports/operational-cost?${costParams}`),
                    fetch(`/api/reports/revenue${reportParams.toString() ? `?${reportParams}` : ''}`),
                    fetch(`/api/reports/marketing${reportParams.toString() ? `?${reportParams}` : ''}`),
                ]);

                const marketingData = await marketingRes.json();
                const operationalData = await operationalRes.json();
                const revenueData = await revenueRes.json();
                const marketingReportData = await marketingReportRes.json();

                if (marketingData.success) setMarketingCosts(marketingData.data || []);
                if (operationalData.success) setOperationalCosts(operationalData.data || []);
                if (revenueData.success && revenueData.summary) {
                    setTotalRevenueFromReport(revenueData.summary.totalRevenue || 0);
                } else {
                    setTotalRevenueFromReport(0);
                }
                if (marketingReportData.success && marketingReportData.summary) {
                    setMarketingCostFromReport(marketingReportData.summary.totalCost || 0);
                } else {
                    setMarketingCostFromReport(0);
                }

                // Bảng tài chính: Clear Từ/Đến ngày → all-time (tất cả tháng); có Từ+Đến → from+to; không thì year+month (tháng).
                const frParams = new URLSearchParams();
                if (useDateRangeFilter && startDate && endDate) {
                    frParams.append('from', startDate);
                    frParams.append('to', endDate);
                } else if (!startDate && !endDate) {
                    // Không gửi year/month/from/to → API trả về tổng tất cả tháng
                } else {
                    const d = startDate ? new Date(startDate + 'T00:00:00') : new Date();
                    const y = d.getFullYear();
                    const m = d.getMonth() + 1;
                    frParams.append('year', String(y));
                    frParams.append('month', String(m));
                }
                const frQuery = frParams.toString() ? `?${frParams}` : '';
                const frRes = await fetch(`/api/reports/financial${frQuery}`);
                const frData = await frRes.json();
                if (frRes.ok && frData.success) {
                    setFinancialRows(frData.rows || []);
                    setFinancialSummary(frData.summary || null);
                } else {
                    setFinancialRows([]);
                    setFinancialSummary(null);
                }
            } catch (error) {
                console.error('Lỗi khi tải chi phí:', error);
            }
        };
        loadCosts();
    }, [startDate, endDate, useDateRangeFilter, refreshKey]);

    // Hiển thị theo database: ưu tiên summary từ financial API (financialreports / financial_reports_daily), không tính lại
    const financialData = useMemo(() => {
        if (financialSummary) {
            // Chi phí marketing: ưu tiên theo báo cáo marketing để đồng nhất 2 tab
            const mkCost = Number(
                (marketingCostFromReport && marketingCostFromReport > 0
                    ? marketingCostFromReport
                    : financialSummary.marketingCost) ?? 0
            );
            return {
                totalRevenue: Number(financialSummary.totalRevenue ?? 0),
                marketingCost: mkCost,
                operationalCost: Number(financialSummary.operationalCost ?? 0),
                totalCost: mkCost + Number(financialSummary.operationalCost ?? 0),
                profit:
                    Number(financialSummary.totalRevenue ?? 0) -
                    (mkCost + Number(financialSummary.operationalCost ?? 0)),
                profitMargin: (() => {
                    const revenue = Number(financialSummary.totalRevenue ?? 0);
                    const profit =
                        revenue - (mkCost + Number(financialSummary.operationalCost ?? 0));
                    return revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : '0.00';
                })(),
                serviceGroupData: [],
            };
        }

        let filteredCustomers = [...customers];
        if (startDate) {
            const start = new Date(startDate + 'T00:00:00');
            filteredCustomers = filteredCustomers.filter(c => new Date(c.createAt) >= start);
        }
        if (endDate) {
            const end = new Date(endDate + 'T23:59:59.999');
            filteredCustomers = filteredCustomers.filter(c => new Date(c.createAt) <= end);
        }
        if (sourceFilter !== 'all') {
            filteredCustomers = filteredCustomers.filter(c => {
                const sourceId = c.source ? String(c.source._id || c.source) : '';
                return sourceId === sourceFilter;
            });
        }

        let totalRevenue = totalRevenueFromReport || 0;
        if (totalRevenue === 0) {
            filteredCustomers.forEach(c => {
                if (c.serviceDetails && Array.isArray(c.serviceDetails)) {
                    c.serviceDetails.forEach(sd => {
                        if ((sd.status === 'completed' || sd.approvalStatus === 'approved') && sd.totalAmount) {
                            totalRevenue += sd.totalAmount;
                        }
                    });
                }
            });
        }
        let marketingCost = marketingCostFromReport || 0;
        if (marketingCost === 0 && marketingCosts.length > 0) {
            marketingCost = marketingCosts.reduce((sum, cost) => sum + (cost.amount || 0), 0);
        }
        const operationalCost = operationalCosts.reduce((sum, cost) => sum + (cost.amount || 0), 0);
        const totalCost = marketingCost + operationalCost;
        const profit = totalRevenue - totalCost;
        const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(2) : 0;

        // Bảng theo nhóm dịch vụ
        const serviceGroupData = {};
        filteredCustomers.forEach(c => {
            if (c.serviceDetails && Array.isArray(c.serviceDetails)) {
                c.serviceDetails.forEach(sd => {
                    if (sd.status === 'approved' && sd.totalAmount && sd.selectedService) {
                        const serviceId = String(sd.selectedService._id || sd.selectedService);
                        if (!serviceGroupData[serviceId]) {
                            serviceGroupData[serviceId] = {
                                service: sd.selectedService,
                                revenue: 0,
                                cost: 0,
                            };
                        }
                        serviceGroupData[serviceId].revenue += sd.totalAmount;
                    }
                });
            }
        });

        // Tính chi phí cho từng dịch vụ (phân bổ theo tỷ lệ doanh thu)
        Object.values(serviceGroupData).forEach(group => {
            if (totalRevenue > 0) {
                group.cost = (group.revenue / totalRevenue) * totalCost;
            }
        });

        return {
            totalRevenue,
            marketingCost,
            operationalCost,
            totalCost,
            profit,
            profitMargin,
            serviceGroupData: Object.values(serviceGroupData).map(group => ({
                service: group.service?.name || 'Không xác định',
                revenue: group.revenue,
                cost: group.cost,
                profit: group.revenue - group.cost,
                margin: group.revenue > 0 ? (((group.revenue - group.cost) / group.revenue) * 100).toFixed(2) : 0,
            })),
        };
    }, [financialSummary, customers, startDate, endDate, sourceFilter, serviceFilter, marketingCosts, operationalCosts, totalRevenueFromReport, marketingCostFromReport]);

    const handleDownload = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Bao cao tai chinh');

        worksheet.columns = [
            { header: 'Nhóm dịch vụ', key: 'serviceName', width: 30 },
            { header: 'Doanh thu', key: 'revenue', width: 20 },
            { header: 'Chi phí', key: 'cost', width: 20 },
            { header: 'Lợi nhuận', key: 'profit', width: 20 },
            { header: 'Biên %', key: 'margin', width: 12 },
        ];

        const rows = (financialRows.length ? financialRows : financialData.serviceGroupData) || [];

        rows.forEach((row, idx) => {
            const serviceName = row.serviceName || row.service || 'Không xác định';
            const revenue = row.revenue || 0;
            const cost = row.cost || 0;
            const profit = row.profit != null ? row.profit : (revenue - cost);
            const marginValue =
                row.margin != null
                    ? row.margin
                    : revenue > 0
                        ? (((revenue - cost) / revenue) * 100).toFixed(2)
                        : 0;

            worksheet.addRow({
                serviceName,
                revenue,
                cost,
                profit,
                margin: marginValue,
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bao-cao-tai-chinh.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex-1 space-y-4 py-4 pt-6 min-h-screen">
            {/* Filters */}
            <Card className="shadow-md">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Bộ lọc</CardTitle>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            title="Mô tả chức năng"
                            onClick={() => setDocOpen(true)}
                            className="inline-flex items-center justify-center rounded-[6px] border px-2 py-2 text-xs"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        >
                            <BookOpenText className="w-4 h-4" style={{ color: '#f97316' }} />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setSourceFilter('all');
                                setServiceFilter('all');
                                setUseDateRangeFilter(false);
                                const { from, to } = getDefaultMonthRange();
                                setStartDate(from);
                                setEndDate(to);
                            }}
                            className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        >
                            <RefreshCw className="w-4 h-4" /> Đặt lại bộ lọc
                        </button>
                        <button
                            type="button"
                            onClick={() => setDevTriggerOpen(true)}
                            className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-xs"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        >
                            Dev Manual Trigger
                        </button>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {/* <Listbox label="Nguồn" options={sourceOptions} value={sourceFilter} onChange={setSourceFilter} /> */}
                    {/* <Listbox label="Dịch vụ" options={serviceOptions} value={serviceFilter} onChange={setServiceFilter} /> */}
                    <div>
                        <label className="block mb-2 text-sm text-muted-foreground">Từ ngày</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                                setStartDate(e.target.value);
                                setUseDateRangeFilter(true);
                            }}
                            className="w-full rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>
                    <div>
                        <label className="block mb-2 text-sm text-muted-foreground">Đến ngày</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => {
                                setEndDate(e.target.value);
                                setUseDateRangeFilter(true);
                            }}
                            className="w-full rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Cards */}
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
                <StatCard
                    title="Tổng doanh thu"
                    value={`${financialData.totalRevenue.toLocaleString()} VNĐ`}
                    icon={DollarSign}
                    color="#10b981"
                />
                <StatCard
                    title="Chi phí marketing"
                    value={`${financialData.marketingCost.toLocaleString()} VNĐ`}
                    icon={DollarSign}
                    color="#ef4444"
                />
                <StatCard
                    title="Chi phí vận hành"
                    value={`${financialData.operationalCost.toLocaleString()} VNĐ`}
                    icon={DollarSign}
                    color="#f59e0b"
                />
                <StatCard
                    title="Tổng chi phí"
                    value={`${financialData.totalCost.toLocaleString()} VNĐ`}
                    icon={DollarSign}
                    color="#ef4444"
                />
                <StatCard
                    title="Lợi nhuận"
                    value={`${financialData.profit.toLocaleString()} VNĐ`}
                    icon={DollarSign}
                    color={financialData.profit >= 0 ? "#10b981" : "#ef4444"}
                />
                <StatCard
                    title="Biên lợi nhuận"
                    value={`${financialData.profitMargin}%`}
                    icon={DollarSign}
                    color={parseFloat(financialData.profitMargin) >= 0 ? "#10b981" : "#ef4444"}
                />
            </div>

            {/* Table */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Bảng Tài chính</CardTitle>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm hover:bg-muted"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <Plus className="w-4 h-4" /> Nhập chi phí vận hành
                        </button>
                        <button
                            className="text-xs text-muted-foreground hover:text-foreground"
                            type="button"
                            onClick={handleDownload}
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="max-h-[400px] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-xs">Nhóm dịch vụ</TableHead>
                                    <TableHead className="text-xs text-right">Doanh thu</TableHead>
                                    <TableHead className="text-xs text-right">Chi phí</TableHead>
                                    <TableHead className="text-xs text-right">Lợi nhuận</TableHead>
                                    <TableHead className="text-xs text-right">Biên %</TableHead>
                                </TableRow>
                            </TableHeader>
                                <TableBody>
                                    {(financialRows.length ? financialRows : financialData.serviceGroupData).map((row, idx) => {
                                        const serviceName = row.serviceName || row.service || 'Không xác định';
                                        const revenue = row.revenue || 0;
                                        const cost = row.cost || 0;
                                        const profit = row.profit != null ? row.profit : (revenue - cost);
                                        const margin = row.margin != null ? row.margin : row.margin;
                                        return (
                                            <TableRow key={row.serviceId ?? idx}>
                                                <TableCell className="text-xs">{serviceName}</TableCell>
                                                <TableCell className="text-xs text-right">{revenue.toLocaleString()} VNĐ</TableCell>
                                                <TableCell className="text-xs text-right">{cost.toLocaleString()} VNĐ</TableCell>
                                                <TableCell className="text-xs text-right">
                                                    <span style={{ color: profit >= 0 ? '#10b981' : '#ef4444' }}>
                                                        {profit.toLocaleString()} VNĐ
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-xs text-right">
                                                    <Badge variant={parseFloat(margin) > 0 ? 'default' : 'destructive'}>
                                                        {margin}%
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <OperationalCostModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={() => {
                    setUseDateRangeFilter(false);
                    const { from, to } = getDefaultMonthRange();
                    setStartDate(from);
                    setEndDate(to);
                    setRefreshKey((k) => k + 1);
                }}
                services={services}
            />

            <DevManualTriggerModal
                open={devTriggerOpen}
                onClose={() => setDevTriggerOpen(false)}
            />

            {/* <Popup
                open={docOpen}
                onClose={() => setDocOpen(false)}
                header="Mô tả chức năng - Báo cáo tài chính"
            >
                <div className="space-y-2 text-sm">
                    <p>Hiển thị tổng doanh thu, chi phí marketing, chi phí vận hành, tổng chi phí, lợi nhuận và biên lợi nhuận theo thời gian.</p>
                    <p>Bảng Tài chính cho biết doanh thu, chi phí, lợi nhuận và biên % của từng nhóm dịch vụ.</p>
                    <p>Bộ lọc cho phép xem theo tháng hiện tại hoặc theo một khoảng ngày cụ thể.</p>
                </div>
            </Popup> */}
            <Popup
                open={docOpen}
                onClose={() => setDocOpen(false)}
                header="Mô tả chức năng - Báo cáo tài chính"
            >
                <div className="space-y-3 text-sm">
                    <p>
                        Báo cáo tài chính hiển thị hiệu quả hoạt động theo khoảng thời gian được chọn.
                    </p>

                    <div>
                        <p className="font-medium">Các chỉ số tổng:</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><b>Tổng doanh thu:</b> Tổng tiền từ các đơn đã hoàn thành.</li>
                            <li><b>Chi phí marketing:</b> Tổng chi phí quảng cáo đã nhập bên báo cáo marketing.</li>
                            <li><b>Chi phí vận hành:</b> Chi phí nội bộ như lương, mặt bằng, vật tư... ở phần Nhập chi phí vận hành</li>
                            <li><b>Tổng chi phí:</b> = Marketing + Vận hành.</li>
                            <li><b>Lợi nhuận:</b> = Doanh thu - Tổng chi phí.</li>
                            <li><b>Biên lợi nhuận:</b> = (Lợi nhuận / Doanh thu) × 100%.</li>
                        </ul>
                    </div>

                    <div>
                        <p className="font-medium">Bảng tài chính theo nhóm dịch vụ:</p>
                        <p>
                            Hiển thị doanh thu, chi phí vận hành, lợi nhuận và biên lợi nhuận của từng nhóm dịch vụ.
                        </p>
                    </div>

                    <p className="text-gray-500">
                        Lưu ý: Nếu doanh thu bằng 0, biên lợi nhuận sẽ hiển thị 0% để tránh lỗi chia cho 0.
                        <b>Nút Dev Manual Trigger</b> chỉ dùng để xử lý vấn đề dữ liệu, không thể tự sử dụng thao tác.
                    </p>
                </div>
            </Popup>
        </div>
    );
}

