'use client';

import React, { useEffect, useRef } from 'react';
import { FileImage, DollarSign, Percent, Tag, X, Plus } from 'lucide-react';

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';

export default function CloseServiceForm({
    form,
    status,
    services,
    availableCourses,
    listPrice,
    finalRevenue,
    discountType,
    fileReg,                 // form.register('invoiceImage')
    onImageChange,
    existingImageUrls = [],
    newImagePreviews = [],
    onRemoveNewImage,
    onSubmit,
}) {
    if (!form) return null;

    const currencyVN = (n) => new Intl.NumberFormat('vi-VN').format(Number(n || 0));

    // cập nhật cờ boolean cho Zod khi có ảnh cũ
    useEffect(() => {
        form.setValue('hasExistingInvoice', (existingImageUrls?.length ?? 0) > 0, { shouldValidate: true });
    }, [existingImageUrls, form]);

    // input file ẩn + ref kép để click từ tile
    const reg = fileReg || {};
    const { ref: rhfRef = () => { }, name = 'invoiceImage', onBlur = () => { }, onChange: rhfOnChange } = reg;
    const fileInputRef = useRef(null);
    const attachRef = (el) => { fileInputRef.current = el; try { rhfRef(el); } catch (_) { } };
    const openFileDialog = () => fileInputRef.current?.click();

    const handleFileChange = (e) => {
        onImageChange?.(e);

        // Cho phép chọn lại cùng file vẫn onChange
        e.target.value = '';
    };

    return (
        <Form {...form}>
            <form
                id="close-service-form"
                className="space-y-6"
                onSubmit={form.handleSubmit(onSubmit)}
            >
                {/* Hidden boolean cho zod (z.coerce.boolean) */}
                <input type="hidden" {...form.register('hasExistingInvoice')} />

                {/* -------- Trạng thái cuối -------- */}
                <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem className="space-y-3">
                        <FormLabel>Trạng thái cuối *</FormLabel>
                        <FormControl>
                            <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value ?? 'completed'}
                                className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4"
                            >
                                <FormItem className="flex items-center space-x-2">
                                    <FormControl><RadioGroupItem value="completed" /></FormControl>
                                    <FormLabel className="font-normal">Hoàn thành</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2">
                                    <FormControl><RadioGroupItem value="in_progress" /></FormControl>
                                    <FormLabel className="font-normal">Còn liệu trình</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2">
                                    <FormControl><RadioGroupItem value="rejected" /></FormControl>
                                    <FormLabel className="font-normal">Từ chối sau khám</FormLabel>
                                </FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                {/* -------- Dịch vụ -------- */}
                <FormField control={form.control} name="selectedService" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Dịch vụ chốt *</FormLabel>
                        <Select
                            onValueChange={(val) => field.onChange(String(val))}
                            value={field.value ? String(field.value) : undefined}
                            disabled={status === 'rejected'}
                        >
                            <FormControl>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="-- Chọn dịch vụ --" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {services?.map((s) => (
                                    <SelectItem key={s._id} value={String(s._id)}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />

                {/* Liệu trình thực hiện */}
                <FormField control={form.control} name="selectedCourseName" render={({ field }) => {
                    console.log(field);

                    return (
                        <FormItem>
                            <FormLabel>Liệu trình thực hiện *</FormLabel>
                            <Select
                                onValueChange={(val) => field.onChange(String(val))}
                                value={field.value ? String(field.value) : undefined}
                                disabled={status === 'rejected' || !form.getValues('selectedService') || (availableCourses?.length || 0) === 0}
                            >
                                <FormControl>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="-- Chọn liệu trình --" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {availableCourses?.map((c, idx) => (
                                        <SelectItem key={`${c.name}-${idx}`} value={String(c.name)}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )
                }} />

                {/* -------- Giá & giảm giá -------- */}
                <div className="space-y-3">
                    <FormLabel>Giá &amp; Giảm giá</FormLabel>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-md bg-muted/50 mt-3">
                        <FormItem>
                            <FormLabel className="text-xs">Giá gốc (VND)</FormLabel>
                            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                                {currencyVN(listPrice)}
                            </div>
                        </FormItem>

                        <FormField control={form.control} name="discountValue" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs">Giá trị giảm</FormLabel>
                                <FormControl>
                                    <Input
                                        type="text"
                                        value={field.value ?? '0'}
                                        onChange={(e) => {
                                            const digits = e.target.value.replace(/\D/g, '');
                                            field.onChange(currencyVN(digits));
                                        }}
                                        disabled={status === 'rejected' || (form.getValues('discountType') ?? 'none') === 'none'}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="discountType" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs">Đơn vị giảm</FormLabel>
                                <FormControl>
                                    <Select onValueChange={field.onChange} value={field.value ?? 'none'} disabled={status === 'rejected'}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Loại" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none"><Tag className="w-4 h-4 mr-2 inline-block" />Không</SelectItem>
                                            <SelectItem value="amount"><DollarSign className="w-4 h-4 mr-2 inline-block" />VND</SelectItem>
                                            <SelectItem value="percent"><Percent className="w-4 h-4 mr-2 inline-block" />%</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormItem>
                            <FormLabel className="text-xs font-semibold">Thành tiền (VND)</FormLabel>
                            <div className="flex h-10 w-full items-center rounded-md border border-input px-3 py-2 text-sm">
                                {currencyVN(finalRevenue)}
                            </div>
                        </FormItem>
                    </div>
                </div>

                {/* -------- Ghi chú -------- */}
                <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Ghi chú</FormLabel>
                        <FormControl>
                            <Textarea
                                placeholder="Ghi chú thêm về hợp đồng, thanh toán..."
                                value={field.value ?? ''}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                {/* -------- Upload ảnh (gộp 1 chỗ) -------- */}
                <FormField control={form.control} name="invoiceImage" render={() => (
                    <FormItem>
                        <FormLabel className="flex items-center">
                            <FileImage className="mr-1 h-4 w-4" />
                            Ảnh minh chứng (Hóa đơn/Hợp đồng)
                            {form.getValues('_id') && form.getValues('hasExistingInvoice')
                                ? ' (đang có ảnh đã lưu, có thể thêm ảnh mới)'
                                : ' *'}
                        </FormLabel>

                        {/* input file ẩn */}
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            name={name}
                            onBlur={onBlur}
                            ref={attachRef}
                            onChange={handleFileChange}
                            className="hidden"
                        />

                        {/* grid preview + tile Thêm ảnh */}
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-2">
                            <button
                                type="button"
                                onClick={openFileDialog}
                                className="aspect-square border-2 border-dashed rounded-md flex flex-col items-center justify-center text-sm hover:bg-muted/40"
                                aria-label="Thêm ảnh"
                            >
                                <Plus className="w-6 h-6 mb-1" />
                                Thêm ảnh
                            </button>

                            {/* Ảnh đã lưu (khi sửa) */}
                            {existingImageUrls.map((url, index) => {
                                console.log(url);

                                return (
                                    <div key={`existing-${index}`} className="relative aspect-square">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={url} alt={`Ảnh đã lưu ${index + 1}`} className="h-full w-full object-cover rounded-md border" />
                                        <Badge variant="secondary" className="absolute top-1 left-1 text-xs">Đã lưu</Badge>
                                    </div>
                                )
                            })}

                            {/* Ảnh mới chọn */}
                            {newImagePreviews.map((preview, index) => (
                                <div key={`new-${index}`} className="relative aspect-square">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={preview.url} alt={`Xem trước ảnh ${index + 1}`} className="h-full w-full object-cover rounded-md border" />
                                    <button
                                        type="button"
                                        onClick={() => onRemoveNewImage(index)}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                                        aria-label="Xóa ảnh này"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <FormMessage />
                    </FormItem>
                )} />
            </form>
        </Form>
    );
}
