'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Users, Clock, History, PieChart, User } from "lucide-react";
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

export default function AssignmentDashboard() {
    const [stats, setStats] = useState({
        assigned: 0,
        waiting: 0,
        total: 0
    });
    const [assignmentHistory, setAssignmentHistory] = useState([]);
    const [assignmentByStaff, setAssignmentByStaff] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAssignmentData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                // Fetch assignment statistics
                const statsResponse = await fetch('/api/admin/assignments/stats');
                if (!statsResponse.ok) throw new Error("Failed to fetch assignment stats");
                const statsData = await statsResponse.json();
                
                // Fetch assignment history
                const historyResponse = await fetch('/api/admin/assignments/history');
                if (!historyResponse.ok) throw new Error("Failed to fetch assignment history");
                const historyData = await historyResponse.json();
                
                // Fetch assignments by staff
                const staffResponse = await fetch('/api/admin/assignments/by-staff');
                if (!staffResponse.ok) throw new Error("Failed to fetch staff assignments");
                const staffData = await staffResponse.json();
                
                setStats(statsData);
                setAssignmentHistory(historyData);
                setAssignmentByStaff(staffData);
            } catch (error) {
                console.error("Error fetching assignment data:", error);
                setError(error.message);
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchAssignmentData();
    }, []);

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Phân bổ Khách hàng</h1>
            </div>
            
            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                    <strong className="font-bold">Lỗi!</strong>
                    <span className="block sm:inline"> {error}</span>
                </div>
            )}
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Tổng Khách hàng
                        </CardTitle>
                        <PieChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Tổng số khách hàng trong hệ thống
                        </p>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Đã phân bổ
                        </CardTitle>
                        <User className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.assigned}</div>
                        <div className="mt-1 flex items-center">
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div 
                                    className="bg-green-600 h-2.5 rounded-full" 
                                    style={{ width: `${stats.total > 0 ? Math.round((stats.assigned / stats.total) * 100) : 0}%` }}
                                ></div>
                            </div>
                            <span className="text-xs font-medium text-muted-foreground ml-2">
                                {stats.total > 0 ? Math.round((stats.assigned / stats.total) * 100) : 0}%
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Khách hàng đã được gán cho nhân viên
                        </p>
                    </CardContent>
                </Card>
                
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">
                            Chờ phân bổ
                        </CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.waiting}</div>
                        <div className="mt-1 flex items-center">
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div 
                                    className="bg-orange-500 h-2.5 rounded-full" 
                                    style={{ width: `${stats.total > 0 ? Math.round((stats.waiting / stats.total) * 100) : 0}%` }}
                                ></div>
                            </div>
                            <span className="text-xs font-medium text-muted-foreground ml-2">
                                {stats.total > 0 ? Math.round((stats.waiting / stats.total) * 100) : 0}%
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Khách hàng đang chờ được phân bổ
                        </p>
                    </CardContent>
                </Card>
            </div>
            
            <Tabs defaultValue="history" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="history">
                        <History className="w-4 h-4 mr-2" />
                        Lịch sử phân bổ
                    </TabsTrigger>
                    <TabsTrigger value="by-staff">
                        <Users className="w-4 h-4 mr-2" />
                        Phân bổ theo nhân viên
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Lịch sử phân bổ gần đây</CardTitle>
                            <CardDescription>
                                Các khách hàng được phân bổ gần đây nhất
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Thời gian</TableHead>
                                            <TableHead>Khách hàng</TableHead>
                                            <TableHead>Nhân viên tiếp nhận</TableHead>
                                            <TableHead>Nhóm</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-4">
                                                    <div className="flex justify-center">
                                                        <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : assignmentHistory.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-4">Không có dữ liệu phân bổ</TableCell>
                                            </TableRow>
                                        ) : (
                                            assignmentHistory.map((item) => (
                                                <TableRow key={item._id}>
                                                    <TableCell className="font-medium whitespace-nowrap">
                                                        {format(new Date(item.assignedAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">{item.customer.name}</div>
                                                        <div className="text-sm text-muted-foreground">{item.customer.phone}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">{item.assignedTo.name}</div>
                                                        <div className="text-sm text-muted-foreground">{item.assignedTo.email}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                            {item.group || 'Chung'}
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
                            <CardTitle>Phân bổ theo nhân viên</CardTitle>
                            <CardDescription>
                                Số lượng khách hàng được phân bổ cho từng nhân viên
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nhân viên</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Vai trò</TableHead>
                                            <TableHead>Số lượng</TableHead>
                                            <TableHead>Tỉ lệ</TableHead>
                                            <TableHead>Nhóm</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-4">
                                                    <div className="flex justify-center">
                                                        <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : assignmentByStaff.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-4">Không có dữ liệu phân bổ</TableCell>
                                            </TableRow>
                                        ) : (
                                            assignmentByStaff.map((staff) => (
                                                <TableRow key={staff._id}>
                                                    <TableCell className="font-medium">{staff.name}</TableCell>
                                                    <TableCell>{staff.email}</TableCell>
                                                    <TableCell>{staff.role}</TableCell>
                                                    <TableCell>{staff.assignedCount}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-16 bg-gray-200 rounded-full h-2">
                                                                <div 
                                                                    className="bg-primary h-2 rounded-full" 
                                                                    style={{ 
                                                                        width: `${stats.total > 0 ? Math.min(100, Math.round((staff.assignedCount / stats.total) * 100)) : 0}%` 
                                                                    }}
                                                                ></div>
                                                            </div>
                                                            <span className="text-xs">
                                                                {stats.total > 0 ? Math.round((staff.assignedCount / stats.total) * 100) : 0}%
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-wrap gap-1">
                                                            {staff.groups && staff.groups.length > 0 ? 
                                                                staff.groups.map((group, index) => (
                                                                    <Badge key={index} variant="outline" className="bg-gray-50">
                                                                        {group}
                                                                    </Badge>
                                                                )) : 
                                                                <span className="text-muted-foreground text-xs">Chưa có nhóm</span>
                                                            }
                                                        </div>
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
