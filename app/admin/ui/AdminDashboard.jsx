'use client';

import { useEffect, useRef, useState } from 'react';
import { Chart, ArcElement, Tooltip, Legend, PieController } from 'chart.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';

Chart.register(ArcElement, Tooltip, Legend, PieController);

export default function AdminDashboard({ dashboardData, historyData }) {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const { totalLeads, validLeads, missingInfoLeads, duplicateLeads, missingInfoDetails } = dashboardData;
    const { byType, overall, recentActivities, zaloLimits } = historyData;

    useEffect(() => {
        if (chartRef.current) {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
            
            // Add a timeout to ensure DOM is fully rendered
            const timer = setTimeout(() => {
                const ctx = chartRef.current.getContext('2d');
                chartInstance.current = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels: ['Hợp lệ', 'Thiếu thông tin', 'Trùng lặp'],
                        datasets: [{
                            data: [validLeads.count, missingInfoLeads.count, duplicateLeads.count],
                            backgroundColor: [
                                '#10b981', // green
                                '#f59e0b', // amber
                                '#ef4444'  // red
                            ],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    padding: 20,
                                    usePointStyle: true
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const value = context.raw;
                                        const percentage = total > 0 ? Math.round(value / total * 100) : 0;
                                        return `${context.label}: ${value} (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
            }, 200); // Short delay to ensure canvas is ready
            
            return () => {
                clearTimeout(timer);
                if (chartInstance.current) {
                    chartInstance.current.destroy();
                }
            };
        }
    }, [validLeads, missingInfoLeads, duplicateLeads]);

    const ActivityCard = ({ title, stats }) => (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
                <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Thành công: <span className="font-medium text-green-600">{stats.success.toLocaleString()}</span></span>
                    <span>Thất bại: <span className="font-medium text-red-600">{stats.failed.toLocaleString()}</span></span>
                </div>
                <p className="text-xs text-muted-foreground">Tỷ lệ thành công: {stats.successRate}%</p>
            </CardContent>
        </Card>
    );

    return (
        <Tabs defaultValue="data-quality" className="space-y-4">
            <TabsList>
                <TabsTrigger value="data-quality">Chất lượng Data</TabsTrigger>
                <TabsTrigger value="realtime-activity">Hoạt động Real-time</TabsTrigger>
            </TabsList>

            <TabsContent value="data-quality" className="space-y-4">
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
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setSelectedCustomer(customer)}
                                                            >
                                                                Xem
                                                            </Button>
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
                            <div className="h-[350px] relative flex justify-center items-center">
                                <canvas ref={chartRef} className="max-w-full" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="realtime-activity" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-semibold">Giới hạn tin nhắn</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-2xl font-bold">{zaloLimits?.hourly || 0}</div>
                                    <div className="text-xs text-muted-foreground mt-1">Theo giờ</div>
                                </div>
                                <div className="text-2xl font-semibold mx-2">/</div>
                                <div>
                                    <div className="text-2xl font-bold">{zaloLimits?.daily || 0}</div>
                                    <div className="text-xs text-muted-foreground mt-1">Theo ngày</div>
                                </div>
                            </div>
                            <div className="text-sm text-muted-foreground pt-1">
                                <span>Tổng tin nhắn có thể gửi</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Tính tổng tất cả tài khoản Zalo</p>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-semibold">Giới hạn theo năm</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="text-2xl font-bold">{zaloLimits?.yearly?.remaining || 0}</div>
                            <div className="text-sm text-muted-foreground">
                                <span>Tin nhắn còn lại trong năm {new Date().getFullYear()}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                <div 
                                    className="bg-blue-600 h-2.5 rounded-full" 
                                    style={{ 
                                        width: `${Math.min(100, ((zaloLimits?.yearly?.used || 0) / (zaloLimits?.yearly?.total || 200000)) * 100)}%` 
                                    }}>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">Đã gửi {zaloLimits?.yearly?.used || 0} / {zaloLimits?.yearly?.total || 200000} tin</p>
                        </CardContent>
                    </Card>

                    {Object.entries(byType).map(([type, stats]) => (
                        stats.total > 0 && <ActivityCard key={type} title={stats.name} stats={stats} />
                    ))}
                </div>
                
                <Card>
                    <CardHeader>
                        <CardTitle>Hoạt động gần đây</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[450px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Thời gian</TableHead>
                                        <TableHead>Hành động</TableHead>
                                        <TableHead>Người thực hiện</TableHead>
                                        <TableHead>Tài khoản Zalo</TableHead>
                                        <TableHead>Trạng thái</TableHead>
                                        <TableHead>Chi tiết</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentActivities.map((activity) => (
                                        <TableRow key={activity._id}>
                                            <TableCell>{new Date(activity.createdAt).toLocaleString('vi-VN')}</TableCell>
                                            <TableCell>
                                                <span className="font-medium">{byType[activity.type]?.name || activity.type}</span>
                                            </TableCell>
                                            <TableCell>{activity.createBy?.name || 'N/A'}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {activity.zalo?.avt && (
                                                        <img src={activity.zalo.avt} alt="" className="w-6 h-6 rounded-full" />
                                                    )}
                                                    <span className="text-sm">{activity.zalo?.name || 'N/A'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={activity.status?.status ? 'default' : 'destructive'}>
                                                    {activity.status?.status ? 'Thành công' : 'Thất bại'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="max-w-xs">
                                                <div className="truncate text-sm" title={activity.status?.message || activity.status?.data?.error_message}>
                                                    {activity.status?.message || activity.status?.data?.error_message || 'Không có thông tin'}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>

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
        </Tabs>
    );
}
