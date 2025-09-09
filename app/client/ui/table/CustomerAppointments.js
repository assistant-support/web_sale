'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from "sonner";
import { format } from "date-fns";

// --- Icon Imports ---
import {
    CalendarClock, Loader2, CalendarCheck, ChevronUp, ChevronDown, Plus,
    Calendar as CalendarIcon, CheckCircle2, Check, UserX, Trash2, AlertTriangle, Clock, X
} from 'lucide-react';
// --- Action & Data Function Imports ---
import { createAppointmentAction, updateAppointmentStatusAction, cancelAppointmentAction } from '@/app/actions/appointment.actions';
import { appointment_data } from '@/data/appointment_db/wraperdata.db';

// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardFooter, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";


// =============================================================
// == COMPONENT PHỤ & SCHEMA
// =============================================================

// Schema validation cho form tạo lịch hẹn
const appointmentSchema = z.object({
    title: z.string().min(3, { message: "Mục đích hẹn phải có ít nhất 3 ký tự." }),
    appointmentDate: z.date({ required_error: "Vui lòng chọn ngày hẹn." }),
    appointmentTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "Giờ hẹn không hợp lệ (HH:mm)." }),
    notes: z.string().optional(),
});

// Component Form Tạo Lịch Hẹn
function CreateAppointmentForm({ customerId, onAppointmentCreated }) {
    const form = useForm({
        resolver: zodResolver(appointmentSchema),
        defaultValues: { title: "", notes: "", appointmentTime: "" },
    });

    const { isSubmitting } = form.formState;

    const onSubmit = async (values) => {
        const { title, appointmentDate, appointmentTime, notes } = values;

        // Kết hợp ngày và giờ
        const [hours, minutes] = appointmentTime.split(':');
        const combinedDateTime = new Date(appointmentDate);
        combinedDateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10));

        const formData = new FormData();
        formData.append('customerId', customerId);
        formData.append('title', title);
        formData.append('appointmentDate', combinedDateTime.toISOString());
        formData.append('notes', notes || '');

        const promise = createAppointmentAction(null, formData);

        toast.promise(promise, {
            loading: 'Đang tạo lịch hẹn...',
            success: (result) => {
                if (result.status) {
                    form.reset();
                    onAppointmentCreated(); // Gọi callback để refresh danh sách
                    return result.message || 'Tạo lịch hẹn thành công!';
                } else {
                    throw new Error(result.message || 'Tạo lịch hẹn thất bại!');
                }
            },
            error: (err) => err.message || 'Đã xảy ra lỗi không mong muốn.',
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem>
                        <Label>Mục đích hẹn *</Label>
                        <FormControl><Input placeholder="Ví dụ: Tư vấn liệu trình..." {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="appointmentDate" render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <Label>Ngày hẹn *</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Chọn ngày</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="appointmentTime" render={({ field }) => (
                        <FormItem>
                            <Label>Giờ hẹn *</Label>
                            <FormControl><Input type="time" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                        <Label>Ghi chú</Label>
                        <FormControl><Textarea placeholder="Thông tin thêm..." {...field} /></FormControl>
                    </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Tạo lịch hẹn
                </Button>
            </form>
        </Form>
    );
}

// =============================================================
// == COMPONENT CHÍNH
// =============================================================
export default function CustomerAppointments({ customer }) {
    const [appointments, setAppointments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();
    const getStatusInfo = useCallback((status) => {
        switch (status) {
            case 'completed':
                return { label: 'Hoàn thành', variant: 'success', icon: CheckCircle2, border: 'border-green-500' };
            case 'missed':
                return { label: 'Vắng mặt', variant: 'secondary', icon: UserX, border: 'border-gray-300 opacity-80' };
            case 'cancelled':
                return { label: 'Đã hủy', variant: 'destructive', icon: X, border: 'border-gray-300 opacity-80' };
            case 'pending':
            default:
                return { label: 'Đang chờ', variant: 'default', icon: Clock, border: 'border-blue-500' };
        }
    }, []);

    const fetchAppointments = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await appointment_data({ customerId: customer._id });
            setAppointments(result || []);
        } catch (error) {
            toast.error("Không thể tải danh sách lịch hẹn.");
        } finally {
            setIsLoading(false);
        }
    }, [customer._id]);

    useEffect(() => {
        if (customer._id) {
            fetchAppointments();
        }
    }, [customer._id, fetchAppointments]);

    const handleAction = useCallback((actionPromise) => {
        // BỎ: Không cần optimisticUpdateFn nữa vì sẽ fetch lại ngay sau đó
        // optimisticUpdateFn();

        toast.promise(actionPromise, {
            loading: 'Đang xử lý...',
            success: (result) => {
                if (result.status) {
                    // THAY ĐỔI CHÍNH:
                    // Thay vì router.refresh(), gọi fetchAppointments() để cập nhật state ngay lập tức.
                    // Điều này đảm bảo giao diện render lại với dữ liệu mới nhất từ DB.
                    fetchAppointments();
                    return result.message || 'Thao tác thành công!';
                } else {
                    // Nếu API trả về status: false, coi đây là một lỗi
                    throw new Error(result.message || 'Thao tác thất bại!');
                }
            },
            error: (err) => {
                // Nếu có lỗi mạng hoặc lỗi không mong muốn, cũng fetch lại để khôi phục UI
                fetchAppointments();
                return err.message || 'Đã xảy ra lỗi.';
            }
        });
    }, [fetchAppointments]); // Chỉ phụ thuộc vào fetchAppointments

    const handleUpdateStatus = (appointmentId, newStatus) => {
        const formData = new FormData();
        formData.append('appointmentId', appointmentId);
        formData.append('newStatus', newStatus);
        const promise = updateAppointmentStatusAction(null, formData);

        // BỎ: không cần truyền optimistic update nữa
        handleAction(promise);
    };

    const handleCancelAppointment = (appointmentId) => {
        const formData = new FormData();
        formData.append('appointmentId', appointmentId);
        const promise = cancelAppointmentAction(null, formData);

        // BỎ: không cần truyền optimistic update nữa
        handleAction(promise);
    };

    const sortedAppointments = useMemo(() => {
        return [...appointments].sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            return new Date(b.appointmentDate) - new Date(a.appointmentDate);
        });
    }, [appointments]);

    return (
        <div className="p-4 h-full flex flex-col flex-1 gap-4 scroll">
            <Collapsible open={isOpen} onOpenChange={setIsOpen} className="flex-shrink-0 border rounded-lg">
                <CollapsibleTrigger asChild>
                    <div className="flex justify-between items-center cursor-pointer p-3 bg-muted/30">
                        <h5 className="font-semibold flex items-center gap-2"><Plus className="h-5 w-5" />Tạo Lịch Hẹn Mới</h5>
                        <Button variant="ghost" size="sm" className="w-8 h-8 p-0 rounded-full">
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 border-t">
                    <CreateAppointmentForm customerId={customer._id} onAppointmentCreated={fetchAppointments} />
                </CollapsibleContent>
            </Collapsible>

            <h5 className="font-semibold flex items-center gap-2 my-4 flex-shrink-0">
                <CalendarClock className="h-5 w-5" />
                Danh Sách Lịch Hẹn ({appointments.length})
            </h5>

            <div className="flex-1 scroll max-h-[400px] min-h-[400px] pr-2 -mr-2">
                {isLoading ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        <h5>Đang tải...</h5>
                    </div>
                ) : sortedAppointments.length > 0 ? (
                    <div className="space-y-3">
                        {sortedAppointments.map(app => {
                            const statusInfo = getStatusInfo(app.status);
                            const appointmentDate = new Date(app.appointmentDate);
                            const isPastDue = app.status === 'pending' && appointmentDate < new Date();

                            return (
                                <Card key={app._id} className={cn(
                                    'transition-all',
                                    isPastDue ? 'border-red-500 bg-red-50/50' : statusInfo.border
                                )}>
                                    <CardHeader className="flex flex-row items-start justify-between px-4 pt-2 pb-0 space-y-0">
                                        <div>
                                            <CardTitle><h5 className='text_w_600'>{app.title}</h5></CardTitle>
                                            <h5 className="flex items-center gap-2">
                                                <CalendarIcon className="h-4 w-4" />
                                                {format(appointmentDate, "HH:mm, dd/MM/yyyy")}
                                            </h5>
                                        </div>
                                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                                    </CardHeader>
                                    <CardContent className="px-4 py-2">
                                        {app.notes && <h6 className="text-sm text-muted-foreground border-t pt-2 mt-2">Ghi chú: {app.notes}</h6>}
                                        {isPastDue && (
                                            <p className="text-xs font-semibold text-red-600 flex items-center gap-1 mt-2">
                                                <AlertTriangle className="h-3 w-3" />
                                                Lịch hẹn này đã quá hạn.
                                            </p>
                                        )}
                                    </CardContent>
                                    <CardFooter className="bg-muted/50 p-2 border-t pb-0">
                                        <div className="grid grid-cols-3 gap-2 w-full">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-white text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700"
                                                onClick={() => handleUpdateStatus(app._id, 'completed')}
                                                disabled={isPastDue} // THÊM DÒNG NÀY
                                            >
                                                <Check className="mr-1 h-4 w-4" /> Hoàn thành
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-white text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                                                onClick={() => handleUpdateStatus(app._id, 'missed')}
                                                disabled={isPastDue} // THÊM DÒNG NÀY
                                            >
                                                <UserX className="mr-1 h-4 w-4" /> Vắng mặt
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-white text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
                                                onClick={() => handleCancelAppointment(app._id)}
                                                disabled={isPastDue} // THÊM DÒNG NÀY
                                            >
                                                <Trash2 className="mr-1 h-4 w-4" /> Hủy
                                            </Button>
                                        </div>
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground pt-10 flex flex-col items-center">
                        <CalendarCheck className="h-10 w-10 mb-2 opacity-50" />
                        <p className="font-semibold">Chưa có lịch hẹn nào</p>
                        <p className="text-sm">Tạo lịch hẹn mới ở trên để bắt đầu.</p>
                    </div>
                )}
            </div>
        </div>
    );
}