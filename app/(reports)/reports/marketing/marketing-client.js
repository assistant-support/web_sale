'use client';

import { useState, useRef, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, RefreshCw, Download, Plus, Loader2 } from 'lucide-react';
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

function MarketingCostModal({ open, onClose, sources = [], messageSources = [], onSave }) {
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

    const handleSubmit = async () => {
        if (!source || !startDate || !endDate || !amount) {
            alert('Vui lòng điền đầy đủ thông tin');
            return;
        }

        setLoading(true);
        try {
            const selected = sourceOptions.find((opt) => opt.value === source);
            const sourceType = selected?.type || 'form';
            const res = await fetch('/api/reports/marketing-cost', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source, sourceType, startDate, endDate, amount: Number(amount), note }),
            });

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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [data, setData] = useState({
        summary: { totalRevenue: 0, totalCost: 0, roi: 0 },
        channels: [],
    });

    const fetchReport = async (from, to) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            // Nếu có đủ từ ngày & đến ngày → lọc theo khoảng
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
        fetchReport(startDate, endDate);
    }, [startDate, endDate]);

    const handleResetFilter = () => {
        const { from, to } = getDefaultMonthRange();
        setStartDate(from);
        setEndDate(to);
    };

    const refreshReport = () => fetchReport(startDate, endDate);

    const { summary, channels } = data;

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
                    <button
                        type="button"
                        onClick={handleResetFilter}
                        className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                    >
                        <RefreshCw className="w-4 h-4" /> Đặt lại bộ lọc
                    </button>
                </CardHeader>
                <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
                            onClick={() => setModalOpen(true)}
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
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {channels.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
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
                onClose={() => setModalOpen(false)}
                sources={sources}
                messageSources={messageSources}
                onSave={refreshReport}
            />
        </div>
    );
}
