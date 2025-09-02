'use client';

import React, { useState, useEffect, useActionState, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// --- Icon Imports ---
import {
    PenSquare, CalendarClock, History, MessageSquare, SendHorizonal, CheckCircle2,
    CircleDot, Circle, Loader2, LayoutDashboard, Clock, User, CalendarCheck, X
} from 'lucide-react';

// --- Action & Data Function Imports ---
import { updateCustomerInfo, addCareNoteAction } from '@/app/actions/customer.actions';
import { createAppointmentAction, updateAppointmentStatusAction as updateApptStatusAction, cancelAppointmentAction } from '@/app/actions/appointment.actions';
import { appointment_data } from '@/data/appointment_db/wraperdata.db';
import { history_data } from '@/data/actions/get';
import useActionUI from '@/hooks/useActionUI';

// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';

// =============================================================
// == 1. CÁC COMPONENT PHỤ
// =============================================================

/**
 * Hiển thị phần header của popup chi tiết khách hàng.
 */
function CustomerDetailHeader({ customer, zalo }) {
    const zaloAccount = customer.uid?.[0]?.zalo ? zalo.find(z => z._id === customer.uid[0].zalo) : null;
    return (
        <DialogHeader className="p-4 border-b">
            <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12"><AvatarImage src={customer.zaloavt || undefined} alt={customer.zaloname} /><AvatarFallback>{customer.name.charAt(0)}</AvatarFallback></Avatar>
                <div>
                    <DialogTitle asChild><h4>{customer.zaloname || customer.name}</h4></DialogTitle>
                    <DialogDescription asChild><h6>{customer.phone}</h6></DialogDescription>
                    {zaloAccount && <h6 className='text-muted-foreground'>CSKH: {zaloAccount.name}</h6>}
                </div>
            </div>
        </DialogHeader>
    );
}

/**
 * Hiển thị một ghi chú trong lịch sử chăm sóc.
 */
function CareNoteItem({ note }) {
    return (
        <div className="flex gap-3 items-start py-2">
            <Avatar className="h-8 w-8"><AvatarImage src={note.createBy?.avt || undefined} alt={note.createBy?.name} /><AvatarFallback>{note.createBy?.name?.charAt(0) || 'S'}</AvatarFallback></Avatar>
            <div className="flex-1">
                <div className="flex justify-between items-center"><h6 className="font-semibold">{note.createBy?.name || 'Hệ thống'}</h6><h6 className="text-xs text-muted-foreground">{new Date(note.createAt).toLocaleString('vi-VN')}</h6></div>
                <h6 className="text-sm text-muted-foreground mt-1">{note.content}</h6>
            </div>
        </div>
    );
}

/**
 * SỬA LẠI: Form để thêm một ghi chú chăm sóc mới.
 * Component này không tự quản lý state action nữa.
 */
function AddNoteForm({ customerId, dispatchAddNote, isNotePending, noteState, currentStep }) {
    const formRef = useRef(null);

    useEffect(() => {
        if (noteState?.success) {
            formRef.current?.reset();
        }
    }, [noteState]);

    return (
        <form action={dispatchAddNote} ref={formRef} className="flex gap-3 items-start pt-3 mt-3 border-t">
            <input type="hidden" name="customerId" value={customerId} />
            {/* MỚI: Thêm input ẩn để gửi step hiện tại */}
            <input type="hidden" name="step" value={currentStep} />

            <Textarea
                name="content"
                placeholder="Thêm ghi chú..."
                className="flex-1 text-sm"
                rows={2}
                required
                disabled={isNotePending}
            />
            <Button type="submit" size="icon" disabled={isNotePending}>
                {isNotePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
            </Button>
        </form>
    );
}

/**
 * Component quản lý (thêm, sửa, xóa) lịch hẹn.
 */
function AppointmentManager({ customer, createAction, updateAction, cancelAction }) {
    const [appointments, setAppointments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const createFormRef = useRef(null);
    const actionUI = useActionUI();

    const [createState, dispatchCreate] = useActionState(createAction, null);
    const [updateState, dispatchUpdate] = useActionState(updateAction, null);
    const [cancelState, dispatchCancel] = useActionState(cancelAction, null);

    const fetchAppointments = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await appointment_data({ customerId: customer._id });
            setAppointments(data);
        } catch (error) {
            actionUI.showNoti(false, "Không thể tải danh sách lịch hẹn.");
        } finally {
            setIsLoading(false);
        }
    }, [customer._id, actionUI]);

    useEffect(() => {
        if (customer._id) fetchAppointments();
    }, [customer._id, fetchAppointments]);

    useEffect(() => {
        const state = createState || updateState || cancelState;
        if (state) {
            actionUI.showNoti(state.status, state.message);
            if (state.status) {
                fetchAppointments();
                if (createState) createFormRef.current?.reset();
            }
        }
    }, [createState, updateState, cancelState, fetchAppointments, actionUI]);

    return (
        <div className="p-4 space-y-6">
            <div>
                <h5 className="font-semibold mb-2">Tạo Lịch Hẹn Mới</h5>
                <form action={dispatchCreate} ref={createFormRef} className="space-y-3">
                    <input type="hidden" name="customerId" value={customer._id} />
                    <Input name="title" placeholder="Mục đích cuộc hẹn..." required />
                    <Input name="appointmentDate" type="datetime-local" required />
                    <Textarea name="notes" placeholder="Ghi chú thêm..." rows={2} />
                    <Button type="submit" className="w-full"><h6>Tạo Lịch Hẹn</h6></Button>
                </form>
            </div>
            <div>
                <h5 className="font-semibold mb-2">Danh Sách Lịch Hẹn</h5>
                <div className="space-y-2 max-h-60 scroll pr-2">
                    {isLoading ? <h6 className="text-center">Đang tải...</h6> : appointments.length > 0 ? (
                        appointments.map(app => (
                            <div key={app._id} className="border p-3 rounded-md">
                                <h6 className="font-semibold">{app.title}</h6>
                                <h6 className="text-sm text-muted-foreground">{new Date(app.appointmentDate).toLocaleString('vi-VN')}</h6>
                                {app.status === 'pending' && (
                                    <div className="flex gap-2 mt-2">
                                        <form action={dispatchUpdate}><input type="hidden" name="appointmentId" value={app._id} /><input type="hidden" name="newStatus" value="completed" /><Button type="submit" variant="outline" size="sm">Hoàn thành</Button></form>
                                        <form action={dispatchCancel}><input type="hidden" name="appointmentId" value={app._id} /><Button type="submit" variant="destructive" size="sm">Hủy</Button></form>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : <h6 className="text-center text-muted-foreground">Chưa có lịch hẹn nào.</h6>}
                </div>
            </div>
        </div>
    );
}

const updateFormSchema = z.object({
    name: z.string().min(2, { message: 'Tên là bắt buộc.' }),
    email: z.string().email({ message: 'Email không hợp lệ.' }).optional().or(z.literal('')),
    area: z.string().optional(),
    bd: z.string().optional(),
});

/**
 * Form cập nhật thông tin chi tiết của khách hàng.
 */
function CustomerUpdateForm({ customer, updateAction, onClose }) {
    const actionUI = useActionUI();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        resolver: zodResolver(updateFormSchema),
        defaultValues: {
            name: customer.name || '',
            email: customer.email || '',
            area: customer.area || '',
            bd: customer.bd ? new Date(customer.bd).toISOString().split('T')[0] : '',
        },
    });

    const onSubmit = async (values) => {
        setIsSubmitting(true);
        const formData = new FormData();
        formData.append('_id', customer._id);
        Object.entries(values).forEach(([key, value]) => {
            formData.append(key, value);
        });

        await actionUI.run(async () => updateAction(null, formData), {
            loadingText: "Đang cập nhật...",
            silentOnSuccess: false,
            onSuccess: (result) => {
                if (result.success) onClose();
            }
        });
        setIsSubmitting(false);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4 max-h-[calc(80vh-100px)] scroll">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (<FormItem><Label><h6>Tên khách hàng *</h6></Label><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="email" render={({ field }) => (<FormItem><Label><h6>Email</h6></Label><FormControl><Input type="email" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="bd" render={({ field }) => (<FormItem><Label><h6>Ngày sinh</h6></Label><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="area" render={({ field }) => (<FormItem><Label><h6>Khu vực</h6></Label><FormControl><Input {...field} /></FormControl></FormItem>)} />
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1"><Label><h6>Số điện thoại</h6></Label><Input defaultValue={customer.phone} disabled /></div>
                    <div className="space-y-1"><Label><h6>Tên Zalo</h6></Label><Input defaultValue={customer.zaloname} disabled /></div>
                </div>
                <div className="space-y-1"><Label><h6>Nguồn chi tiết</h6></Label><Input defaultValue={customer.sourceDetails} disabled /></div>
                <div className="space-y-1"><Label><h6>Dịch vụ quan tâm</h6></Label><Textarea defaultValue={Array.isArray(customer.tags) ? customer.tags.join(', ') : ''} disabled /></div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /><h6>Đang lưu...</h6></> : <h6>Lưu thay đổi</h6>}</Button>
                </DialogFooter>
            </form>
        </Form>
    );
}

/**
 * Component hiển thị lịch sử tương tác (Logs).
 */
function InteractionHistory({ customer, showNoti }) {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        const fetchHistory = async () => {
            setIsLoading(true);
            try {
                const result = await history_data(customer._id, 'customer');
                if (result.success) { setHistory(result.data); }
                else { showNoti(false, result.error || "Không thể tải lịch sử."); }
            } catch (error) { showNoti(false, "Lỗi khi tải lịch sử."); }
            finally { setIsLoading(false); }
        };
        if (customer._id) { fetchHistory(); }
    }, [customer._id, showNoti]);
    console.log(customer, history);

    return (
        <div className="p-4 max-h-[calc(80vh-100px)] scroll">
            <h4 className="mb-4 font-semibold" style={{ marginBottom: 8 }}>Lịch sử tương tác Zalo</h4>
            {isLoading ? <h6 className="text-center text-muted-foreground">Đang tải...</h6> : history.length > 0 ? (
                <div className="space-y-3">
                    {history.map((item, i) => (
                        <div key={item._id || i} className="border p-3 rounded-md">
                            <h6 className="font-semibold">Hành động: {item.type || 'Hành động'} - {new Date(item.createdAt).toLocaleString('vi-VN')}</h6>
                            <h6 className="font-semibold">Trạng thái: {item?.status?.status ? 'Thành công' : 'Thất bại'}</h6>
                            {item.createBy && <h6 className="text-xs text-muted-foreground">Thực hiện bởi: {item.createBy.name}</h6>}
                            <h6 className="text-sm text-muted-foreground mt-1">Nội dung: {item.status.message || 'Không có mô tả.'}</h6>

                        </div>
                    ))}
                </div>
            ) : <h6 className="text-center text-muted-foreground">Chưa có lịch sử.</h6>}
        </div>
    );
}

