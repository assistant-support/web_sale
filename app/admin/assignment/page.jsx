"use client";

import { useState, useEffect } from "react";
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription 
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

export default function AssignmentDashboard() {
  const [assignmentData, setAssignmentData] = useState({
    assigned: 0,
    pending: 0,
    total: 0,
    byStaff: [],
    recentAssignments: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssignmentData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/admin/assignment-stats');
        const data = await response.json();
        
        if (data.success) {
          setAssignmentData(data.data);
        }
      } catch (error) {
        console.error("Error fetching assignment data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignmentData();
    
    // Set up polling for real-time updates
    const interval = setInterval(fetchAssignmentData, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Quản lý phân bổ Lead</h1>
        <Button onClick={() => window.location.reload()}>
          Làm mới dữ liệu
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tổng số Lead</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignmentData.total}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Tất cả Lead trong hệ thống
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Đã phân bổ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignmentData.assigned}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {((assignmentData.assigned / assignmentData.total) * 100).toFixed(1)}% tổng số Lead
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Chưa phân bổ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignmentData.pending}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {((assignmentData.pending / assignmentData.total) * 100).toFixed(1)}% tổng số Lead
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="by-staff" className="space-y-4">
        <TabsList>
          <TabsTrigger value="by-staff">Phân bổ theo nhân viên</TabsTrigger>
          <TabsTrigger value="recent">Lịch sử phân bổ gần đây</TabsTrigger>
        </TabsList>

        <TabsContent value="by-staff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Phân bổ theo nhân viên</CardTitle>
              <CardDescription>Tổng quan số lượng Lead được phân bổ cho từng nhân viên</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead>Số Lead</TableHead>
                    <TableHead>Tỷ lệ</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignmentData.byStaff.map((staff) => (
                    <TableRow key={staff.id}>
                      <TableCell className="font-medium">{staff.name}</TableCell>
                      <TableCell>{staff.count}</TableCell>
                      <TableCell>
                        {((staff.count / assignmentData.assigned) * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={staff.activeStatus ? "default" : "secondary"}
                        >
                          {staff.activeStatus ? "Đang hoạt động" : "Không hoạt động"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lịch sử phân bổ gần đây</CardTitle>
              <CardDescription>Các Lead được phân bổ gần đây nhất</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[450px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Phân bổ cho</TableHead>
                      <TableHead>Người thực hiện</TableHead>
                      <TableHead>Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignmentData.recentAssignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          {format(new Date(assignment.date), 'dd/MM/yyyy HH:mm', { locale: vi })}
                        </TableCell>
                        <TableCell className="font-medium">{assignment.customerName}</TableCell>
                        <TableCell>{assignment.assignedTo}</TableCell>
                        <TableCell>{assignment.assignedBy}</TableCell>
                        <TableCell>{assignment.notes || "-"}</TableCell>
                      </TableRow>
                    ))}
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
