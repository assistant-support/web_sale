'use client';

import { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Check, X, UserCheck, Percent, History } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

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

const AppointmentStatusChart = ({ chartData }) => {
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            title: { display: true, text: 'Phân bổ Trạng thái Lịch hẹn', font: { size: 16 } },
        },
    };
    return <Doughnut data={chartData} options={options} />;
};

const AppointmentLogTable = ({ appointments }) => {
    const getStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return <Badge className="bg-green-500 hover:bg-green-600">Hoàn thành</Badge>;
            case 'confirmed':
                return <Badge className="bg-blue-500 hover:bg-blue-600">Đã xác nhận</Badge>;
            case 'pending':
                return <Badge className="bg-yellow-500 hover:bg-yellow-600">Chờ xử lý</Badge>;
            case 'cancelled':
                return <Badge variant="destructive">Đã hủy</Badge>;
            case 'postponed':
                return <Badge className="bg-orange-500 hover:bg-orange-600">Hoãn</Badge>;
            case 'missed':
                return <Badge className="bg-gray-500 hover:bg-gray-600">Không đến</Badge>;
            default:
                return <Badge variant="secondary">Không xác định</Badge>;
        }
    };

    return (
        <Card className="shadow-lg col-span-1 lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5" />Log Lịch hẹn Gần đây</CardTitle>
                <CardDescription>Danh sách các lịch hẹn và trạng thái xử lý.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-secondary">
                            <TableRow>
                                <TableHead>Lịch hẹn</TableHead>
                                <TableHead>Trạng thái</TableHead>
                                <TableHead className="hidden md:table-cell">Ghi chú/Lý do</TableHead>
                                <TableHead className="text-right">Thời gian</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {appointments.map((appt) => (
                                <TableRow key={appt._id}>
                                    <TableCell className="font-medium">{appt.title}</TableCell>
                                    <TableCell>{getStatusBadge(appt.status)}</TableCell>
                                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{appt.notes || 'Không có'}</TableCell>
                                    <TableCell className="text-right text-xs">{new Date(appt.appointmentDate).toLocaleString('vi-VN')}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

// --- Main Client Component ---
export default function AppointmentStatsClient({ initialData }) {

    const { stats, chartData } = useMemo(() => {
        let confirmed = 0, completed = 0, cancelled = 0, postponed = 0, noShow = 0, pending = 0, missed = 0
        initialData.forEach(appt => {
            switch (appt.status) {
                case 'confirmed': confirmed++; break;
                case 'completed': completed++; break;
                case 'postponed': postponed++; break;
                case 'missed': missed++; break;
                case 'pending': pending++; break;
                case 'cancelled': cancelled++; break;
            }
        });

        const totalAttended = completed;
        const totalShouldAttend = completed + noShow;
        const showRate = totalShouldAttend > 0 ? (totalAttended / initialData.length) * 100 : 0;
        console.log(totalAttended ,totalShouldAttend);
        console.log(showRate);
        
        return {
            stats: {
                total: initialData.length,
                attended: totalAttended,
                canceledOrPostponed: missed + cancelled,
                showRate: `${showRate.toFixed(1)}%`
            },
            chartData: {
                labels: ['Hoàn thành', 'Đã xác nhận', 'Chờ xử lý', 'Hủy/Hoãn', 'Không đến'],
                datasets: [{
                    label: 'Số lượng',
                    data: [completed, confirmed, pending, cancelled + postponed, missed],
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6b7280'],
                }]
            }
        };
    }, [initialData]);

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 bg-gray-50 min-h-screen">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Tổng số Lịch hẹn" value={stats.total} icon={Calendar} description="Bao gồm tất cả trạng thái" color="#6366f1" />
                <StatCard title="Khách đã đến" value={stats.attended} icon={UserCheck} description="Lịch hẹn đã hoàn thành" color="#10b981" />
                <StatCard title="Hủy / Hoãn" value={stats.canceledOrPostponed} icon={X} description="Lịch hẹn bị hủy hoặc dời lại" color="#ef4444" />
                <StatCard title="Tỷ lệ đến hẹn" value={stats.showRate} icon={Percent} description="So với lịch hẹn đã qua" color="#f59e0b" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle>Phân bổ Trạng thái</CardTitle>
                        <CardDescription>Tỷ lệ các trạng thái của lịch hẹn.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px] relative">
                        <AppointmentStatusChart chartData={chartData} />
                    </CardContent>
                </Card>
                <AppointmentLogTable appointments={initialData} />
            </div>
        </div>
    );
}
