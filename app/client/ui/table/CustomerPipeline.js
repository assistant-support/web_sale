'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';

// --- Icon Imports ---
import {
    MessageSquare, CheckCircle2, CircleDot, Circle, Loader2, SendHorizonal,
    UserCheck, UserX, UserSearch, MessageSquareText, MessageSquareX, CheckCircle, XCircle, User
} from 'lucide-react';

// --- Shadcn UI Component Imports ---
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";

// --- Form Component Import ---
import CloseServiceForm from './CloseServiceForm'; // Component này vẫn được import vào đây

// =============================================================
// == CÁC COMPONENT PHỤ & HÀM HELPER CHO PIPELINE
// =============================================================

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
 * Form để thêm một ghi chú chăm sóc mới.
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

// --- Các hàm helper để xác định trạng thái cho từng bước pipeline ---
const getStep1Status = (customer) => {
    if (customer.uid === null) return { text: 'Tìm thất bại', Icon: UserX, className: 'bg-red-100 text-red-800' };
    if (Array.isArray(customer.uid) && customer.uid.length > 0) return { text: 'Tìm thành công', Icon: UserCheck, className: 'bg-green-100 text-green-800' };
    return { text: 'Chưa tìm UID', Icon: UserSearch, className: 'bg-gray-100 text-gray-800' };
};
const getStep2Status = (customer) => {
    const successNote = customer.care.find(note => note.content?.includes('Gửi tin nhắn Zalo] đã hoàn thành thành công'));
    if (successNote) return { text: 'Gửi tin thành công', Icon: MessageSquareText, className: 'bg-green-100 text-green-800' };
    const failNote = customer.care.find(note => note.content?.includes('Gửi tin nhắn Zalo] thất bại'));
    if (failNote) return { text: 'Gửi tin thất bại', Icon: MessageSquareX, className: 'bg-red-100 text-red-800' };
    return null;
};
const getStep3Status = (customer) => {
    if (Array.isArray(customer.assignees) && customer.assignees.length > 0) {
        const lastAssignment = customer.assignees[customer.assignees.length - 1];
        if (lastAssignment.group === 'ngoai_khoa') return { text: 'Phân bổ: Ngoại khoa', Icon: User, className: 'bg-purple-100 text-purple-800' };
        if (lastAssignment.group === 'noi_khoa') return { text: 'Phân bổ: Nội khoa', Icon: User, className: 'bg-indigo-100 text-indigo-800' };
    }
    return { text: 'Chưa phân bổ', Icon: User, className: 'bg-gray-100 text-gray-800' };
};
const getStep5Status = (customer) => {
    const hasAppointment = customer.pipelineStatus === 'appointed' || customer.care.some(note => note.content?.includes('Đặt lịch hẹn'));
    if (hasAppointment) return { text: 'Đã có lịch hẹn', Icon: CheckCircle, className: 'bg-green-100 text-green-800' };
    return null;
};
const getStep6Status = (customer) => {
    const status = customer.serviceDetails?.status;
    if (status === 'completed' || status === 'in_progress') return { text: 'Đã chốt dịch vụ', Icon: CheckCircle, className: 'bg-green-100 text-green-800' };
    if (status === 'rejected') return { text: 'Đã từ chối', Icon: XCircle, className: 'bg-red-100 text-red-800' };
    return null;
};

// =============================================================
// == COMPONENT CHÍNH CỦA PHẦN LỊCH TRÌNH
// =============================================================
export default function CustomerPipeline({
    customer,
    addNoteAction,
    isNotePending,
    noteState,
    closeServiceAction,
    closeState
}) {
    const PIPELINE_STAGES = useMemo(() => [
        { id: 1, title: 'Tiếp nhận & Xử lý', getStatus: getStep1Status },
        { id: 2, title: 'Nhắn tin xác nhận', getStatus: getStep2Status },
        { id: 3, title: 'Phân bổ Telesale', getStatus: getStep3Status },
        { id: 4, title: 'Telesale Tư vấn', getStatus: () => null },
        { id: 5, title: 'Nhắc lịch & Xác nhận', getStatus: getStep5Status },
        { id: 6, title: 'Chốt dịch vụ', getStatus: getStep6Status }
    ], []);

    const currentStageIndex = useMemo(() => {
        if (customer.serviceDetails?.status) return 5; // Bước 6
        const maxStep = customer.care.reduce((max, note) => Math.max(max, note.step || 0), 0);
        if (maxStep > 0) return maxStep - 1;
        const pipelineStatusMap = {
            'new_unconfirmed': 0, 'missing_info': 0, 'valid': 0,
            'messaged_pending': 1, 'messaged_responded': 1,
            'assigned': 2,
            'consulted': 3,
            'appointed': 4,
        };
        return pipelineStatusMap[customer.pipelineStatus] ?? 0;
    }, [customer]);

    return (
        <div className="p-4 max-h-[calc(80vh-100px)] overflow-y-auto">
            <Accordion type="single" collapsible defaultValue={`item-${currentStageIndex}`} className="w-full">
                {PIPELINE_STAGES.map((stage, index) => {
                    const isCompleted = customer.serviceDetails?.status || index < currentStageIndex;
                    const isCurrent = !isCompleted && index === currentStageIndex;
                    const status = isCompleted ? 'completed' : (isCurrent ? 'current' : 'pending');
                    const Icon = status === 'completed' ? CheckCircle2 : (isCurrent ? CircleDot : Circle);
                    const color = status === 'completed' ? 'text-green-500' : (isCurrent ? 'text-blue-500' : 'text-slate-400');
                    const notesForStage = customer.care.filter(note => note.step === stage.id);
                    const statusChip = stage.getStatus(customer);
                    console.log(notesForStage);
                    
                    if (stage.id === 6) {
                        console.log(notesForStage);
                    }


                    return (
                        <AccordionItem key={stage.id} value={`item-${index}`}>
                            <AccordionTrigger className={`hover:no-underline ${status === 'current' ? 'bg-muted/50' : ''}`}>
                                <div className="flex items-center gap-3 flex-1">
                                    <Icon className={`h-5 w-5 ${color} flex-shrink-0`} />
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h5>{stage.id}. {stage.title}</h5>
                                        {statusChip && (
                                            <Badge variant="secondary" className={`font-normal ${statusChip.className}`}>
                                                <statusChip.Icon className="h-3 w-3 mr-1" />
                                                {statusChip.text}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                {notesForStage.length > 0 && <MessageSquare className="h-4 w-4 text-muted-foreground ml-3 flex-shrink-0" />}
                            </AccordionTrigger>
                            <AccordionContent className="p-2">
                                <div className="border rounded-md p-2">
                                    {notesForStage.length > 0
                                        ? notesForStage.map(note => <CareNoteItem key={note._id} note={note} />)
                                        : <h6 className='text-center text-muted-foreground p-4'>Chưa có hoạt động.</h6>
                                    }
                                    {stage.id === 6 ? (
                                        <>
                                            {notesForStage.map(note => <CareNoteItem key={note._id} note={note} />)}
                                            <div className="border-t mt-3 pt-3">
                                                <CloseServiceForm
                                                    customer={customer}
                                                    dispatchAction={closeServiceAction}
                                                    actionState={closeState}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <AddNoteForm
                                            customerId={customer._id}
                                            dispatchAddNote={addNoteAction}
                                            isNotePending={isNotePending}
                                            noteState={noteState}
                                            currentStep={stage.id}
                                        />
                                    )}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
            </Accordion>
        </div>
    );
}