'use client';

import { useState, useEffect, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, History, RefreshCw } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

// --- Sub Components (Giữ trong cùng file theo yêu cầu) ---

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

const AssignmentLogTable = ({ logs }) => (
    <Card className="shadow-lg col-span-1 lg:col-span-2">
        <CardHeader>
            <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5" />Lịch sử phân bổ gần đây</CardTitle>
            <CardDescription>Danh sách các leads được phân bổ gần đây nhất.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="max-h-[400px] overflow-y-auto">
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
                        {logs.length > 0 ? logs.map((log, index) => (
                            <TableRow key={index}>
                                <TableCell>
                                    <div className="font-medium">{log.customerName}</div>
                                    <div className="text-xs text-muted-foreground">{log.zaloName || 'N/A'}</div>
                                </TableCell>
                                <TableCell>{log.assignedTo.slice(-8)}</TableCell>
                                <TableCell className="hidden md:table-cell"><Badge variant="outline">{log.group}</Badge></TableCell>
                                <TableCell className="text-right text-xs">{new Date(log.assignedAt).toLocaleString('vi-VN')}</TableCell>
                            </TableRow>
                        )) : (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Chưa có dữ liệu.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
    </Card>
);

// --- Main Client Component ---
export default function DashboardClient({ initialData }) {
    const [data, setData] = useState(initialData);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Xử lý và tính toán số liệu
    const { stats, assignmentLog } = useMemo(() => {
        const assigned = data.filter(c => c.pipelineStatus === 'assigned').length;
        const pending = data.filter(c => c.pipelineStatus === 'new_unconfirmed').length;
        const logs = data
            .filter(c => c.assignees && c.assignees.length > 0)
            .flatMap(c => c.assignees.map(a => ({
                customerName: c.name,
                zaloName: c.zaloname,
                assignedTo: a.user,
                group: a.group,
                assignedAt: a.assignedAt,
            })))
            .sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());

        return {
            stats: { total: data.length, assigned, pending },
            assignmentLog: logs,
        };
    }, [data]);

    useEffect(() => {
        // Trong một ứng dụng thực tế, bạn sẽ gọi API tại đây để lấy dữ liệu mới.
        // Hiện tại, chúng ta chỉ giả lập hiệu ứng loading.
        const intervalId = setInterval(async () => {
            setIsRefreshing(true);
            // const newData = await fetch('/api/customers').then(res => res.json()); // Ví dụ gọi API
            // setData(newData);
            await new Promise(resolve => setTimeout(resolve, 500)); // Giả lập độ trễ mạng
            setIsRefreshing(false);
        }, 3000);

        return () => clearInterval(intervalId);
    }, []);

    return (
        <div className="flex-1 space-y-4 md:p-8 pt-4 bg-gray-50 min-h-screen">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <StatCard title="Tổng số Leads" value={stats.total} icon={Users} description="Tổng số leads trong hệ thống" color="#3b82f6" />
                <StatCard title="Đã phân bổ" value={stats.assigned} icon={UserCheck} description="Leads đã được giao cho nhân viên" color="#10b981" />
                <StatCard title="Chờ phân bổ" value={stats.pending} icon={History} description="Leads mới đang chờ được xử lý" color="#f59e0b" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle>Phân bổ Leads</CardTitle>
                        <CardDescription>Tỷ lệ leads đã phân bổ và đang chờ.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px] relative">
                        <LeadsDistributionChart assigned={stats.assigned} pending={stats.pending} />
                    </CardContent>
                </Card>
                <AssignmentLogTable logs={assignmentLog} />
            </div>
        </div>
    );
}