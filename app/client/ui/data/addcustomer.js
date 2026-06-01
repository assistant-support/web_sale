// File: app/components/features/AddManualCustomer.jsx
'use client';

// ... (Giải thích và imports giữ nguyên)
import { useEffect, useMemo, useRef, useState } from 'react';
import { form_data } from '@/data/form_database/wraperdata.db';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { UserPlus, Calendar as CalendarIcon, Loader2, AlertCircle, ChevronsUpDown, Check, X } from 'lucide-react';
import useActionUI from '@/hooks/useActionUI';
import { addRegistrationToAction } from '@/app/actions/data.actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Alert, AlertDescription } from "@/components/ui/alert"


import {
    DIRECT_SOURCE_FORM_ID,
    DEFAULT_MANUAL_SOURCE_DETAIL,
    buildManualSourceFormOptions,
} from '@/utils/customerSourceConstants';

const DEFAULT_SOURCE_DETAIL = DEFAULT_MANUAL_SOURCE_DETAIL;
const SOURCE_DETAIL_VISIBLE_ROWS = 3;
const SOURCE_DETAIL_ROW_PX = 36;

// Cho phép chọn nhiều dịch vụ quan tâm; bắt buộc tối thiểu 1.
const formSchema = z.object({
    fullName: z.string().min(2, { message: 'Vui lòng nhập họ và tên.' }),
    phone: z.string().min(10, { message: 'Vui lòng nhập số điện thoại hợp lệ.' }),
    email: z.string().email({ message: 'Email không đúng định dạng.' }).optional().or(z.literal('')),
    address: z.string().optional(),
    service: z.array(z.string()).min(1, { message: 'Vui lòng chọn ít nhất một dịch vụ.' }),
    sourceFormId: z.string().optional(),
    dob: z.date().optional(),
    customerCode: z.string().optional(),
});

