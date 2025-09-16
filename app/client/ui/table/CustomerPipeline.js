'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    MessageSquare, CheckCircle2, CircleDot, Circle,
    UserCheck, UserX, UserSearch, MessageSquareText, MessageSquareX,
    CheckCircle, XCircle, User, Pencil, Trash2, ShieldCheck, BadgeCheck, Loader2
} from 'lucide-react';
import { getCurrentStageFromPipeline } from '@/function/index';

// shadcn/ui
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// Actions server (khớp với file JS bạn đã tạo)
import {
    updateServiceDetailAction,
    deleteServiceDetailAction,
} from '@/data/customers/wraperdata.db';

// Form chốt dịch vụ (giữ nguyên behavior “thêm serviceDetails”)
import CloseServiceForm from './CloseServiceForm';

// Hook hiển thị overlay + toast khi gọi actions
import { useActionFeedback as useAction } from '@/hooks/useAction';

/* ============================================================
 * Helpers & Subcomponents
 * ============================================================ */

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

function CareNoteItem({ note }) {
    return (
        <div className="flex gap-3 items-start py-2">
            <Avatar className="h-8 w-8">
                <AvatarImage src={note.createBy?.avt || undefined} alt={note.createBy?.name} />
                <AvatarFallback>{note.createBy?.name?.charAt(0) || 'S'}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
                <div className="flex justify-between items-center">
                    <h6 className="font-semibold">{note.createBy?.name || 'Hệ thống'}</h6>
                    <h6 className="text-xs text-muted-foreground">
                        {new Date(note.createAt).toLocaleString('vi-VN')}
                    </h6>
                </div>
                <h6 className="text-sm text-muted-foreground mt-1">{note.content}</h6>
            </div>
        </div>
    );
}

