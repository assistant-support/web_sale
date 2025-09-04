'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// --- Icon Imports ---
import { Loader2 } from 'lucide-react';

// --- Action & Data Function Imports ---
import { updateCustomerInfo } from '@/app/actions/customer.actions';
import useActionUI from '@/hooks/useActionUI';

// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';


// =============================================================
// == COMPONENT CHÍNH CỦA PHẦN THÔNG TIN KHÁCH HÀNG
// =============================================================

const updateFormSchema = z.object({
    name: z.string().min(2, { message: 'Tên là bắt buộc.' }),
    email: z.string().email({ message: 'Email không hợp lệ.' }).optional().or(z.literal('')),
    area: z.string().optional(),
    bd: z.string().optional(),
});

export default function CustomerInfo({ customer, onClose }) {
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
        Object.entries(values).forEach(([key, value]) => formData.append(key, value || ''));
        const result = await updateCustomerInfo(null, formData);
        actionUI.showNoti(result.success, result.message || result.error);
        setIsSubmitting(false);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4 flex-1 scroll">
                <h4 className='text_w_600' style={{ marginBottom: 16 }}>Thông tin cơ bản</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (<FormItem><Label><h6>Tên khách hàng *</h6></Label><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="email" render={({ field }) => (<FormItem><Label><h6>Email</h6></Label><FormControl><Input type="email" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="bd" render={({ field }) => (<FormItem><Label><h6>Ngày sinh</h6></Label><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="area" render={({ field }) => (<FormItem><Label><h6>Khu vực</h6></Label><FormControl><Input {...field} /></FormControl></FormItem>)} />
                </div>
                <Separator className="my-4" />
                <h4 className='text_w_600' style={{ marginBottom: 16 }}>Thông tin liên hệ</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1 grid gap-2"><Label><h6>Số điện thoại</h6></Label><Input defaultValue={customer.phone} disabled /></div>
                    <div className="space-y-1 grid gap-2"><Label><h6>Tên Zalo</h6></Label><Input defaultValue={customer.zaloname} disabled /></div>
                </div>
                <div className="space-y-1 grid gap-2"><Label><h6>Nguồn chi tiết</h6></Label><Input defaultValue={customer.sourceDetails} disabled /></div>
                <div className="space-y-1 grid gap-2"><Label><h6>Dịch vụ quan tâm</h6></Label>
                    {customer.tags.map((item, index) => {
                        return <h5 key={index}>- {item.name}</h5>
                    })}</div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /><h6 style={{ color: 'white' }}>Đang lưu...</h6></> : <h6 style={{ color: 'white' }}>Lưu thay đổi</h6>}
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    );
}