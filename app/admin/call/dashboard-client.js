// app/(wherever)/TelesalesReportClient.jsx
'use client';

import { useMemo } from 'react';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneMissed, Percent, History, PhoneForwarded } from 'lucide-react';

import RecordingPlayer from "@/components/call/RecordingPlayer"; // ⬅️ player API stream đã làm

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ---------- helpers ----------
const fmtTime = (d) => new Date(d).toLocaleString('vi-VN');
const fmtDur = (s = 0) => {
    const n = Number(s) || 0;
    const mm = Math.floor(n / 60);
    const ss = n % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

const statusToBadge = (st) => {
    switch (st) {
        case 'completed': return { label: 'Thành công', variant: 'default' };
        case 'no_answer': return { label: 'Không liên lạc', variant: 'destructive' };
        case 'missed': return { label: 'Bỏ lỡ', variant: 'destructive' };
        case 'rejected': return { label: 'Từ chối', variant: 'secondary' };
        case 'busy': return { label: 'Máy bận', variant: 'secondary' };
        case 'voicemail': return { label: 'Voicemail', variant: 'outline' };
        case 'ongoing': return { label: 'Đang diễn ra', variant: 'outline' };
        case 'failed':
        default: return { label: 'Lỗi kỹ thuật', variant: 'destructive' };
    }
};

// ---------- sub components ----------
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

const CallOutcomeChart = ({ chartData }) => {
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: 'Phân bố trạng thái cuộc gọi', font: { size: 16 } },
        },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    };
    return <Bar options={options} data={chartData} />;
};

const CallLogTable = ({ rows }) => (
    <Card className="shadow-lg col-span-1 lg:col-span-2">
        <CardHeader>
            <CardTitle className="flex items-center">
                <History className="mr-2 h-5 w-5" />
                Nhật ký cuộc gọi gần đây
            </CardTitle>
            <CardDescription>Danh sách cuộc gọi mới nhất.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="max-h-[480px] overflow-y-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary">
                        <TableRow>
                            <TableHead>Khách hàng</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead className="text-center">Thời lượng</TableHead>
                            <TableHead className="text-right">Thời điểm</TableHead>
                            <TableHead className="text-right">Ghi âm</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r) => {
                            const badge = statusToBadge(r.status);
                            return (
                                <TableRow key={r._id}>
                                    <TableCell className="font-medium">
                                        <div className="flex flex-col">
                                            <span>{r.customer?.name || 'Khách'}</span>
                                            <span className="text-xs text-muted-foreground">{r.customer?.zaloname || ''}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={badge.variant}>{badge.label}</Badge>
                                    </TableCell>
                                    <TableCell className="text-center font-mono text-xs">
                                        {fmtDur(r.duration)}
                                    </TableCell>
                                    <TableCell className="text-right text-xs">{fmtTime(r.createdAt)}</TableCell>
                                    <TableCell className="text-right">
                                        {r.file ? (
                                            <div className="inline-flex w-72 max-w-full">
                                                <RecordingPlayer callId={r._id} />
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
    </Card>
);

// ---------- main ----------
export default function TelesalesReportClient({ initialData = [] }) {
    const {
        stats, chartData, tableRows
    } = useMemo(() => {
        const calls = Array.isArray(initialData) ? initialData : [];

        // nhóm đếm
        let completed = 0;
        let noContact = 0;         // no_answer + missed
        let rejectedBusy = 0;      // rejected + busy
        let failed = 0;            // failed
        let voicemail = 0;
        let ongoing = 0;

        // thời lượng TB của cuộc gọi thành công
        let successDurTotal = 0;
        let successDurCount = 0;

        calls.forEach(c => {
            const st = c.status;
            switch (st) {
                case 'completed':
                    completed += 1;
                    if (Number(c.duration) > 0) {
                        successDurTotal += Number(c.duration);
                        successDurCount += 1;
                    }
                    break;
                case 'no_answer':
                case 'missed':
                    noContact += 1;
                    break;
                case 'rejected':
                case 'busy':
                    rejectedBusy += 1;
                    break;
                case 'voicemail':
                    voicemail += 1;
                    break;
                case 'ongoing':
                    ongoing += 1;
                    break;
                case 'failed':
                default:
                    failed += 1;
                    break;
            }
        });

        const total = calls.length;
        const connectionRate = total ? (completed / total) * 100 : 0;
        const avgSuccessDur = successDurCount ? Math.round(successDurTotal / successDurCount) : 0;

        const chart = {
            labels: ['Thành công', 'Không liên lạc', 'Bận/Từ chối', 'Voicemail', 'Lỗi', 'Đang diễn ra'],
            datasets: [{
                label: 'Số lượng',
                data: [completed, noContact, rejectedBusy, voicemail, failed, ongoing],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',    // blue
                    'rgba(239, 68, 68, 0.7)',     // red
                    'rgba(107, 114, 128, 0.7)',   // gray
                    'rgba(234, 179, 8, 0.7)',     // amber
                    'rgba(244, 63, 94, 0.7)',     // rose
                    'rgba(16, 185, 129, 0.7)',    // emerald
                ],
            }],
        };

        const rows = [...calls].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

        return {
            stats: {
                totalCalls: total,
                connectionRate: `${connectionRate.toFixed(1)}%`,
                avgSuccessDur: fmtDur(avgSuccessDur),
                noContactCount: noContact,
            },
            chartData: chart,
            tableRows: rows,
        };
    }, [initialData]);

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 bg-gray-50 min-h-screen">
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Tổng cuộc gọi"
                    value={stats.totalCalls}
                    icon={Phone}
                    description="Tổng số cuộc gọi đã ghi nhận"
                    color="#3b82f6"
                />
                <StatCard
                    title="Tỷ lệ kết nối"
                    value={stats.connectionRate}
                    icon={Percent}
                    description="Thành công / Tổng cuộc gọi"
                    color="#10b981"
                />
                <StatCard
                    title="Thời lượng TB (thành công)"
                    value={stats.avgSuccessDur}
                    icon={PhoneForwarded}
                    description="Chỉ tính các cuộc gọi thành công"
                    color="#8b5cf6"
                />
                <StatCard
                    title="Không liên lạc được"
                    value={stats.noContactCount}
                    icon={PhoneMissed}
                    description="Gồm: không bắt máy & bỏ lỡ"
                    color="#ef4444"
                />
            </div>

            {/* Chart + Table */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle>Biểu đồ trạng thái cuộc gọi</CardTitle>
                        <CardDescription>Phân tích theo nhóm trạng thái.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px] relative">
                        <CallOutcomeChart chartData={chartData} />
                    </CardContent>
                </Card>

                <CallLogTable rows={tableRows} />
            </div>
        </div>
    );
}
