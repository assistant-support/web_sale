'use client';

import { useState, useRef, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, RefreshCw, Download, Loader2 } from 'lucide-react';

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

export default function RevenueReportClient() {
    const defaultRange = getDefaultMonthRange();
    const [startDate, setStartDate] = useState(defaultRange.from);
    const [endDate, setEndDate] = useState(defaultRange.to);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState({
        summary: { totalRevenue: 0, totalOrders: 0, totalCustomers: 0, topService: '—' },
        services: [],
    });

    const fetchReport = async (from, to) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ from, to });
            const res = await fetch(`/api/reports/revenue?${params}`);
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Không tải được báo cáo');
            }
            setData({
                summary: json.summary || data.summary,
                services: json.services || [],
            });
        } catch (e) {
            setError(e.message);
            setData(prev => ({ ...prev }));
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

    const { summary, services } = data;

    const handleDownload = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Doanh thu theo dịch vụ');

        worksheet.columns = [
            { header: 'Dịch vụ', key: 'serviceName', width: 30 },
            { header: 'Doanh thu', key: 'totalRevenue', width: 20 },
            { header: 'Số đơn', key: 'totalOrders', width: 15 },
        ];

        (services || []).forEach((sr) => {
            worksheet.addRow({
                serviceName: sr.serviceName || '',
                totalRevenue: sr.totalRevenue || 0,
                totalOrders: sr.totalOrders ?? 0,
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bao-cao-doanh-thu-dich-vu.xlsx';
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

            {/* Cards: Tổng doanh thu (mặc định tháng này), Top dịch vụ (số người sử dụng nhiều nhất), Số khách hàng có doanh thu */}
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
                            title="Top dịch vụ (nhiều người sử dụng nhất)"
                            value={summary.topService}
                            icon={DollarSign}
                            color="#6366f1"
                        />
                        <StatCard
                            title="Số khách hàng có doanh thu"
                            value={summary.totalCustomers}
                            icon={DollarSign}
                            color="#f59e0b"
                        />
                    </>
                )}
            </div>

            {/* Bảng dịch vụ: Dịch vụ | Doanh thu (từ dịch vụ đó) | Số đơn (từ dịch vụ đó) */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Bảng dịch vụ</CardTitle>
                    <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        type="button"
                        onClick={handleDownload}
                    >
                        <Download className="w-4 h-4" />
                    </button>
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
                                        <TableHead className="text-xs">Dịch vụ</TableHead>
                                        <TableHead className="text-xs text-right">Doanh thu</TableHead>
                                        <TableHead className="text-xs text-right">Số đơn</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {services.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-8">
                                                Không có dữ liệu trong khoảng ngày đã chọn
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        services.map((sr, idx) => (
                                            <TableRow key={sr.serviceId?.$oid ?? sr.serviceId ?? idx}>
                                                <TableCell className="text-xs">{sr.serviceName || '—'}</TableCell>
                                                <TableCell className="text-xs text-right">{formatVnd(sr.totalRevenue || 0)}</TableCell>
                                                <TableCell className="text-xs text-right">{sr.totalOrders ?? 0}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
