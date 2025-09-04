'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';

// --- Icon Imports ---
import { Check, X, FileImage, DollarSign, Tag, MessageSquare, Loader2, SendHorizonal } from 'lucide-react';

// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/**
 * Nút Submit với trạng thái pending tự động từ useFormStatus.
 */
function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang xử lý...</>
            ) : (
                <><SendHorizonal className="mr-2 h-4 w-4" /> Xác nhận chốt dịch vụ</>
            )}
        </Button>
    );
}

/**
 * Form chuyên dụng cho Bước 6: Chốt dịch vụ, ghi nhận hóa đơn, doanh thu và các thông tin liên quan.
 */
export default function CloseServiceForm({ customerId, dispatchAction, actionState }) {
    const formRef = useRef(null);
    const [selectedStatus, setSelectedStatus] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    // Reset form và ảnh preview khi có kết quả thành công từ action
    useEffect(() => {
        if (actionState?.success) {
            formRef.current?.reset();
            setImagePreview(null);
            setSelectedStatus(null);
        }
    }, [actionState]);

    // Xử lý việc hiển thị ảnh xem trước khi người dùng chọn file
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        } else {
            setImagePreview(null);
        }
    };

    return (
        <form ref={formRef} action={dispatchAction} className="space-y-4 p-2">
            <input type="hidden" name="customerId" value={customerId} />

            {/* --- Trạng thái chốt --- */}
            <div>
                <Label className="font-semibold">Trạng thái cuối cùng *</Label>
                <RadioGroup
                    name="status"
                    required
                    onValueChange={setSelectedStatus}
                    className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                    <div className="flex items-center space-x-2 border p-3 rounded-md has-[:checked]:bg-green-50 has-[:checked]:border-green-300">
                        <RadioGroupItem value="completed" id="s-completed" />
                        <Label htmlFor="s-completed" className="flex items-center gap-2 cursor-pointer w-full">
                            <Check className="h-4 w-4 text-green-600" /> <div><h6>Hoàn tất</h6></div>
                        </Label>
                    </div>
                    <div className="flex items-center space-x-2 border p-3 rounded-md has-[:checked]:bg-blue-50 has-[:checked]:border-blue-300">
                        <RadioGroupItem value="in_progress" id="s-progress" />
                        <Label htmlFor="s-progress" className="flex items-center gap-2 cursor-pointer w-full">
                            <Loader2 className="h-4 w-4 text-blue-600" /> <div><h6>Còn liệu trình</h6></div>
                        </Label>
                    </div>
                    <div className="flex items-center space-x-2 border p-3 rounded-md has-[:checked]:bg-red-50 has-[:checked]:border-red-300">
                        <RadioGroupItem value="rejected" id="s-rejected" />
                        <Label htmlFor="s-rejected" className="flex items-center gap-2 cursor-pointer w-full">
                            <X className="h-4 w-4 text-red-600" /> <div><h6>Từ chối</h6></div>
                        </Label>
                    </div>
                </RadioGroup>
            </div>

            {/* --- Hiển thị các trường thông tin khác khi đã chọn trạng thái --- */}
            {selectedStatus && (
                <div className="space-y-4 animate-in fade-in-50 duration-300">
                    {/* --- Upload ảnh (bắt buộc trừ khi từ chối) --- */}
                    {selectedStatus !== 'rejected' && (
                        <div>
                            <Label htmlFor="invoiceImage" className="font-semibold flex items-center gap-2">
                                <FileImage className="h-4 w-4" /> Ảnh Hóa đơn / Hợp đồng *
                            </Label>
                            <Input id="invoiceImage" name="invoiceImage" type="file" required accept="image/*" className="mt-2" onChange={handleFileChange} />
                            {imagePreview && (
                                <div className="mt-2 relative w-32 h-32 border rounded-md overflow-hidden">
                                    <Image src={imagePreview} alt="Xem trước" layout="fill" objectFit="cover" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- Doanh thu (tùy chọn, ẩn khi từ chối) --- */}
                    {selectedStatus !== 'rejected' && (
                        <div>
                            <Label htmlFor="revenue" className="font-semibold flex items-center gap-2">
                                <DollarSign className="h-4 w-4" /> Doanh thu (VND)
                            </Label>
                            <Input id="revenue" name="revenue" type="number" placeholder="Nhập số tiền..." className="mt-2" />
                        </div>
                    )}

                    {/* --- Ghi chú (tùy chọn) --- */}
                    <div>
                        <Label htmlFor="notes" className="font-semibold flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" /> Ghi chú thêm
                        </Label>
                        <Textarea id="notes" name="notes" placeholder="Nhập ghi chú chi tiết về lần chốt dịch vụ..." className="mt-2" rows={3} />
                    </div>

                    {/* --- Nút Submit --- */}
                    <SubmitButton />
                </div>
            )}
        </form>
    );
}