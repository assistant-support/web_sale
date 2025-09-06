'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from "sonner";

// --- Icon Imports ---
import {
    Loader2, FileImage, DollarSign, StickyNote, Send, ShieldCheck
} from 'lucide-react';

// --- Action & Data Function Imports ---
import { closeServiceAction } from '@/data/customers/wraperdata.db';

// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// =============================================================
// == SCHEMA VALIDATION
// =============================================================
const closeServiceSchema = z.object({
    status: z.enum(['completed', 'in_progress', 'rejected'], {
        required_error: "Vui lòng chọn trạng thái chốt dịch vụ."
    }),
    revenue: z.string().optional(),
    notes: z.string().optional(),
    invoiceImage: z.any() // Zod không thể validate FileList trực tiếp, sẽ dùng superRefine
}).superRefine((data, ctx) => {
    // Nếu trạng thái không phải là "Từ chối" thì ảnh hóa đơn là bắt buộc
    if (data.status !== 'rejected' && (!data.invoiceImage || data.invoiceImage.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['invoiceImage'],
            message: "Ảnh hóa đơn/hợp đồng là bắt buộc khi chốt dịch vụ.",
        });
    }
});


// =============================================================
// == COMPONENT CHÍNH
// =============================================================
export default function CloseServiceCard({ customer }) {
    const [imagePreview, setImagePreview] = useState(null);
    const form = useForm({
        resolver: zodResolver(closeServiceSchema),
        defaultValues: {
            status: 'completed',
            revenue: '',
            notes: '',
            invoiceImage: null
        },
    });
    const { isSubmitting } = form.formState;

    // Hàm xử lý khi submit form
    const onSubmit = async (values) => {
        const formData = new FormData();
        formData.append('customerId', customer._id);
        formData.append('status', values.status);
        formData.append('revenue', values.revenue || '0');
        // 'tags' không có trong form này, action sẽ xử lý
        formData.append('notes', values.notes || '');

        if (values.invoiceImage && values.invoiceImage.length > 0) {
            formData.append('invoiceImage', values.invoiceImage[0]);
        }

        const promise = closeServiceAction(null, formData);

        toast.promise(promise, {
            loading: 'Đang xử lý và lưu trữ...',
            success: (result) => {
                if (result.success) {
                    form.reset();
                    setImagePreview(null);
                    // Tùy chọn: bạn có thể gọi một hàm callback ở đây nếu cần
                    // ví dụ: onActionSuccess();
                    return result.message || "Chốt dịch vụ thành công!";
                }
                throw new Error(result.error || "Có lỗi xảy ra từ máy chủ.");
            },
            error: (err) => err.message || 'Đã xảy ra lỗi không mong muốn.',
        });
    };

    // Ref cho input file để có thể trigger onChange
    const fileRef = form.register('invoiceImage');

    return (
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="flex items-center">
                    <ShieldCheck className="mr-2 h-5 w-5 text-green-600" />
                    <h4>Chốt Dịch Vụ & Lưu Trữ</h4>
                </CardTitle>
                <CardDescription>
                    Xác nhận trạng thái cuối, doanh thu và tải lên hóa đơn/hợp đồng để hoàn tất.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* Trạng thái Dịch vụ */}
                        <FormField control={form.control} name="status" render={({ field }) => (
                            <FormItem className="space-y-3">
                                <FormLabel>Trạng thái cuối *</FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="completed" /></FormControl><FormLabel className="font-normal">Hoàn thành</FormLabel></FormItem>
                                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="in_progress" /></FormControl><FormLabel className="font-normal">Còn liệu trình</FormLabel></FormItem>
                                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="rejected" /></FormControl><FormLabel className="font-normal">Từ chối sau khám</FormLabel></FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        {/* Doanh thu */}
                        <FormField control={form.control} name="revenue" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center"><DollarSign className="mr-1 h-4 w-4" /> Doanh thu (VND)</FormLabel>
                                <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        {/* Ghi chú */}
                        <FormField control={form.control} name="notes" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Ghi chú</FormLabel>
                                <FormControl><Textarea placeholder="Ghi chú thêm về hợp đồng, thanh toán..." {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        {/* Tải ảnh */}
                        <FormField control={form.control} name="invoiceImage" render={() => (
                            <FormItem>
                                <FormLabel className="flex items-center"><FileImage className="mr-1 h-4 w-4" /> Ảnh minh chứng (Hóa đơn/Hợp đồng)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        {...fileRef}
                                        onChange={(e) => {
                                            fileRef.onChange(e); // Báo cho react-hook-form về sự thay đổi
                                            if (e.target.files && e.target.files[0]) {
                                                setImagePreview(URL.createObjectURL(e.target.files[0]));
                                            } else {
                                                setImagePreview(null);
                                            }
                                        }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        {/* Xem trước ảnh */}
                        {imagePreview && <img src={imagePreview} alt="Xem trước ảnh" className="mt-2 rounded-md max-h-40 w-auto border p-1" />}

                        {/* Nút Submit */}
                        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Send className="mr-2 h-4 w-4" />
                            Xác nhận & Hoàn tất
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
