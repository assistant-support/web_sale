'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, RefreshCw, UserCheck, Clock, Users } from 'lucide-react';

export default function LeadDistributionDashboard() {
    const [dashboardData, setDashboardData] = useState({
        assigned: { count: 0, percentage: 0 },
        pending: { count: 0, percentage: 0 },
        total: 0,
        staffStats: [],
        recentAssignments: []
    });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({
        dateRange: 'all',
        staff: 'all',
        search: ''
    });

    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/lead-distribution-stats');
            const data = await response.json();
            
            if (data.success) {
                setDashboardData(data.data);
            }
        } catch (error) {
            console.error('Error fetching lead distribution data:', error);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchDashboardData();
        
        // Set up polling for real-time updates
        const interval = setInterval(fetchDashboardData, 30000); // Every 30 seconds
        
        return () => clearInterval(interval);
    }, [fetchDashboardData]);

    return (
        <div className="space-y-4 p-4 sm:p-6 lg:p-8">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold tracking-tight">Phân bổ Lead</h1>
                <Button 
                    onClick={fetchDashboardData} 
                    variant="outline" 
                    size="sm"
                    disabled={loading}
                >
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Làm mới
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Tổng Lead
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{dashboardData.total}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Đã phân bổ
                        </CardTitle>
                        <UserCheck className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{dashboardData.assigned.count}</div>
                        <p className="text-xs text-muted-foreground">
                            {dashboardData.assigned.percentage}% tổng Lead
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Chờ phân bổ
                        </CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{dashboardData.pending.count}</div>
                        <p className="text-xs text-muted-foreground">
                            {dashboardData.pending.percentage}% tổng Lead
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="staff-stats" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="staff-stats">Thống kê theo nhân sự</TabsTrigger>
                    <TabsTrigger value="assignment-history">Lịch sử phân bổ</TabsTrigger>
                </TabsList>
                
                <TabsContent value="staff-stats" className="space-y-4">
                    <div className="flex gap-2 items-center mb-4">
                        <Input 
                            placeholder="Tìm kiếm nhân sự" 
                            className="max-w-sm"
                            value={filter.search}
                            onChange={(e) => setFilter({...filter, search: e.target.value})}
                        />
                        <Select 
                            value={filter.dateRange} 
                            onValueChange={(value) => setFilter({...filter, dateRange: value})}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Thời gian" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả</SelectItem>
                                <SelectItem value="today">Hôm nay</SelectItem>
                                <SelectItem value="week">Tuần này</SelectItem>
                                <SelectItem value="month">Tháng này</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nhân sự</TableHead>
                                        <TableHead>Số Lead đã nhận</TableHead>
                                        <TableHead>Tỷ lệ</TableHead>
                                        <TableHead>Lần phân bổ gần nhất</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dashboardData.staffStats.map((staff) => (
                                        <TableRow key={staff.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                                                        {staff.avatar ? (
                                                            <img 
                                                                src={staff.avatar} 
                                                                alt={staff.name} 
                                                                className="h-8 w-8 rounded-full"
                                                            />
                                                        ) : (
                                                            <Users className="h-4 w-4 text-gray-500" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">{staff.name}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {staff.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{staff.leadCount}</TableCell>
                                            <TableCell>{staff.percentage}%</TableCell>
                                            <TableCell>{new Date(staff.lastAssignmentDate).toLocaleString('vi-VN')}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="assignment-history" className="space-y-4">
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Thời gian</TableHead>
                                        <TableHead>Lead</TableHead>
                                        <TableHead>Phân bổ cho</TableHead>
                                        <TableHead>Phân bổ bởi</TableHead>
                                        <TableHead>Trạng thái</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dashboardData.recentAssignments.map((assignment) => (
                                        <TableRow key={assignment.id}>
                                            <TableCell>{new Date(assignment.date).toLocaleString('vi-VN')}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{assignment.leadName}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {assignment.leadPhone}
                                                </div>
                                            </TableCell>
                                            <TableCell>{assignment.assignedTo}</TableCell>
                                            <TableCell>{assignment.assignedBy}</TableCell>
                                            <TableCell>
                                                <Badge variant={assignment.isAutoAssigned ? "secondary" : "default"}>
                                                    {assignment.isAutoAssigned ? "Tự động" : "Thủ công"}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
