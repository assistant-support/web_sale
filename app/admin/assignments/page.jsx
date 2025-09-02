'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Users, ClockIcon, HistoryIcon } from "lucide-react";
import { format } from 'date-fns';

export default function AssignmentDashboard() {
    const [stats, setStats] = useState({
        assigned: 0,
        waiting: 0,
        total: 0
    });
    const [assignmentHistory, setAssignmentHistory] = useState([]);
    const [assignmentByStaff, setAssignmentByStaff] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAssignmentData = async () => {
            try {
                setIsLoading(true);
                
                // Fetch assignment statistics
                const statsResponse = await fetch('/api/admin/assignments/stats');
                const statsData = await statsResponse.json();
                
                // Fetch assignment history
                const historyResponse = await fetch('/api/admin/assignments/history');
                const historyData = await historyResponse.json();
                
                // Fetch assignments by staff
                const staffResponse = await fetch('/api/admin/assignments/by-staff');
                const staffData = await staffResponse.json();
                
                setStats(statsData);
                setAssignmentHistory(historyData);
                setAssignmentByStaff(staffData);
            } catch (error) {
                console.error("Error fetching assignment data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchAssignmentData();
    }, []);

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Phân bổ Data</h1>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Tổng Data
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <p className="text-xs text-muted-foreground">
                            Tổng số Data trong hệ thống
                        </p>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Đã phân bổ
                        </CardTitle>
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.assigned}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.total > 0 ? Math.round((stats.assigned / stats.total) * 100) : 0}% tổng Data
                        </p>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Chờ phân bổ
                        </CardTitle>
                        <ClockIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.waiting}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.total > 0 ? Math.round((stats.waiting / stats.total) * 100) : 0}% tổng Data
                        </p>
                    </CardContent>
                </Card>
            </div>
            
            <Tabs defaultValue="history" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="history">Lịch sử phân bổ</TabsTrigger>
                    <TabsTrigger value="by-staff">Phân bổ theo nhân viên</TabsTrigger>
                </TabsList>
                
                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <HistoryIcon className="h-5 w-5" />
                                Lịch sử phân bổ gần đây
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Thời gian</TableHead>
                                            <TableHead>Khách hàng</TableHead>
                                            <TableHead>Người phân bổ</TableHead>
                                            <TableHead>Nhân viên tiếp nhận</TableHead>
                                            <TableHead>Trạng thái</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-4">Đang tải dữ liệu...</TableCell>
                                            </TableRow>
                                        ) : assignmentHistory.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-4">Không có dữ liệu phân bổ</TableCell>
                                            </TableRow>
                                        ) : (
                                            assignmentHistory.map((item) => (
                                                <TableRow key={item._id}>
                                                    <TableCell className="font-medium">
                                                        {format(new Date(item.assignedAt), 'dd/MM/yyyy HH:mm')}
                                                    </TableCell>
                                                    <TableCell>{item.customer.name}</TableCell>
                                                    <TableCell>{item.assignedBy.name}</TableCell>
                                                    <TableCell>{item.assignedTo.name}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                            Đã phân bổ
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="by-staff" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Phân bổ theo nhân viên
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nhân viên</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Số Data phụ trách</TableHead>
                                            <TableHead>Tỉ lệ</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-4">Đang tải dữ liệu...</TableCell>
                                            </TableRow>
                                        ) : assignmentByStaff.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-4">Không có dữ liệu phân bổ</TableCell>
                                            </TableRow>
                                        ) : (
                                            assignmentByStaff.map((staff) => (
                                                <TableRow key={staff._id}>
                                                    <TableCell className="font-medium">{staff.name}</TableCell>
                                                    <TableCell>{staff.email}</TableCell>
                                                    <TableCell>{staff.assignedCount}</TableCell>
                                                    <TableCell>
                                                        {stats.total > 0 ? Math.round((staff.assignedCount / stats.total) * 100) : 0}%
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