function AddNoteForm({ customerId, dispatchAddNote, isNotePending, noteState, currentStep }) {
    const formRef = useRef(null);
    useEffect(() => {
        if (noteState?.success) formRef.current?.reset();
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
                {isNotePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            </Button>
        </form>
    );
}

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

// ✅ Step 6: dựa trên MẢNG serviceDetails
const getStep6Status = (customer) => {
    const list = Array.isArray(customer.serviceDetails)
        ? customer.serviceDetails
        : (customer.serviceDetails ? [customer.serviceDetails] : []);
    if (list.length === 0) return null;

    const approvedCount = list.filter(d => d.approvalStatus === 'approved').length;
    const pendingCount = list.filter(d => d.approvalStatus !== 'approved').length;

    if (approvedCount > 0) return { text: `${approvedCount} đơn đã duyệt`, Icon: CheckCircle, className: 'bg-green-100 text-green-800' };
    if (pendingCount > 0) return { text: `${pendingCount} đơn chờ duyệt`, Icon: CircleDot, className: 'bg-amber-100 text-amber-800' };
    return null;
};

/* ============================================================
 * Bước 6: Danh sách serviceDetails + Tổng đã nhận + Sửa/Xóa (chỉ người tạo)
 *  - KHÔNG có nút duyệt ở đây
 *  - KHÔNG hiển thị care ở bước 6
 * ============================================================ */
function ServiceDetailsSection({ customer, services = [], currentUserId }) {
    const { run } = useAction();
    const router = useRouter();

    const details = useMemo(() => {
        const arr = Array.isArray(customer.serviceDetails)
            ? customer.serviceDetails
            : (customer.serviceDetails ? [customer.serviceDetails] : []);
        return [...arr].sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));
    }, [customer.serviceDetails]);

    const approvedTotalReceived = useMemo(
        () => details
            .filter(d => d.approvalStatus === 'approved')
            .reduce((sum, d) => sum + (Number(d.amountReceivedTotal) || 0), 0),
        [details]
    );

    const [editingId, setEditingId] = useState(null);

    const handleDelete = async (customerId, serviceDetailId) => {
        const fd = new FormData();
        fd.append('customerId', customerId);
        fd.append('serviceDetailId', serviceDetailId);

        await run(
            deleteServiceDetailAction,
            [null, fd],
            {
                successMessage: (res) => res?.message || 'Đã xóa đơn.',
                errorMessage: (res) => res?.error || 'Xóa đơn thất bại.',
            }
        );
    };

    const handleUpdate = async (customerId, serviceDetailId, e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.append('customerId', customerId);
        fd.append('serviceDetailId', serviceDetailId);

        await run(
            updateServiceDetailAction,
            [null, fd],
            {
                successMessage: (res) => res?.message || 'Đã cập nhật đơn.',
                errorMessage: (res) => res?.error || 'Cập nhật đơn thất bại.',
                onSuccess: () => setEditingId(null),
            }
        );
    };

    return (
        <div className="space-y-4">
            {/* Tổng đã nhận từ các đơn đã duyệt */}
            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
                <div className="flex items-center gap-2">
                    <BadgeCheck className="h-5 w-5 text-green-600" />
                    <span className="font-medium">Tổng đã nhận (đơn đã duyệt):</span>
                </div>
                <span className="font-semibold">{vnd.format(approvedTotalReceived)}</span>
            </div>

            {details.length === 0 ? (
                <h6 className="text-center text-muted-foreground py-6">Chưa có đơn chốt nào.</h6>
            ) : (
                <div className="space-y-3">
                    {details.map((d, idx) => {
                        const approved = d.approvalStatus === 'approved';
                        const canEditOrDelete =
                            !approved &&
                            (!!currentUserId) &&
                            (
                                (typeof d.closedBy === 'string' && d.closedBy === currentUserId) ||
                                (d.closedBy?._id && d.closedBy._id === currentUserId)
                            );

                        const statusChip = d.status === 'completed'
                            ? { text: 'Hoàn thành', className: 'bg-green-100 text-green-800' }
                            : d.status === 'in_progress'
                                ? { text: 'Còn liệu trình', className: 'bg-amber-100 text-amber-800' }
                                : { text: 'Mới', className: 'bg-slate-100 text-slate-800' };

                        const approvalChip = approved
                            ? { text: 'Đã duyệt', className: 'bg-emerald-100 text-emerald-800', Icon: CheckCircle }
                            : { text: 'Chờ duyệt', className: 'bg-amber-100 text-amber-800', Icon: CircleDot };

                        const serviceName =
                            d.selectedService?.name ||
                            d.selectedService?.code ||
                            (typeof d.selectedService === 'string' ? d.selectedService : 'Không rõ');

                        const finalPrice = Number(d?.pricing?.finalPrice || 0);
                        const received = Number(d?.amountReceivedTotal || 0);
                        const owe = Number(d?.outstandingAmount || Math.max(0, finalPrice - received));
                        const revenue = Number(d?.revenue || 0);

                        return (
                            <Card key={d._id || idx} className="border">
                                <CardContent className="p-3">
                                    <div className="flex flex-col gap-2">
                                        {/* Header */}
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className="h-5 w-5 text-primary" />
                                                <div className="font-semibold">
                                                    Đơn chốt #{String(d._id || '').slice(-6)}
                                                    {serviceName ? ` • ${serviceName}` : ''}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Badge className={`font-normal ${statusChip.className}`}>{statusChip.text}</Badge>
                                                <Badge className={`font-normal ${approvalChip.className}`}>
                                                    <approvalChip.Icon className="h-3 w-3 mr-1" />
                                                    {approvalChip.text}
                                                </Badge>
                                            </div>
                                        </div>

                                        {/* Money */}
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
                                            <div className="rounded-md bg-muted/40 p-2">
                                                <div className="text-muted-foreground">Giá chốt</div>
                                                <div className="font-medium">{vnd.format(finalPrice)}</div>
                                            </div>
                                            <div className="rounded-md bg-muted/40 p-2">
                                                <div className="text-muted-foreground">Đã nhận</div>
                                                <div className="font-medium">{vnd.format(received)}</div>
                                            </div>
                                            <div className="rounded-md bg-muted/40 p-2">
                                                <div className="text-muted-foreground">Còn nợ</div>
                                                <div className="font-medium">{vnd.format(owe)}</div>
                                            </div>
                                            <div className="rounded-md bg-muted/40 p-2">
                                                <div className="text-muted-foreground">Revenue</div>
                                                <div className="font-medium">{vnd.format(revenue)}</div>
                                            </div>
                                        </div>

                                        {/* Meta */}
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
                                            <div className="flex gap-3">
                                                {/* Nếu muốn hiển thị người thực hiện thì bỏ comment dòng dưới */}
                                                <span>Chốt bởi: <b>{d.closedBy?.name || d.closedBy || '—'}</b></span>
                                                <span>Lúc: <b>{d.closedAt ? new Date(d.closedAt).toLocaleString('vi-VN') : '—'}</b></span>
                                            </div>
                                            {approved && (
                                                <div className="flex gap-3">
                                                    <span>Duyệt bởi: <b>{d.approvedBy?.name || d.approvedBy || '—'}</b></span>
                                                    <span>Lúc: <b>{d.approvedAt ? new Date(d.approvedAt).toLocaleString('vi-VN') : '—'}</b></span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Ghi chú */}
                                        {d.notes && (
                                            <div className="text-sm text-muted-foreground">Ghi chú: {d.notes}</div>
                                        )}

                                        {/* Actions: chỉ người tạo & chỉ khi pending */}
                                        <div className="flex flex-wrap items-center gap-2 pt-2">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => setEditingId(editingId === d._id ? null : d._id)}
                                            >
                                                <Pencil className="h-4 w-4 mr-1" />
                                                Sửa
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => handleDelete(customer._id, d._id)}
                                            >
                                                <Trash2 className="h-4 w-4 mr-1" />
                                                Xóa
                                            </Button>
                                        </div>
                                        {/* Inline edit form (pending + đúng người tạo) */}
                                        {editingId === d._id && (
                                            <form
                                                className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3"
                                                onSubmit={(e) => handleUpdate(customer._id, d._id, e)}
                                            >
                                                <div className="space-y-1">
                                                    <Label>Trạng thái</Label>
                                                    <select
                                                        name="status"
                                                        defaultValue={d.status || 'in_progress'}
                                                        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        <option value="new">Mới</option>
                                                        <option value="in_progress">Còn liệu trình</option>
                                                        <option value="completed">Hoàn thành</option>
                                                        <option value="rejected">Từ chối sau khám</option>
                                                    </select>
                                                </div>

                                                <div className="space-y-1">
                                                    <Label>Dịch vụ</Label>
                                                    <select
                                                        name="selectedService"
                                                        defaultValue={typeof d.selectedService === 'string' ? d.selectedService : d.selectedService?._id || ''}
                                                        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        <option value="">-- Chọn dịch vụ --</option>
                                                        {services.map(s => (
                                                            <option key={s._id} value={s._id}>{s.name}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="space-y-1 sm:col-span-2">
                                                    <Label>Ghi chú</Label>
                                                    <Textarea name="notes" defaultValue={d.notes || ''} rows={2} />
                                                </div>

                                                <div className="space-y-1 sm:col-span-2">
                                                    <Label>Thay ảnh hóa đơn (nếu cần)</Label>
                                                    <Input type="file" name="invoiceImage" accept="image/*" />
                                                </div>

                                                <div className="sm:col-span-2 flex justify-end gap-2">
                                                    <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                                                        Hủy
                                                    </Button>
                                                    <Button type="submit">
                                                        <Pencil className="h-4 w-4 mr-1" />
                                                        Lưu thay đổi
                                                    </Button>
                                                </div>
                                            </form>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ============================================================
 * COMPONENT CHÍNH: CustomerPipeline
 *  - BỎ NÚT DUYỆT ở bước 6
 *  - KHÔNG hiển thị care ở bước 6 (chỉ serviceDetails)
 *  - Sửa/Xóa nếu là người tạo và đơn chưa duyệt
 *  - Form thêm serviceDetails giữ nguyên
 * ============================================================ */
export default function CustomerPipeline({
    customer,
    addNoteAction,
    isNotePending,
    noteState,
    closeServiceAction,
    closeState,
    currentUserId,
}) {
    const PIPELINE_STAGES = useMemo(() => [
        { id: 1, title: 'Tiếp nhận & Xử lý', getStatus: getStep1Status },
        { id: 2, title: 'Nhắn tin xác nhận', getStatus: getStep2Status },
        { id: 3, title: 'Phân bổ Telesale', getStatus: getStep3Status },
        { id: 4, title: 'Telesale Tư vấn', getStatus: () => null },
        { id: 5, title: 'Nhắc lịch & Xác nhận', getStatus: getStep5Status },
        { id: 6, title: 'Chốt dịch vụ', getStatus: getStep6Status }
    ], []);

    const { currentStageId, currentStageIndex } = useMemo(() => {
        return getCurrentStageFromPipeline(customer);
    }, [customer]);

    return (
        <div className="p-4 max-h-[calc(80vh-100px)] overflow-y-auto">
            <Accordion type="single" collapsible defaultValue={`item-${currentStageIndex}`} className="w-full">
                {PIPELINE_STAGES.map((stage, index) => {
                    const isCompleted = stage.id < currentStageId;
                    const isCurrent = stage.id === currentStageId;
                    const status = isCompleted ? 'completed' : (isCurrent ? 'current' : 'pending');

                    const IconCmp = status === 'completed' ? CheckCircle2 : (isCurrent ? CircleDot : Circle);
                    const color = status === 'completed' ? 'text-green-500' : (isCurrent ? 'text-blue-500' : 'text-slate-400');

                    const notesForStage = customer.care.filter(note => note.step === stage.id);
                    const statusChip = stage.getStatus(customer);

                    return (
                        <AccordionItem key={stage.id} value={`item-${index}`}>
                            <AccordionTrigger className={`hover:no-underline ${status === 'current' ? 'bg-muted/50' : ''}`}>
                                <div className="flex items-center gap-3 flex-1">
                                    <IconCmp className={`h-5 w-5 ${color} flex-shrink-0`} />
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
                                {/* Icon ghi chú chỉ cho các bước ≠ 6 */}
                                {stage.id !== 6 && notesForStage.length > 0 && (
                                    <MessageSquare className="h-4 w-4 text-muted-foreground ml-3 flex-shrink-0" />
                                )}
                            </AccordionTrigger>

                            <AccordionContent className="p-2">
                                <div className="border rounded-md p-2">
                                    {/* KHÔNG hiển thị care ở bước 6 */}
                                    {stage.id !== 6 && (
                                        notesForStage.length > 0
                                            ? notesForStage.map(note => <CareNoteItem key={note._id || `${stage.id}-${Math.random()}`} note={note} />)
                                            : <h6 className='text-center text-muted-foreground p-4'>Chưa có hoạt động.</h6>
                                    )}

                                    {stage.id === 6 ? (
                                        <div className="border-t mt-3 pt-3 space-y-6">
                                            <ServiceDetailsSection
                                                customer={customer}
                                                services={customer.tags}
                                                currentUserId={currentUserId}
                                            />

                                            <div className="border-t pt-3">
                                                <CloseServiceForm
                                                    customer={customer}
                                                    services={customer.tags}
                                                    dispatchAction={closeServiceAction}
                                                    actionState={closeState}
                                                />
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
            </Accordion>
        </div>
    );
}
