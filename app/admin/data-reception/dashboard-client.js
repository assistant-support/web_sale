'use client';

import { useState, useEffect, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle, AlertTriangle, Copy, Clock, History } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

// --- Sub Components (Giữ trong cùng file) ---

const StatCard = ({ title, value, icon: Icon, description, color }) => (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4" style={{ borderLeftColor: color }}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-5 w-5 text-muted-foreground" style={{ color }} />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            <h5 className="text-xs text-muted-foreground">{description}</h5>
        </CardContent>
    </Card>
);

const DataQualityChart = ({ valid, missing, duplicate }) => {
    const data = {
        labels: ['Hợp lệ', 'Thiếu thông tin', 'Trùng lặp'],
        datasets: [{
            label: 'Chất lượng Data',
            data: [valid, missing, duplicate],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
            borderColor: ['#059669', '#d97706', '#dc2626'],
            borderWidth: 1,
        }],
    };
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            title: { display: true, text: 'Tỷ lệ chất lượng Data', font: { size: 16 } },
        },
    };
    return <Doughnut data={data} options={options} />;
};

const ReceptionLogTable = ({ logs }) => (
    <Card className="shadow-lg col-span-1 lg:col-span-2">
        <CardHeader>
            <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5" />Log Tiếp nhận Data</CardTitle>
            <CardDescription>Danh sách data được ghi nhận vào hệ thống gần đây nhất.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="max-h-[400px] overflow-y-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary">
                        <TableRow>
                            <TableHead>Khách hàng</TableHead>
                            <TableHead>Nguồn</TableHead>
                            <TableHead className="hidden md:table-cell">Người nhập</TableHead>
                            <TableHead className="text-right">Thời gian</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {logs.length > 0 ? logs.map((log) => (
                            <TableRow key={log.id}>
                                <TableCell className="font-medium">{log.customerName}</TableCell>
                                <TableCell><Badge variant="outline">{log.source}</Badge></TableCell>
                                <TableCell className="hidden md:table-cell">{log.createdBy.slice(-8)}</TableCell>
                                <TableCell className="text-right text-xs">{new Date(log.createdAt).toLocaleString('vi-VN')}</TableCell>
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
export default function DataReceptionClient({ initialData }) {
    const [data] = useState(initialData);

    // Xử lý và tính toán số liệu
    const { stats, receptionLog } = useMemo(() => {
        let validCount = 0;
        let duplicateCount = 0;
        let missingInfoCount = 0;
        let totalResponseTime = 0;
        let leadsWithResponse = 0;

        const log = data.map(customer => {
            // Check for duplicates
            const isDuplicate = customer.care.some(c => c.content.includes("Data trùng"));
            if (isDuplicate) {
                duplicateCount++;
            }

            // Check for missing info (định nghĩa đơn giản: thiếu tên hoặc sđt)
            if (!customer.name || !customer.phone) {
                missingInfoCount++;
            } else if (!isDuplicate) {
                // Chỉ tính là hợp lệ nếu không trùng và không thiếu thông tin
                validCount++;
            }

            // Calculate average response time
            if (customer.care.length > 1) {
                const createTime = new Date(customer.createAt).getTime();
                const firstActionTime = new Date(customer.care[1].createAt).getTime();
                totalResponseTime += (firstActionTime - createTime);
                leadsWithResponse++;
            }

            // Prepare log entry
            const creatorLog = customer.care.find(c => c.content.includes("thêm thủ công"));
            const createdBy = creatorLog ? creatorLog.createBy : 'System';

            return {
                id: customer._id,
                customerName: customer.name,
                source: customer.source?.name || 'N/A',
                createdBy: createdBy,
                createdAt: customer.createAt,
            };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const avgResponseTime = leadsWithResponse > 0 ? totalResponseTime / leadsWithResponse / 1000 : 0; // in seconds

        return {
            stats: {
                total: data.length,
                valid: validCount,
                missing: missingInfoCount,
                duplicate: duplicateCount,
                avgResponseTime: avgResponseTime.toFixed(2) + ' giây'
            },
            receptionLog: log
        };
    }, [data]);

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 bg-gray-50 min-h-screen">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Tổng Data" value={stats.total} icon={Users} description="Tổng data nhận được" color="#3b82f6" />
                <StatCard title="Data Hợp lệ" value={stats.valid} icon={CheckCircle} description="Data có đủ thông tin, không trùng" color="#10b981" />
                <StatCard title="Data Trùng lặp" value={stats.duplicate} icon={Copy} description="Data bị trùng với hồ sơ đã có" color="#ef4444" />
                <StatCard title="T.gian P.hồi TB" value={stats.avgResponseTime} icon={Clock} description="Thời gian từ khi nhận đến lúc xử lý" color="#8b5cf6" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle>Chất lượng Data</CardTitle>
                        <CardDescription>Tỷ lệ data hợp lệ, thiếu thông tin và trùng lặp.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px] relative">
                        <DataQualityChart valid={stats.valid} missing={stats.missing} duplicate={stats.duplicate} />
                    </CardContent>
                </Card>
                <ReceptionLogTable logs={receptionLog} />
            </div>
        </div>
    );
}