function SourceDetailsSelect({ value, onChange, placeholder = 'Chọn nguồn chi tiết...', options = [], isLoading, onOpenChange }) {
    const [open, setOpen] = useState(false);
    const commandListRef = useRef(null);
    const selectedOption = options.find((opt) => opt.value === value);
    const scrollable = options.length > SOURCE_DETAIL_VISIBLE_ROWS;
    const listStyle = scrollable
        ? {
            maxHeight: SOURCE_DETAIL_ROW_PX * SOURCE_DETAIL_VISIBLE_ROWS,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
        }
        : { overflow: 'visible' };

    const handleOpenChange = (newOpen) => {
        setOpen(newOpen);
        if (newOpen && onOpenChange) onOpenChange();
    };

    useEffect(() => {
        if (!open || !scrollable) return;
        let cleanup = null;
        const timer = setTimeout(() => {
            const element = commandListRef.current;
            if (!element) return;
            const handleWheel = (e) => {
                const { scrollTop, scrollHeight, clientHeight } = element;
                if (scrollHeight > clientHeight) {
                    const isAtTop = scrollTop <= 0;
                    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
                    if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) return;
                    e.stopPropagation();
                }
            };
            element.addEventListener('wheel', handleWheel, { passive: true });
            cleanup = () => element.removeEventListener('wheel', handleWheel);
        }, 100);
        return () => {
            clearTimeout(timer);
            if (cleanup) cleanup();
        };
    }, [open, scrollable]);

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
                    {selectedOption ? (
                        <span className="truncate">{selectedOption.label}</span>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" style={{ overflow: 'hidden' }}>
                <Command>
                    <CommandInput placeholder="Tìm kiếm nguồn..." className="flex-shrink-0" />
                    <div ref={commandListRef} style={listStyle}>
                        <CommandList style={{ overflow: 'visible', maxHeight: 'none', height: 'auto' }}>
                            {isLoading ? (
                                <div className="p-4 text-center">
                                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                    <p className="text-sm text-muted-foreground mt-2">Đang tải...</p>
                                </div>
                            ) : (
                                <>
                                    <CommandEmpty>Không tìm thấy nguồn.</CommandEmpty>
                                    <CommandGroup>
                                        {options.map((option) => (
                                            <CommandItem
                                                key={option.value}
                                                value={option.label}
                                                onSelect={() => {
                                                    onChange(option.value);
                                                    setOpen(false);
                                                }}
                                            >
                                                <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                                                {option.label}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </>
                            )}
                        </CommandList>
                    </div>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

// Multi-select dịch vụ: hiển thị các dịch vụ đã chọn dưới dạng badge, mở popover để tick chọn.
function ServiceMultiSelect({ options, selected, onChange }) {
    const [open, setOpen] = useState(false);
    const handleUnselect = (value) => onChange(selected.filter((v) => v !== value));
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-auto min-h-[40px]"
                >
                    <div className="flex gap-1 flex-wrap">
                        {selected.length > 0 ? (
                            options
                                .filter((opt) => selected.includes(opt.value))
                                .map((opt) => (
                                    <Badge
                                        variant="secondary"
                                        key={opt.value}
                                        className="mr-1 mb-1"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleUnselect(opt.value);
                                        }}
                                    >
                                        <h6>{opt.label}</h6>
                                        <X className="h-3 w-3 ml-1 text-muted-foreground cursor-pointer" />
                                    </Badge>
                                ))
                        ) : (
                            <h6>Chọn dịch vụ...</h6>
                        )}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Tìm kiếm dịch vụ..." />
                    <CommandList>
                        <CommandEmpty>Không tìm thấy dịch vụ.</CommandEmpty>
                        <CommandGroup>
                            {options.map((opt) => (
                                <CommandItem
                                    key={opt.value}
                                    onSelect={() => {
                                        onChange(
                                            selected.includes(opt.value)
                                                ? selected.filter((v) => v !== opt.value)
                                                : [...selected, opt.value]
                                        );
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            selected.includes(opt.value) ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    {opt.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

/**
 * Component chính để hiển thị nút và popup thêm khách hàng.
 * @param {{ service: Array<{_id: string, name: string}> }} props - Prop chứa danh sách các dịch vụ.
 */
export default function Customer_add({ service, formSources = [] }) {
    const [isOpen, setIsOpen] = useState(false);
    const actionUI = useActionUI();
    const [suggestedCustomerCode, setSuggestedCustomerCode] = useState('');
    const [isSuggestingCode, setIsSuggestingCode] = useState(false);
    const [localFormSources, setLocalFormSources] = useState(() => (Array.isArray(formSources) ? formSources : []));
    const [isLoadingSourceForms, setIsLoadingSourceForms] = useState(false);

    const form = useForm({
        resolver: zodResolver(formSchema),
        mode: 'onChange',
        defaultValues: {
            fullName: '', phone: '', email: '', address: '', service: [],
            sourceFormId: DIRECT_SOURCE_FORM_ID,
            dob: undefined,
            customerCode: '',
        },
    });

    useEffect(() => {
        setLocalFormSources(Array.isArray(formSources) ? formSources : []);
    }, [formSources]);

    const refreshSourceForms = async () => {
        setIsLoadingSourceForms(true);
        try {
            const data = await form_data();
            setLocalFormSources(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('[Customer_add] refreshSourceForms:', error);
        } finally {
            setIsLoadingSourceForms(false);
        }
    };

    const watchedSourceFormId = form.watch('sourceFormId');
    const sourceDetailOptions = useMemo(
        () => buildManualSourceFormOptions(localFormSources, watchedSourceFormId),
        [localFormSources, watchedSourceFormId]
    );

    useEffect(() => {
        let cancelled = false;
        async function loadSuggestedCode() {
            if (!isOpen) return;
            setIsSuggestingCode(true);
            try {
                const res = await fetch('/api/customers/generate-code?type=NORMAL');
                const json = await res.json();
                if (!res.ok || !json?.success) {
                    throw new Error(json?.error || json?.message || 'Không thể tạo mã gợi ý');
                }
                if (cancelled) return;
                const code = json?.suggestedCode || '';
                setSuggestedCustomerCode(code);
                form.setValue('customerCode', code, { shouldDirty: true, shouldTouch: true });
            } catch (e) {
                if (cancelled) return;
                // Nếu fail, vẫn để trống để backend tự fallback KH-03900
                setSuggestedCustomerCode('');
                form.setValue('customerCode', '', { shouldDirty: false, shouldTouch: false });
            } finally {
                if (!cancelled) setIsSuggestingCode(false);
            }
        }
        loadSuggestedCode();
        return () => {
            cancelled = true;
        };
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const { errors, isSubmitting } = form.formState; // Lấy isSubmitting trực tiếp từ formState
    const errorMessages = Object.values(errors).map(error => error.message);

    const onSubmit = async (values) => {
        // THAY ĐỔI 2: Dữ liệu 'values' lúc này đã chứa ID của service,
        // nên chúng ta có thể gửi thẳng đi mà không cần chỉnh sửa.
        await actionUI.run(() => addRegistrationToAction(null, values), {
            loadingText: 'Đang lưu...',
            silentOnSuccess: false,
            refreshOnSuccess: true,
            onSuccess: () => {
                form.reset({
                    fullName: '', phone: '', email: '', address: '', service: [],
                    sourceFormId: DIRECT_SOURCE_FORM_ID,
                    dob: undefined,
                    customerCode: suggestedCustomerCode || '',
                });
                setTimeout(() => setIsOpen(false), 1200);
            },
        });
    };

    const handlePointerDownOutside = (event) => {
        const target = event.target;
        if (target.closest('[data-action-ui-container]')) {
            event.preventDefault();
        }
    };

    return (
        <>
            <actionUI.UI />
            {isOpen && (
                <div className="fixed inset-0 z-40 bg-black/50" />
            )}
            <Dialog open={isOpen} onOpenChange={setIsOpen} modal={false}>
                <DialogTrigger asChild>
                    <button className='btn_s'>
                        <UserPlus className='h-4 w-4 mr-2' />
                        <h5 className='text_w_400'>Thêm khách lẻ</h5>
                    </button>
                </DialogTrigger>
                <DialogContent onPointerDownOutside={handlePointerDownOutside} className="sm:max-w-[480px] w-[95vw] sm:max-h-[95vh] rounded-lg scroll">
                    <DialogHeader>
                        <h4>Thêm khách hàng mới</h4>
                        <DialogTitle style={{ borderBottom: '1px dashed var(--border-color)' }}>
                            <VisuallyHidden>Thêm khách hàng mới</VisuallyHidden>
                        </DialogTitle>
                        <h6>Điền thông tin. Các trường có dấu * là bắt buộc.</h6>
                    </DialogHeader>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <FormLabel><h5>Mã khách hàng</h5></FormLabel>
                                    <Input value={suggestedCustomerCode || 'KH-03900'} disabled readOnly />
                                    {isSuggestingCode && <h6 style={{ color: 'white', opacity: 0.8 }}>Đang gợi ý...</h6>}
                                </div>
                                <FormField control={form.control} name="fullName" render={({ field }) => (
                                    <FormItem><FormLabel><h5>Họ và Tên *</h5></FormLabel><FormControl><Input placeholder="Nguyễn Văn A" {...field} /></FormControl></FormItem>
                                )} />
                                <FormField control={form.control} name="phone" render={({ field }) => (
                                    <FormItem><FormLabel><h5>Số điện thoại *</h5></FormLabel><FormControl><Input placeholder="09xxxxxxxx" {...field} /></FormControl></FormItem>
                                )} />
                            </div>

                            <FormField control={form.control} name="email" render={({ field }) => (
                                <FormItem><FormLabel><h5>Email</h5></FormLabel><FormControl><Input placeholder="example@email.com" {...field} /></FormControl></FormItem>
                            )} />

                            <FormField control={form.control} name="address" render={({ field }) => (
                                <FormItem><FormLabel><h5>Địa chỉ</h5></FormLabel><FormControl><Input placeholder="123 Đường ABC, Phường X, Quận Y" {...field} /></FormControl></FormItem>
                            )} />

                            <FormField control={form.control} name="sourceFormId" render={({ field }) => (
                                <FormItem>
                                    <FormLabel><h5>Nguồn chi tiết</h5></FormLabel>
                                    <FormControl>
                                        <SourceDetailsSelect
                                            value={field.value || DIRECT_SOURCE_FORM_ID}
                                            onChange={field.onChange}
                                            placeholder="Chọn nguồn chi tiết..."
                                            options={sourceDetailOptions}
                                            isLoading={isLoadingSourceForms}
                                            onOpenChange={refreshSourceForms}
                                        />
                                    </FormControl>
                                </FormItem>
                            )} />

                            <FormField control={form.control} name="service" render={({ field }) => (
                                <FormItem>
                                    <FormLabel><h5>Dịch vụ quan tâm *</h5></FormLabel>
                                    <FormControl>
                                        <ServiceMultiSelect
                                            options={(service || []).map((item) => ({ value: item._id, label: item.name }))}
                                            selected={Array.isArray(field.value) ? field.value : []}
                                            onChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )} />

                            {errorMessages.length > 0 && (
                                <Alert variant="destructive" className="mt-4">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>
                                        <ul className="list-disc pl-5 space-y-1">
                                            {errorMessages.map((message, index) => (
                                                <li key={index}><h6>{message}</h6></li>
                                            ))}
                                        </ul>
                                    </AlertDescription>
                                </Alert>
                            )}

                            <DialogFooter style={{ borderTop: '1px dashed var(--border-color)', paddingTop: 16 }}>
                                <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <h6 style={{ color: 'white' }}>{isSubmitting ? 'Đang lưu' : 'Lưu thông tin'}</h6>
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </>
    );
}