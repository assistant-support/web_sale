'use client';

import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneForwarded, CalendarPlus, PhoneMissed, Percent, History } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// --- Sub Components ---

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
            title: { display: true, text: 'Kết quả Cuộc gọi', font: { size: 16 } },
        },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    };
    return <Bar options={options} data={chartData} />;
};

const CallLogTable = ({ callLogs }) => (
    <Card className="shadow-lg col-span-1 lg:col-span-2">
        <CardHeader>
            <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5" />Nhật ký Cuộc gọi Gần đây</CardTitle>
            <CardDescription>Danh sách các cuộc gọi được thực hiện bởi Telesale.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="max-h-[400px] overflow-y-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary">
                        <TableRow>
                            <TableHead>Khách hàng</TableHead>
                            <TableHead>Kết quả</TableHead>
                            <TableHead className="text-right">Thời gian</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {callLogs.map((log, index) => (
                            <TableRow key={index}>
                                <TableCell className="font-medium">{log.customerName}</TableCell>
                                <TableCell><Badge variant={log.badgeVariant}>{log.outcome}</Badge></TableCell>
                                <TableCell className="text-right text-xs">{new Date(log.calledAt).toLocaleString('vi-VN')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
    </Card>
);

// --- Main Client Component ---
export default function TelesalesReportClient({ initialData }) {

    const { stats, chartData, callLogs } = useMemo(() => {
        const logs = [];
        let scheduled = 0, noContact = 0, connected = 0;

        initialData.forEach(customer => {
            customer.care
                .filter(c => c.step === 4)
                .forEach(c => {
                    let outcome = 'Đã kết nối';
                    let badgeVariant = 'default';
                    const content = c.content.toLowerCase();

                    if (content.includes('không liên lạc được')) {
                        noContact++;
                        outcome = 'Không liên lạc được';
                        badgeVariant = 'destructive';
                    } else {
                        connected++;
                        if (content.includes('đặt lịch hẹn')) {
                            scheduled++;
                            outcome = 'Đặt lịch hẹn thành công';
                            badgeVariant = 'success';
                        } else if (content.includes('không quan tâm')) {
                            outcome = 'Không quan tâm';
                            badgeVariant = 'secondary';
                        } else if (content.includes('gọi lại')) {
                            outcome = 'Yêu cầu gọi lại';
                            badgeVariant = 'outline';
                        }
                    }

                    logs.push({
                        customerName: customer.name,
                        outcome: outcome,
                        calledAt: c.createAt,
                        badgeVariant: badgeVariant
                    });
                });
        });

        const totalCalls = logs.length;
        const connectionRate = totalCalls > 0 ? (connected / totalCalls) * 100 : 0;

        return {
            stats: {
                totalCalls: totalCalls,
                connectionRate: `${connectionRate.toFixed(1)}%`,
                appointmentsScheduled: scheduled,
                noContactCount: noContact,
            },
            chartData: {
                labels: ['Đã kết nối', 'Đặt được lịch', 'Không liên lạc'],
                datasets: [{
                    label: 'Số lượng',
                    data: [connected, scheduled, noContact],
                    backgroundColor: ['rgba(59, 130, 246, 0.7)', 'rgba(22, 163, 74, 0.7)', 'rgba(239, 68, 68, 0.7)'],
                }]
            },
            callLogs: logs.sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt))
        };
    }, [initialData]);

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 bg-gray-50 min-h-screen">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Tổng cuộc gọi" value={stats.totalCalls} icon={Phone} description="Tổng số cuộc gọi đã thực hiện" color="#3b82f6" />
                <StatCard title="Tỷ lệ kết nối" value={stats.connectionRate} icon={Percent} description="Tỷ lệ cuộc gọi kết nối thành công" color="#10b981" />
                <StatCard title="Số lịch đặt" value={stats.appointmentsScheduled} icon={CalendarPlus} description="Số lịch hẹn chốt được qua cuộc gọi" color="#8b5cf6" />
                <StatCard title="Không liên lạc được" value={stats.noContactCount} icon={PhoneMissed} description="Số cuộc gọi không kết nối được" color="#ef4444" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle>Biểu đồ Kết quả Cuộc gọi</CardTitle>
                        <CardDescription>Phân tích các kết quả chính từ Telesale.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px] relative">
                        <CallOutcomeChart chartData={chartData} />
                    </CardContent>
                </Card>
                <CallLogTable callLogs={callLogs} />
            </div>
        </div>
    );
}
