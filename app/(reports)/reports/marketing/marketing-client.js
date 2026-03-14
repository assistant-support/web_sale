'use client';

import { useState, useRef, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, RefreshCw, Download, Plus, Loader2, BookOpenText, Pencil } from 'lucide-react';
import Popup from '@/components/ui/popup';

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

function getDefaultMonthRange() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const toStr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return { from: toStr(first), to: toStr(last) };
}

function formatVnd(num) {
    if (typeof num !== 'number' || !Number.isFinite(num)) return '0 VNĐ';
    return num.toLocaleString('vi-VN') + ' VNĐ';
}

function MarketingCostModal({
    open,
    onClose,
    sources = [],
    messageSources = [],
    onSave,
    initialSourceId,
    initialStartDate,
    initialEndDate,
    initialAmount,
    initialNote,
    editingCostId,
}) {
    const [source, setSource] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);

    // Cho phép chọn cả kênh form (sources) và kênh tin nhắn (messageSources).
    // - Với form: lưu chi phí vào marketingCosts.channelType='form', source=<ObjectId form>
    // - Với tin nhắn: lưu vào marketingCosts.channelType='message', messageSourceKey=<sourceDetails>
    const sourceOptions = [
        ...(sources || []).map((s) => ({
            value: String(s._id),
            label: s.name,
            type: 'form',
        })),
        ...(messageSources || []).map((s) => ({
            value: String(s._id),
            label: s.name,
            type: 'message',
        })),
    ];

    useEffect(() => {
        if (open) {
            setSource(initialSourceId ? String(initialSourceId) : '');
            setStartDate(initialStartDate ?? '');
            setEndDate(initialEndDate ?? '');
            setAmount(
                initialAmount !== undefined && initialAmount !== null
                    ? String(initialAmount)
                    : ''
            );
            setNote(initialNote ?? '');
        }
    }, [open, initialSourceId, initialStartDate, initialEndDate, initialAmount, initialNote]);

    const handleSubmit = async () => {
        if (!source || !startDate || !endDate || !amount) {
            alert('Vui lòng điền đầy đủ thông tin');
            return;
        }

        setLoading(true);
        try {
            let res;
            if (editingCostId) {
                // Chỉnh sửa 1 bản ghi chi phí
                res = await fetch('/api/reports/marketing-cost', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: editingCostId,
                        startDate,
                        endDate,
                        amount: Number(amount),
                        note,
                    }),
                });
            } else {
                // Thêm chi phí mới
                const selected = sourceOptions.find((opt) => opt.value === source);
                const sourceType = selected?.type || 'form';
                res = await fetch('/api/reports/marketing-cost', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source,
                        sourceType,
                        startDate,
                        endDate,
                        amount: Number(amount),
                        note,
                    }),
                });
            }

            const data = await res.json();
            if (data.success) {
                onSave?.();
                onClose();
                setSource('');
                setStartDate('');
                setEndDate('');
                setAmount('');
                setNote('');
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
            header="Nhập chi phí marketing"
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
                <div style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Công thức chi phí ROI marketing: (Doanh thu - Chi phí) / Chi phí</div>
                <div>
                    <label className="block mb-2 text-sm font-medium">Kênh (Source)</label>
                    <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        <option value="">Chọn kênh</option>
                        {sourceOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
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
                    <label className="block mb-2 text-sm font-medium">Số tiền chi</label>
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
                    <label className="block mb-2 text-sm font-medium">Ghi chú (tùy chọn)</label>
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

export default function MarketingReportClient({ sources = [], messageSources = [] }) {
    const defaultRange = getDefaultMonthRange();
    const [startDate, setStartDate] = useState(defaultRange.from);
    const [endDate, setEndDate] = useState(defaultRange.to);
    /** false = mặc định theo tháng; true = user đã dùng bộ lọc Từ/Đến ngày → lọc theo khoảng */
    const [useDateRangeFilter, setUseDateRangeFilter] = useState(false);
    const [docOpen, setDocOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingSourceId, setEditingSourceId] = useState(null);
    const [editingCostId, setEditingCostId] = useState(null);
    const [editingInitial, setEditingInitial] = useState(null);

    // Popup danh sách chi phí marketing cho từng kênh (theo tài liệu chinhsuamaketing)
    const [costListOpen, setCostListOpen] = useState(false);
    const [costListLoading, setCostListLoading] = useState(false);
    const [costListChannel, setCostListChannel] = useState(null);
    const [costListItems, setCostListItems] = useState([]);

    const [data, setData] = useState({
        summary: { totalRevenue: 0, totalCost: 0, roi: 0 },
        channels: [],
    });

    const fetchReport = async (from, to) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (from && to) {
                params.set('from', from);
                params.set('to', to);
            }
            const query = params.toString();
            const res = await fetch(`/api/reports/marketing${query ? `?${query}` : ''}`);
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Không tải được báo cáo marketing');
            }
            setData({
                summary: json.summary || { totalRevenue: 0, totalCost: 0, roi: 0 },
                channels: json.channels || [],
            });
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const { from, to } = getDefaultMonthRange();
        if (useDateRangeFilter && startDate && endDate) {
            fetchReport(startDate, endDate);
        } else {
            fetchReport(from, to);
        }
    }, [startDate, endDate, useDateRangeFilter]);

    const handleResetFilter = () => {
        setUseDateRangeFilter(false);
        const { from, to } = getDefaultMonthRange();
        setStartDate(from);
        setEndDate(to);
    };

    const refreshReport = () => {
        if (useDateRangeFilter && startDate && endDate) {
            fetchReport(startDate, endDate);
        } else {
            const { from, to } = getDefaultMonthRange();
            fetchReport(from, to);
        }
    };

    const { summary, channels } = data;

    const openCostListPopup = async (row) => {
        try {
            setCostListChannel({ name: row.channel, key: row.sourceId });
            setCostListOpen(true);
            setCostListLoading(true);

            // Xác định khoảng ngày dùng để lấy chi phí (theo filter hiện tại)
            let from = startDate;
            let to = endDate;
            if (!useDateRangeFilter || !startDate || !endDate) {
                const d = getDefaultMonthRange();
                from = d.from;
                to = d.to;
            }

            const params = new URLSearchParams();
            if (from && to) {
                params.set('startDate', from);
                params.set('endDate', to);
            }
            const query = params.toString();
            const res = await fetch(`/api/reports/marketing-cost${query ? `?${query}` : ''}`);
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Không lấy được danh sách chi phí marketing');
            }

            const costs = Array.isArray(json.data) ? json.data : [];
            const key = row.sourceId ? String(row.sourceId) : '';

            console.log('[MarketingCost] openCostListPopup - row', row);
            console.log('[MarketingCost] openCostListPopup - key (sourceId)', key);
            console.log('[MarketingCost] openCostListPopup - raw costs from API', costs);

            const matched = costs.filter((c) => {
                const chanType = c.channelType || 'form';
                const isForm = chanType === 'form';

                if (isForm) {
                    // Khớp theo ObjectId form (source). API đang populate('source'),
                    // nên c.source có thể là ObjectId hoặc object {_id, name}.
                    if (c.source) {
                        const sourceId =
                            typeof c.source === 'object' && c.source._id
                                ? String(c.source._id)
                                : String(c.source);
                        return sourceId === key;
                    }
                    return false;
                }

                // Kênh tin nhắn: so sánh messageSourceKey với sourceId (ở báo cáo marketing là key chuỗi)
                if (c.messageSourceKey) {
                    return String(c.messageSourceKey) === key;
                }
                return false;
            });

            console.log('[MarketingCost] openCostListPopup - matched costs for key', key, matched);

            // Server đã sort createdAt desc, nhưng đảm bảo lại trên client
            matched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            setCostListItems(matched);
        } catch (err) {
            console.error(err);
            alert(err?.message || 'Không thể tải danh sách chi phí marketing');
            setCostListItems([]);
        } finally {
            setCostListLoading(false);
        }
    };

    const handleDownload = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Bao cao marketing');

        worksheet.columns = [
            { header: 'Kênh', key: 'channel', width: 30 },
            { header: 'Lead', key: 'lead', width: 12 },
            { header: 'Booking', key: 'booking', width: 12 },
            { header: 'Hoàn thành', key: 'completed', width: 15 },
            { header: 'Doanh thu', key: 'revenue', width: 20 },
            { header: 'Chi phí', key: 'cost', width: 20 },
            { header: 'ROI (%)', key: 'roi', width: 12 },
        ];

        (channels || []).forEach((row) => {
            worksheet.addRow({
                channel: row.channel || '',
                lead: row.lead ?? 0,
                booking: row.booking ?? 0,
                completed: row.completed ?? 0,
                revenue: row.revenue ?? 0,
                cost: row.cost ?? 0,
                roi: row.roi ?? 0,
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bao-cao-marketing.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex-1 space-y-4 py-4 pt-6 min-h-screen">
            {/* Bộ lọc */}
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
                            onClick={handleResetFilter}
                            className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        >
                            <RefreshCw className="w-4 h-4" /> Đặt lại bộ lọc
                        </button>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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

            {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {/* Cards: Tổng doanh thu, Tổng chi phí marketing, ROI */}
            <div className="grid gap-4 md:grid-cols-3">
                {loading ? (
                    <div className="col-span-3 flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" /> Đang tải báo cáo...
                    </div>
                ) : (
                    <>
                        <StatCard
                            title="Tổng doanh thu"
                            value={formatVnd(summary.totalRevenue)}
                            icon={DollarSign}
                            color="#10b981"
                        />
                        <StatCard
                            title="Tổng chi phí marketing"
                            value={formatVnd(summary.totalCost)}
                            icon={DollarSign}
                            color="#ef4444"
                        />
                        <StatCard
                            title="ROI"
                            value={`${summary.roi}%`}
                            icon={DollarSign}
                            color="#6366f1"
                        />
                    </>
                )}
            </div>

            {/* Bảng Marketing: Kênh | Lead | Booking | Hoàn thành | Doanh thu | Chi phí | ROI */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Bảng Marketing</CardTitle>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                // Thêm mới chi phí, không ràng buộc kênh
                                setEditingSourceId(null);
                                setEditingCostId(null);
                                setEditingInitial(null);
                                setModalOpen(true);
                            }}
                            className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm hover:bg-muted"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <Plus className="w-4 h-4" /> Nhập chi phí marketing
                        </button>
                        <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={handleDownload}
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="max-h-[400px] overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-xs">Kênh</TableHead>
                                        <TableHead className="text-xs text-right">Lead</TableHead>
                                        <TableHead className="text-xs text-right">Booking</TableHead>
                                        <TableHead className="text-xs text-right">Hoàn thành</TableHead>
                                        <TableHead className="text-xs text-right">Doanh thu</TableHead>
                                        <TableHead className="text-xs text-right">Chi phí</TableHead>
                                            <TableHead className="text-xs text-right">ROI</TableHead>
                                            <TableHead className="w-10 text-xs text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {channels.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-8">
                                                Không có dữ liệu kênh trong khoảng ngày đã chọn
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        channels.map((row, idx) => (
                                            <TableRow key={row.sourceId ?? idx}>
                                                <TableCell className="text-xs">{row.channel || '—'}</TableCell>
                                                <TableCell className="text-xs text-right">{row.lead ?? 0}</TableCell>
                                                <TableCell className="text-xs text-right">{row.booking ?? 0}</TableCell>
                                                <TableCell className="text-xs text-right">{row.completed ?? 0}</TableCell>
                                                <TableCell className="text-xs text-right">{formatVnd(row.revenue ?? 0)}</TableCell>
                                                <TableCell className="text-xs text-right">{formatVnd(row.cost ?? 0)}</TableCell>
                                                <TableCell className="text-xs text-right">
                                                    <Badge variant={Number(row.roi) > 0 ? 'default' : 'secondary'}>
                                                        {row.roi}%
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs text-right">
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center justify-center rounded-[4px] border px-1.5 py-1 text-[11px] hover:bg-muted"
                                                        style={{ borderColor: 'var(--border)' }}
                                                        onClick={() => {
                                                            openCostListPopup(row);
                                                        }}
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </CardContent>
            </Card>

            <MarketingCostModal
                open={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setEditingSourceId(null);
                    setEditingCostId(null);
                    setEditingInitial(null);
                }}
                sources={sources}
                messageSources={messageSources}
                onSave={refreshReport}
                initialSourceId={editingSourceId}
                initialStartDate={editingInitial?.startDate}
                initialEndDate={editingInitial?.endDate}
                initialAmount={editingInitial?.amount}
                initialNote={editingInitial?.note}
                editingCostId={editingCostId}
            />

            {/* Popup danh sách chi phí marketing cho một kênh */}
            <Popup
                open={costListOpen}
                onClose={() => {
                    setCostListOpen(false);
                    setCostListItems([]);
                    setCostListChannel(null);
                }}
                header={
                    costListChannel
                        ? `Chi phí marketing - ${costListChannel.name || 'Kênh không xác định'}`
                        : 'Chi phí marketing'
                }
            >
                <div className="space-y-4 text-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                            Danh sách các lần nhập chi phí cho kênh trong khoảng ngày đang lọc.
                        </div>
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-[6px] border px-2 py-1 text-xs hover:bg-muted"
                            style={{ borderColor: 'var(--border)' }}
                            onClick={() => {
                                // Thêm chi phí mới cho kênh hiện tại: mở modal nhập chi phí
                                if (costListChannel?.key) {
                                    setEditingSourceId(costListChannel.key);
                                } else {
                                    setEditingSourceId(null);
                                }
                                // gợi ý khoảng ngày theo filter hiện tại
                                const baseFrom = startDate || getDefaultMonthRange().from;
                                const baseTo = endDate || getDefaultMonthRange().to;
                                setEditingInitial({
                                    startDate: baseFrom,
                                    endDate: baseTo,
                                    amount: '',
                                    note: '',
                                });
                                setEditingCostId(null);
                                setCostListOpen(false);
                                setModalOpen(true);
                            }}
                        >
                            <Plus className="w-3 h-3" /> Thêm chi phí
                        </button>
                    </div>

                    {costListLoading ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải danh sách chi phí...
                        </div>
                    ) : costListItems.length === 0 ? (
                        <div className="text-center text-muted-foreground py-4">
                            Chưa có chi phí marketing cho kênh này trong khoảng ngày đã chọn.
                        </div>
                    ) : (
                        <div className="max-h-[320px] overflow-y-auto border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-xs">Ngày nhập</TableHead>
                                        <TableHead className="text-xs">Từ ngày</TableHead>
                                        <TableHead className="text-xs">Đến ngày</TableHead>
                                        <TableHead className="text-xs text-right">Chi phí</TableHead>
                                        <TableHead className="text-xs">Ghi chú</TableHead>
                                        <TableHead className="w-10 text-xs text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {costListItems.map((item) => {
                                        const created = item.createdAt ? new Date(item.createdAt) : null;
                                        const todayStr = new Date().toISOString().slice(0, 10);
                                        const createdStr = created ? created.toISOString().slice(0, 10) : '';
                                        const startStr = item.startDate
                                            ? new Date(item.startDate).toISOString().slice(0, 10)
                                            : '';
                                        const endStr = item.endDate
                                            ? new Date(item.endDate).toISOString().slice(0, 10)
                                            : '';
                                        const isToday = createdStr === todayStr;

                                        return (
                                            <TableRow key={item._id}>
                                                <TableCell className="text-xs">
                                                    {created
                                                        ? created.toLocaleDateString('vi-VN')
                                                        : '—'}
                                                    {isToday && (
                                                        <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-[1px] text-[10px] font-medium text-emerald-700">
                                                            NEW
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {startStr || '—'}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {endStr || '—'}
                                                </TableCell>
                                                <TableCell className="text-xs text-right">
                                                    {formatVnd(Number(item.amount || 0))}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {item.note || '—'}
                                                </TableCell>
                                                <TableCell className="text-xs text-right">
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center justify-center rounded-[4px] border px-1.5 py-1 text-[11px] hover:bg-muted"
                                                        style={{ borderColor: 'var(--border)' }}
                                                        onClick={() => {
                                                            // Chỉnh sửa bản ghi chi phí cụ thể theo tài liệu chinhsuamaketing
                                                            const chan =
                                                                costListChannel?.key ||
                                                                (item.channelType === 'form'
                                                                    ? item.source?._id || item.source
                                                                    : item.messageSourceKey);
                                                            setEditingSourceId(
                                                                chan ? String(chan) : null
                                                            );

                                                            const startStr = item.startDate
                                                                ? new Date(
                                                                      item.startDate
                                                                  )
                                                                      .toISOString()
                                                                      .slice(0, 10)
                                                                : '';
                                                            const endStr = item.endDate
                                                                ? new Date(item.endDate)
                                                                      .toISOString()
                                                                      .slice(0, 10)
                                                                : '';

                                                            setEditingInitial({
                                                                startDate: startStr,
                                                                endDate: endStr,
                                                                amount: item.amount ?? '',
                                                                note: item.note ?? '',
                                                            });
                                                            setEditingCostId(item._id);
                                                            setCostListOpen(false);
                                                            setModalOpen(true);
                                                        }}
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </Popup>

            <Popup
                open={docOpen}
                onClose={() => setDocOpen(false)}
                header="Mô tả chức năng - Báo cáo marketing"
            >
                <div className="space-y-3 text-sm">

                    <p>
                        Báo cáo marketing hiển thị hiệu quả của từng kênh khách hàng trong khoảng thời gian được chọn.
                    </p>

                    <div>
                        <p className="font-medium">Các chỉ số theo từng kênh:</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><b>Lead:</b> Số khách hàng được tạo mới thuộc kênh đó.</li>
                            <li><b>Booking:</b> Số đơn/lịch hẹn được tạo từ khách thuộc kênh.</li>
                            <li><b>Hoàn thành:</b> Số đơn đã hoàn tất dịch vụ.</li>
                            <li><b>Doanh thu:</b> Tổng tiền từ các đơn hoàn thành.</li>
                            <li><b>Chi phí:</b> Tổng chi phí marketing đã nhập cho kênh.</li>
                            <li><b>ROI:</b> (Doanh thu - Chi phí) / Chi phí × 100%.</li>
                        </ul>
                    </div>

                    <p className="text-gray-500">
                        Lưu ý: Nếu chi phí bằng 0, hệ thống sẽ hiển thị 0% để tránh lỗi chia cho 0.
                    </p>

                    <p>
                        Báo cáo giúp so sánh hiệu quả giữa các kênh để tối ưu ngân sách quảng cáo.
                    </p>

                </div>
            </Popup>
        </div>
    );
}