function CustomerPipelineDisplay({ customer, addNoteAction, isNotePending, noteState }) {
    const PIPELINE_STAGES = useMemo(() => [
        { id: 1, title: 'Tiếp nhận & Xử lý', statuses: ['new_unconfirmed', 'missing_info', 'duplicate_merged', 'rejected_immediate', 'valid'] },
        { id: 2, title: 'Nhắn tin xác nhận', statuses: [] },
        { id: 3, title: 'Phân bổ Telesale', statuses: ['assigned'] },
        { id: 4, title: 'Telesale Tư vấn', statuses: ['consulted'] },
        { id: 5, title: 'Nhắc lịch & Xác nhận', statuses: ['appointed'] },
        { id: 6, title: 'Chốt dịch vụ', statuses: ['serviced', 'rejected'] }
    ], []);

    const currentStageIndex = useMemo(() => {
        const maxStep = customer.care.reduce((max, note) => Math.max(max, note.step || 0), 0);
        if (maxStep > 0) return maxStep - 1;

        const foundIndex = PIPELINE_STAGES.findIndex(stage => stage.statuses.includes(customer.pipelineStatus));
        return foundIndex > -1 ? foundIndex : 0;
    }, [customer, PIPELINE_STAGES]);

    return (
        <div className="p-4 max-h-[calc(80vh-100px)] scroll">
            <Accordion type="single" collapsible defaultValue={`item-${currentStageIndex}`} className="w-full">
                {PIPELINE_STAGES.map((stage, index) => {
                    const status = index < currentStageIndex ? 'completed' : (index === currentStageIndex ? 'current' : 'pending');
                    const Icon = status === 'completed' ? CheckCircle2 : (status === 'current' ? CircleDot : Circle);
                    const color = status === 'completed' ? 'text-green-500' : (status === 'current' ? 'text-blue-500' : 'text-slate-400');
                    const notesForStage = customer.care.filter(note => note.step === stage.id);

                    return (
                        <AccordionItem key={stage.id} value={`item-${index}`}>
                            <AccordionTrigger className={`hover:no-underline ${status === 'current' ? 'bg-muted/50' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <Icon className={`h-5 w-5 ${color}`} />
                                    <h5>{stage.id}. {stage.title}</h5>
                                </div>
                                {notesForStage.length > 0 && <MessageSquare className="h-4 w-4 text-muted-foreground ml-auto" />}
                            </AccordionTrigger>
                            <AccordionContent className="p-2">
                                <div className="border rounded-md p-2">
                                    {notesForStage.length > 0
                                        ? notesForStage.map(note => <CareNoteItem key={note._id} note={note} />)
                                        : <h6 className='text-center text-muted-foreground p-4'>Chưa có hoạt động.</h6>
                                    }
                                    {/* MỚI: Truyền step hiện tại (stage.id) xuống AddNoteForm */}
                                    <AddNoteForm
                                        customerId={customer._id}
                                        dispatchAddNote={addNoteAction}
                                        isNotePending={isNotePending}
                                        noteState={noteState}
                                        currentStep={stage.id}
                                    />
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
            </Accordion>
        </div>
    );
}

// =============================================================
// == 2. COMPONENT CHÍNH VÀ CÁC POPUP
// =============================================================
export default function CustomerRow({ customer, index, isSelected, onSelect, visibleColumns, renderCellContent, user, viewMode, zalo }) {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('pipeline');
    const actionUI = useActionUI();
    const processedNoteState = useRef(null);

    // SỬA LẠI: Quản lý state action tại component cha
    const [noteState, addNoteActionFn, isNotePending] = useActionState(addCareNoteAction, null);

    useEffect(() => {
        if (noteState && noteState !== processedNoteState.current) {
            actionUI.showNoti(noteState.success, noteState.message || noteState.error);
            processedNoteState.current = noteState;
        }
    }, [noteState, actionUI]);

    const handleOpenPopup = (e) => {
        if (e.target.closest('input[type="checkbox"]')) return;
        setIsPopupOpen(true);
    };

    const handlePointerDownOutside = (event) => {
        const target = event.target;
        if (target.closest('[data-action-ui-container]')) {
            event.preventDefault();
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'pipeline':
                return <CustomerPipelineDisplay
                    customer={customer}
                    addNoteAction={addNoteActionFn}
                    isNotePending={isNotePending}
                    noteState={noteState}
                />;
            case 'history': return <InteractionHistory customer={customer} showNoti={actionUI.showNoti} />;
            case 'info': return <CustomerUpdateForm customer={customer} updateAction={updateCustomerInfo} onClose={() => setIsPopupOpen(false)} />;
            case 'appointments': return <AppointmentManager customer={customer} createAction={createAppointmentAction} updateAction={updateApptStatusAction} cancelAction={cancelAppointmentAction} />;
            default: return null;
        }
    };

    return (
        <>
            <actionUI.UI />
            {isPopupOpen && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />}

            <TableRow data-state={isSelected ? "selected" : "unselected"} className="cursor-pointer">
                <TableCell onClick={(e) => e.stopPropagation()} className="w-[60px]">
                    <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelect(customer, checked)} />
                </TableCell>
                <TableCell className="font-medium w-[80px]" onClick={handleOpenPopup}><h6>{index}</h6></TableCell>
                {visibleColumns.map(colKey => (
                    <TableCell key={colKey} className="truncate" onClick={handleOpenPopup}>
                        {renderCellContent(customer, colKey)}
                    </TableCell>
                ))}
            </TableRow>

            <Dialog open={isPopupOpen} onOpenChange={setIsPopupOpen} modal={false}>
                <DialogContent
                    onPointerDownOutside={handlePointerDownOutside}
                    showCloseButton={false}
                    className="max-w-4xl p-0 gap-0 flex flex-col md:flex-row h-[80vh] z-50"
                >
                    <div className="md:hidden flex-shrink-0"><CustomerDetailHeader customer={customer} zalo={zalo} /></div>
                    <div className="flex-1 scroll">
                        <div className="hidden md:block"><CustomerDetailHeader customer={customer} zalo={zalo} /></div>
                        {renderContent()}
                    </div>
                    <Separator orientation="vertical" className="hidden md:block" />
                    <div className="w-full md:w-56 p-4 flex-shrink-0 flex md:flex-col gap-3 border-t md:border-t-0 md:border-l overflow-x-auto md:scroll">
                        <Button variant={activeTab === 'pipeline' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('pipeline')}><LayoutDashboard className="h-5 w-5" /><h6 className="text-xs">Lịch trình</h6></Button>
                        <Button variant={activeTab === 'history' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('history')}><Clock className="h-5 w-5" /><h6 className="text-xs">Lịch sử</h6></Button>
                        <Button variant={activeTab === 'info' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('info')}><User className="h-5 w-5" /><h6 className="text-xs">Thông tin</h6></Button>
                        <Button variant={activeTab === 'appointments' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('appointments')}><CalendarCheck className="h-5 w-5" /><h6 className="text-xs">Lịch hẹn</h6></Button>
                    </div>
                    <DialogClose className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                        <X className="h-4 w-4" />
                        <VisuallyHidden><span>Close</span></VisuallyHidden>
                    </DialogClose>
                </DialogContent>
            </Dialog>
        </>
    );
}