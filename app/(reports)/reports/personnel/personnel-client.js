'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, RefreshCw, Loader2 } from 'lucide-react';

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

export default function PersonnelReportClient() {
    const defaultRange = getDefaultMonthRange();
    const [searchName, setSearchName] = useState('');
    const [startDate, setStartDate] = useState(defaultRange.from);
    const [endDate, setEndDate] = useState(defaultRange.to);

    const handleResetFilter = () => {
        const { from, to } = getDefaultMonthRange();
        setSearchName('');
        setStartDate(from);
        setEndDate(to);
    };

    return (
        <div className="flex-1 space-y-4 py-4 pt-6 min-h-screen">
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
                    <div className="lg:col-span-2">
                        <label className="block mb-2 text-sm text-muted-foreground">Search tên</label>
                        <input
                            type="text"
                            value={searchName}
                            onChange={(e) => setSearchName(e.target.value)}
                            placeholder="Nhập tên nhân viên..."
                            className="w-full rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>
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

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard title="Số lượng nội" value="0" icon={Users} color="#6366f1" />
                <StatCard title="Số lượng ngoại" value="0" icon={Users} color="#f59e0b" />
                <StatCard title="Tỷ lệ đến hẹn" value="0%" icon={Users} color="#10b981" />
                <StatCard title="Tỷ lệ lead hẹn" value="0%" icon={Users} color="#ef4444" />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Báo cáo chất lượng nhân sự</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="max-h-[420px] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-xs">Thời gian</TableHead>
                                    <TableHead className="text-xs">Tên nhân viên</TableHead>
                                    <TableHead className="text-xs">Loại khách hàng</TableHead>
                                    <TableHead className="text-xs">Mã khách hàng</TableHead>
                                    <TableHead className="text-xs">Tên khách hàng</TableHead>
                                    <TableHead className="text-xs">Lịch hẹn</TableHead>
                                    <TableHead className="text-xs">Trạng thái</TableHead>
                                    <TableHead className="text-xs">Cuộc gọi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-10">
                                        <span className="inline-flex items-center gap-2">
                                            <Loader2 className="w-4 h-4" />
                                            Chưa đưa logic vào
                                        </span>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

