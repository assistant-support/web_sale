'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';

// --- Icon Imports ---
import {
    CheckCircle2, X, Clock, Circle, CalendarCheck, ChevronUp,
    ChevronDown, Plus, CalendarClock, Loader2
} from 'lucide-react';

// --- Action & Data Function Imports ---
import { createAppointmentAction, updateAppointmentStatusAction, cancelAppointmentAction } from '@/app/actions/appointment.actions';
import { appointment_data } from '@/data/appointment_db/wraperdata.db';
import useActionUI from '@/hooks/useActionUI';

// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// =============================================================
// == COMPONENT CHÍNH CỦA PHẦN LỊCH HẸN
// =============================================================
export default function CustomerAppointments({ customer }) {
    const [appointments, setAppointments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [showConfirmCancel, setShowConfirmCancel] = useState(null);
    const [actionInProgress, setActionInProgress] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const createFormRef = useRef(null);
    const actionUI = useActionUI();
    const router = useRouter();

    const { showNoti } = actionUI;

    const statusOptions = useMemo(() => [
        { value: 'completed', label: 'Hoàn thành', icon: CheckCircle2, color: 'bg-green-100 text-green-800 border-green-200' },
        { value: 'missed', label: 'Vắng mặt', icon: X, color: 'bg-amber-100 text-amber-800 border-amber-200' },
        { value: 'cancelled', label: 'Đã hủy', icon: X, color: 'bg-red-100 text-red-800 border-red-200' },
        { value: 'pending', label: 'Đang chờ', icon: Clock, color: 'bg-blue-100 text-blue-800 border-blue-200' }
    ], []);

    const getStatusInfo = useCallback((status) => {
        return statusOptions.find(opt => opt.value === status) || { value: status, label: status, icon: Circle, color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }, [statusOptions]);

    useEffect(() => {
        const fetchAppointments = async () => {
            setIsLoading(true);
            try {
                const data = await appointment_data({ customerId: customer._id });
                setAppointments(data);
            } catch (error) {
                showNoti(false, "Không thể tải danh sách lịch hẹn.");
            } finally {
                setIsLoading(false);
            }
        };
        if (customer._id) {
            fetchAppointments();
        }
    }, [customer._id, showNoti]);

    const handleUpdateStatus = useCallback(async (appointmentId, newStatus) => {
        setActionInProgress(`update-${appointmentId}`);
        const formData = new FormData();
        formData.append('appointmentId', appointmentId);
        formData.append('newStatus', newStatus);
        try {
            const result = await updateAppointmentStatusAction(null, formData);
            if (result.status) {
                showNoti(true, result.message || 'Cập nhật trạng thái thành công');
                setAppointments(prev => prev.map(app => app._id === appointmentId ? { ...app, status: newStatus } : app));
                router.refresh();
            } else {
                showNoti(false, result.message || 'Không thể cập nhật trạng thái');
            }
        } catch (error) {
            showNoti(false, 'Lỗi khi cập nhật trạng thái');
        } finally {
            setActionInProgress('');
            setSelectedAppointment(null);
        }
    }, [showNoti, router]);

    const handleCancelAppointment = useCallback(async (appointmentId) => {
        setActionInProgress(`cancel-${appointmentId}`);
        const formData = new FormData();
        formData.append('appointmentId', appointmentId);
        try {
            const result = await cancelAppointmentAction(null, formData);
            if (result.status) {
                showNoti(true, result.message || 'Đã hủy lịch hẹn thành công');
                setAppointments(prev => prev.map(app => app._id === appointmentId ? { ...app, status: 'cancelled' } : app));
                router.refresh();
            } else {
                showNoti(false, result.message || 'Không thể hủy lịch hẹn');
            }
        } catch (error) {
            showNoti(false, 'Lỗi khi hủy lịch hẹn');
        } finally {
            setActionInProgress('');
            setShowConfirmCancel(null);
        }
    }, [showNoti, router]);

    const handleCreateAppointment = useCallback(async (formData) => {
        setActionInProgress('create');
        try {
            const result = await createAppointmentAction(null, formData);
            if (result.status) {
                showNoti(true, result.message || 'Đã tạo lịch hẹn mới');
                if (createFormRef.current) createFormRef.current.reset();
                setShowCreateForm(false);
                // Re-fetch data to show the new appointment
                const data = await appointment_data({ customerId: customer._id });
                setAppointments(data);
                router.refresh();
            } else {
                showNoti(false, result.message || 'Không thể tạo lịch hẹn');
            }
        } catch (error) {
            showNoti(false, 'Lỗi khi tạo lịch hẹn');
        } finally {
            setActionInProgress('');
        }
    }, [customer._id, showNoti, router]);

    const formatAppointmentDate = useCallback((dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const appointmentDay = new Date(date);
        appointmentDay.setHours(0, 0, 0, 0);
        const isPast = date < now;
        let prefix = '';
        if (appointmentDay.getTime() === today.getTime()) prefix = 'Hôm nay';
        else if (appointmentDay.getTime() === tomorrow.getTime()) prefix = 'Ngày mai';
        const formattedDate = date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedTime = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        return { full: `${prefix ? `${prefix}, ` : ''}${formattedDate} ${formattedTime}`, isToday: prefix === 'Hôm nay', isPast };
    }, []);

    const sortedAppointments = useMemo(() => {
        return [...appointments].sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            if (a.status === 'pending') return new Date(a.appointmentDate) - new Date(b.appointmentDate);
            return new Date(b.appointmentDate) - new Date(a.appointmentDate);
        });
    }, [appointments]);

    return (
        <div className="p-4 space-y-6 max-h-[calc(80vh-100px)] overflow-y-auto">
            <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/30 p-3 flex justify-between items-center cursor-pointer hover:bg-muted/50" onClick={() => setShowCreateForm(!showCreateForm)}>
                    <h5 className="font-semibold flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" />Tạo Lịch Hẹn Mới</h5>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full">
                        {showCreateForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
                {showCreateForm && (
                    <div className="p-4 border-t bg-card">
                        <form onSubmit={(e) => { e.preventDefault(); handleCreateAppointment(new FormData(e.target)); }} ref={createFormRef} className="space-y-3">
                            <input type="hidden" name="customerId" value={customer._id} />
                            <div>
                                <Label htmlFor="appointment-title">Mục đích cuộc hẹn</Label>
                                <Input id="appointment-title" name="title" required className="mt-1" />
                            </div>
                            <div>
                                <Label htmlFor="appointment-date">Thời gian hẹn</Label>
                                <Input id="appointment-date" name="appointmentDate" type="datetime-local" required className="mt-1" />
                            </div>
                            <div>
                                <Label htmlFor="appointment-notes">Ghi chú thêm</Label>
                                <Textarea id="appointment-notes" name="notes" rows={2} className="mt-1" />
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreateForm(false)}>Hủy</Button>
                                <Button type="submit" className="flex-1" disabled={actionInProgress === 'create'}>
                                    {actionInProgress === 'create' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tạo...</> : "Tạo Lịch Hẹn"}
                                </Button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h5 className="font-semibold flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" />Danh Sách Lịch Hẹn</h5>
                    <span className="text-xs text-muted-foreground">{appointments.length} lịch hẹn</span>
                </div>
                <div className="space-y-3">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                    ) : appointments.length > 0 ? (
                        sortedAppointments.map(app => {
                            const statusInfo = getStatusInfo(app.status);
                            const formattedDate = formatAppointmentDate(app.appointmentDate);
                            const isPending = app.status === 'pending';
                            return (
                                <div key={app._id} className={`border rounded-lg p-3 ${isPending ? 'border-blue-200' : ''}`}>
                                    <div className="flex justify-between items-start gap-2 mb-2">
                                        <h6 className="font-medium">{app.title}</h6>
                                        <div className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusInfo.color} border`}>
                                            <statusInfo.icon className="h-3 w-3" />{statusInfo.label}
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-1 text-sm ${formattedDate.isPast && isPending ? 'text-red-500' : 'text-muted-foreground'}`}>
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        <span>{formattedDate.full}{formattedDate.isPast && isPending && " (Đã qua hẹn)"}</span>
                                    </div>
                                    {isPending && (
                                        <div className="mt-3 pt-2 border-t">
                                            <Button variant={formattedDate.isPast ? "destructive" : "secondary"} size="sm" className="w-full" onClick={() => handleUpdateStatus(app._id, 'completed')}>
                                                {actionInProgress === `update-${app._id}` ? 'Đang cập nhật...' : 'Cập nhật trạng thái'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-8"><p>Chưa có lịch hẹn nào.</p></div>
                    )}
                </div>
            </div>
        </div>
    );
}