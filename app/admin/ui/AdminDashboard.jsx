'use client'

import { useEffect, useRef, useState } from 'react';
import { Chart, ArcElement, Tooltip, Legend, PieController } from 'chart.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';

Chart.register(ArcElement, Tooltip, Legend, PieController);

export default function AdminDashboard({ dashboardData }) {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    const { totalLeads, validLeads, missingInfoLeads, duplicateLeads, missingInfoDetails } = dashboardData;

    useEffect(() => {
        if (chartRef.current) {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
            const ctx = chartRef.current.getContext('2d');
            chartInstance.current = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['Hợp lệ', 'Thiếu thông tin', 'Trùng'],
                    datasets: [{
                        label: 'Tỷ lệ Data',
                        data: [validLeads.count, missingInfoLeads.count, duplicateLeads.count],
                        backgroundColor: [
                            'rgba(75, 192, 192, 0.6)',
                            'rgba(255, 206, 86, 0.6)',
                            'rgba(255, 99, 132, 0.6)',
                        ],
                        borderColor: [
                            'rgba(75, 192, 192, 1)',
                            'rgba(255, 206, 86, 1)',
                            'rgba(255, 99, 132, 1)',
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    let label = context.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed !== null) {
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = total > 0 ? (context.parsed / total * 100).toFixed(1) + '%' : '0%';
                                        label += `${context.raw} (${percentage})`;
                                    }
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        }

        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [validLeads, missingInfoLeads, duplicateLeads]);

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tổng Data</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalLeads}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Data hợp lệ</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{validLeads.count}</div>
                        <p className="text-xs text-muted-foreground">{validLeads.percentage}%</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Thiếu thông tin</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{missingInfoLeads.count}</div>
                        <p className="text-xs text-muted-foreground">{missingInfoLeads.percentage}%</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Data trùng</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{duplicateLeads.count}</div>
                        <p className="text-xs text-muted-foreground">{duplicateLeads.percentage}%</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <CardTitle>Data thiếu thông tin</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[350px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tên</TableHead>
                                        <TableHead>Số điện thoại</TableHead>
                                        <TableHead>Chi tiết</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {missingInfoDetails.map((customer) => (
                                        <TableRow key={customer._id}>
                                            <TableCell>{customer.name}</TableCell>
                                            <TableCell>{customer.phone}</TableCell>
                                            <TableCell>
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" size="sm" onClick={() => setSelectedCustomer(customer)}>Xem</Button>
                                                    </DialogTrigger>
                                                </Dialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>Phân bổ Data</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px] relative">
                            <canvas ref={chartRef}></canvas>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {selectedCustomer && (
                <Dialog open={!!selectedCustomer} onOpenChange={(isOpen) => !isOpen && setSelectedCustomer(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Thông tin thiếu của: {selectedCustomer.name}</DialogTitle>
                        </DialogHeader>
                        <ul>
                            {selectedCustomer.missingFields.map(field => <li key={field}>{field}</li>)}
                        </ul>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
