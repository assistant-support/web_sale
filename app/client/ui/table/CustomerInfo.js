'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// --- MỚI: Import toast từ sonner ---
import { toast } from "sonner";

// --- Icon Imports ---
import { Loader2, ChevronsUpDown, Check, X, Upload, Image as ImageIcon } from 'lucide-react';

// --- Action & Data Function Imports ---
import { updateCustomerInfo, syncHistoryService } from '@/app/actions/customer.actions';
import { area_customer_data } from '@/data/actions/get';
import { cn } from "@/lib/utils";

// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";


// =============================================================
// == COMPONENT PHỤ: SingleSelect (Chọn một giá trị - lazy load)
// =============================================================
function SingleSelect({ value, onChange, placeholder = 'Chọn...', onOpenChange, isLoading, options = [] }) {
    const [open, setOpen] = useState(false);
    const selectedOption = options.find(opt => opt.value === value);

    const handleOpenChange = (newOpen) => {
        setOpen(newOpen);
        if (newOpen && onOpenChange) {
            onOpenChange(); // Load dữ liệu khi mở
        }
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
                    {selectedOption ? selectedOption.label : <span className="text-muted-foreground">{placeholder}</span>}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Tìm kiếm..." />
                    <CommandList>
                        {isLoading ? (
                            <div className="p-4 text-center">
                                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                <p className="text-sm text-muted-foreground mt-2">Đang tải...</p>
                            </div>
                        ) : (
                            <>
                                <CommandEmpty>Không tìm thấy.</CommandEmpty>
                                <CommandGroup>
                                    {options.map((option) => (
                                        <CommandItem
                                            key={option.value}
                                            onSelect={() => {
                                                onChange(option.value === value ? '' : option.value);
                                                setOpen(false);
                                            }}
                                        >
                                            <Check className={cn("mr-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                                            {option.label}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

// =============================================================
// == COMPONENT PHỤ: MultiSelect (Giữ nguyên)
// =============================================================
function MultiSelect({ options, selected, onChange, className }) {
    const [open, setOpen] = useState(false);
    const handleUnselect = (itemValue) => {
        onChange(selected.filter((v) => v !== itemValue));
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between h-auto min-h-[40px]">
                    <div className="flex gap-1 flex-wrap">
                        {selected.length > 0 ? (
                            options.filter(option => selected.includes(option.value)).map(option => (
                                <Badge variant="secondary" key={option.value} className="mr-1 mb-1" onClick={(e) => { e.stopPropagation(); handleUnselect(option.value); }}>
                                    <h6>{option.label}</h6>
                                    <X className="h-3 w-3 ml-1 text-muted-foreground cursor-pointer" />
                                </Badge>
                            ))
                        ) : (<h6>Chọn dịch vụ...</h6>)}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command className={className}>
                    <CommandInput placeholder="Tìm kiếm dịch vụ..." />
                    <CommandList>
                        <CommandEmpty>Không tìm thấy dịch vụ.</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem key={option.value} onSelect={() => {
                                    onChange(selected.includes(option.value) ? selected.filter((item) => item !== option.value) : [...selected, option.value]);
                                }}>
                                    <Check className={cn("mr-2 h-4 w-4", selected.includes(option.value) ? "opacity-100" : "opacity-0")} />
                                    {option.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

// =============================================================
// == COMPONENT CHÍNH
// =============================================================
const updateFormSchema = z.object({
    name: z.string().min(2, { message: 'Tên là bắt buộc.' }),
    email: z.string().email({ message: 'Email không hợp lệ.' }).optional().or(z.literal('')),
    area: z.string().optional(),
    Id_area_customer: z.string().optional(),
    bd: z.string().optional(),
    tags: z.array(z.string()).optional(),
    service_start_date: z.string().optional(),
    service_last_date: z.string().optional(),
});

export default function CustomerInfo({ customer, onClose, service = [] }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [coverImage, setCoverImage] = useState(null);
    const [coverImageRemoved, setCoverImageRemoved] = useState(false);
    const [coverImagePreview, setCoverImagePreview] = useState(
        customer.cover_customer ? `https://lh3.googleusercontent.com/d/${customer.cover_customer}` : null
    );
    const fileInputRef = useRef(null);
    const [areaCustomerOptions, setAreaCustomerOptions] = useState([]);
    const [isLoadingAreaCustomers, setIsLoadingAreaCustomers] = useState(false);
    const [selectedAreaType, setSelectedAreaType] = useState(null); // Lưu type_area của khu vực được chọn

    const [historyService, setHistoryService] = useState(customer.history_service || {});
    const [isHistorySyncing, setIsHistorySyncing] = useState(false);

    const serviceOptions = useMemo(() =>
        service.map(item => ({ value: item._id, label: item.name })),
        [service]
    );

    // Lấy tên dịch vụ từ history_service (ưu tiên) hoặc serviceDetails
    const serviceNamesFromServiceDetails = useMemo(() => {
        if (Array.isArray(historyService) && historyService.length > 0) {
            const names = historyService
                .map((item) => item?.serviceName)
                .filter(Boolean);
            return names.join(', ');
        }

        if (!customer.serviceDetails || !Array.isArray(customer.serviceDetails) || customer.serviceDetails.length === 0) {
            return '';
        }

        const serviceNames = customer.serviceDetails
            .map((detail) => {
                let serviceId = null;

                if (detail.selectedCourse && detail.selectedCourse.selectedService) {
                    if (typeof detail.selectedCourse.selectedService === 'string') {
                        serviceId = detail.selectedCourse.selectedService;
                    } else if (detail.selectedCourse.selectedService._id) {
                        serviceId = detail.selectedCourse.selectedService._id;
                    } else if (detail.selectedCourse.selectedService.name) {
                        return detail.selectedCourse.selectedService.name;
                    }
                }

                if (!serviceId) {
                    if (typeof detail.selectedService === 'string') {
                        serviceId = detail.selectedService;
                    } else if (detail.selectedService && detail.selectedService._id) {
                        serviceId = detail.selectedService._id;
                    } else if (detail.selectedService && detail.selectedService.name) {
                        return detail.selectedService.name;
                    }
                }

                if (serviceId) {
                    const serviceOption = serviceOptions.find(
                        (opt) =>
                            opt.value === serviceId ||
                            String(opt.value) === String(serviceId)
                    );
                    return serviceOption ? serviceOption.label : null;
                }

                return null;
            })
            .filter(Boolean);

        const uniqueNames = [...new Set(serviceNames)];
        return uniqueNames.join(', ');
    }, [historyService, customer.serviceDetails, serviceOptions]);

    // Đồng bộ history_service khi cần
    useEffect(() => {
        let isMounted = true;
        // Kiểm tra xem có cần sync không
        const hasServiceDetails = 
            customer.serviceDetails &&
            Array.isArray(customer.serviceDetails) &&
            customer.serviceDetails.length > 0;
        
        const hasHistoryService = 
            customer.history_service &&
            typeof customer.history_service === 'object' &&
            !Array.isArray(customer.history_service) &&
            Object.keys(customer.history_service).length > 0;

        // Nếu có serviceDetails thì luôn sync (để đảm bảo history_service luôn được cập nhật)
        if (hasServiceDetails) {
            const syncHistory = async () => {
                try {
                    setIsHistorySyncing(true);
                    const result = await syncHistoryService(customer._id);
                     if (isMounted) {
                        if (result?.success && result?.history_service) {
                            setHistoryService(result.history_service);
                            
                        } else if (result?.error) {
                            console.error('❌ [CustomerInfo] Lỗi từ syncHistoryService:', result.error);
                        }
                    }
                } catch (error) {
                    console.error('❌ [CustomerInfo] Lỗi sync history_service:', error);
                } finally {
                    if (isMounted) {
                        setIsHistorySyncing(false);
                    }
                }
            };

            syncHistory();
        } else {
            // Nếu không có serviceDetails, chỉ set state từ customer.history_service
            setHistoryService(customer.history_service || {});
        }

        return () => {
            isMounted = false;
        };
    }, [customer._id, customer.history_service, customer.serviceDetails]);

    // Nhóm dữ liệu lịch sử để hiển thị (sử dụng history_service đã lưu trong database)
    const groupedServiceDetailsByService = useMemo(() => {
        // Sử dụng history_service làm nguồn dữ liệu chính (đã được lưu sẵn)
        const historyServiceData = historyService || customer.history_service || {};
        
        // Nếu không có history_service, fallback về serviceDetails
        if (!historyServiceData || Object.keys(historyServiceData).length === 0) {
            if (!customer.serviceDetails || !Array.isArray(customer.serviceDetails) || customer.serviceDetails.length === 0) {
                return [];
            }
            // Fallback: tính toán từ serviceDetails (logic cũ)
            const groupedByService = {};
            customer.serviceDetails.forEach((detail) => {
                const courseName = detail.selectedCourse?.name || 'Không có tên';
                const serviceName =
                    detail.selectedCourse?.selectedService?.name ||
                    detail.selectedService?.name ||
                    (() => {
                        let serviceId = null;
                        if (detail.selectedService) {
                            if (typeof detail.selectedService === 'string') {
                                serviceId = detail.selectedService;
                            } else if (detail.selectedService._id) {
                                serviceId = detail.selectedService._id;
                            }
                        }
                        if (serviceId) {
                            const option = serviceOptions.find(
                                (opt) =>
                                    opt.value === serviceId ||
                                    String(opt.value) === String(serviceId)
                            );
                            return option?.label;
                        }
                        return '';
                    })();

                if (!groupedByService[serviceName]) {
                    groupedByService[serviceName] = {
                        serviceName: serviceName || '',
                        courses: {}
                    };
                }

                if (!groupedByService[serviceName].courses[courseName]) {
                    groupedByService[serviceName].courses[courseName] = [];
                }
                groupedByService[serviceName].courses[courseName].push(detail);
            });

            return Object.entries(groupedByService).map(([serviceName, serviceInfo]) => {
                const courses = Object.entries(serviceInfo.courses).map(([courseName, items]) => ({
                    courseName,
                    startDate: items[0]?.closedAt || null,
                    lastDate: items[items.length - 1]?.closedAt || null,
                }));

                return {
                    serviceName: serviceInfo.serviceName,
                    courses,
                };
            });
        }

        // Sử dụng history_service: { "Tên dịch vụ": ["Liệu trình 1", "Liệu trình 2", ...] }
        // Tìm trong serviceDetails để lấy ngày bắt đầu và ngày cuối cho mỗi liệu trình
        const serviceDetails = customer.serviceDetails || [];
        
        return Object.entries(historyServiceData).map(([serviceName, courseNames]) => {
            // courseNames là mảng các tên liệu trình: ["Liệu trình 1", "Liệu trình 2"]
            const courses = courseNames.map((courseName) => {
                // Tìm tất cả serviceDetails có cùng dịch vụ và liệu trình này
                const matchingDetails = serviceDetails.filter((detail) => {
                    const detailCourseName = detail.selectedCourse?.name || 'Không có tên';
                    const detailServiceName =
                        detail.selectedCourse?.selectedService?.name ||
                        detail.selectedService?.name ||
                        (() => {
                            let serviceId = null;
                            if (detail.selectedService) {
                                if (typeof detail.selectedService === 'string') {
                                    serviceId = detail.selectedService;
                                } else if (detail.selectedService._id) {
                                    serviceId = detail.selectedService._id;
                                }
                            }
                            if (serviceId) {
                                const option = serviceOptions.find(
                                    (opt) =>
                                        opt.value === serviceId ||
                                        String(opt.value) === String(serviceId)
                                );
                                return option?.label;
                            }
                            return '';
                        })();
                    
                    return detailCourseName === courseName && detailServiceName === serviceName;
                });

                // Sắp xếp theo closedAt để lấy ngày đầu và ngày cuối
                const sortedDetails = matchingDetails
                    .filter(d => d.closedAt)
                    .sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));

                return {
                    courseName,
                    startDate: sortedDetails[0]?.closedAt || null,
                    lastDate: sortedDetails[sortedDetails.length - 1]?.closedAt || null,
                };
            });

            return {
                serviceName,
                courses,
            };
        });
    }, [historyService, customer.history_service, customer.serviceDetails, customer.service_last_date, serviceOptions]);

    // Load danh sách khu vực khách hàng
    const loadAreaCustomersData = async () => {
        if (areaCustomerOptions.length > 0) {
           
            return; // Đã load rồi thì không load lại
        }
        
        try {
           
            setIsLoadingAreaCustomers(true);
            const areaCustomers = await area_customer_data();
           
            
            if (areaCustomers) {
                // Xử lý cả trường hợp là array hoặc không phải array
                const dataArray = Array.isArray(areaCustomers) ? areaCustomers : [areaCustomers];
                
                if (dataArray.length > 0) {
                    const options = dataArray
                        .filter(area => area && area.name && area._id) // Lọc các item có name và _id
                        .map(area => ({
                            value: area._id, // Lưu _id làm value
                            label: area.name, // Hiển thị name
                            _id: area._id,
                            type_area: area.type_area || null // Lưu type_area vào option
                        }));
                    
                    
                    setAreaCustomerOptions(options);
                    
                    // Nếu đã có giá trị được chọn, tìm type_area tương ứng
                    const currentValue = form.getValues('Id_area_customer') || customer.Id_area_customer;
                    if (currentValue) {
                        const selectedOption = options.find(opt => 
                            opt.value === currentValue || 
                            opt._id === currentValue ||
                            String(opt._id) === String(currentValue)
                        );
                        if (selectedOption) {
                            if (selectedOption.type_area) {
                                setSelectedAreaType(selectedOption.type_area);
                            }
                            // Đảm bảo form value đúng với _id
                            if (form.getValues('Id_area_customer') !== selectedOption.value) {
                                form.setValue('Id_area_customer', selectedOption.value);
                            }
                        }
                    }
                } else {
                    console.warn('⚠️ [loadAreaCustomersData] Mảng dữ liệu rỗng');
                    toast.error('Không có dữ liệu khu vực');
                }
            } else {
                console.warn('⚠️ [loadAreaCustomersData] Dữ liệu trả về null/undefined');
                toast.error('Không thể tải danh sách khu vực');
            }
        } catch (error) {
            console.error('❌ [loadAreaCustomersData] Lỗi khi tải danh sách khu vực khách hàng:', error);
            toast.error('Không thể tải danh sách khu vực: ' + (error?.message || 'Lỗi không xác định'));
        } finally {
            setIsLoadingAreaCustomers(false);
        }
    };

    // Load danh sách khu vực khách hàng khi user mở Select Menu
    const handleLoadAreaCustomers = () => {
        loadAreaCustomersData();
    };

    const form = useForm({
        resolver: zodResolver(updateFormSchema),
        defaultValues: {
            name: customer.name || '',
            email: customer.email || '',
            area: customer.area || '',
            Id_area_customer: customer.Id_area_customer || '',
            bd: customer.bd ? new Date(customer.bd).toISOString().split('T')[0] : '',
            tags: customer.tags?.map(tag => tag._id) || [],
            service_start_date: customer.service_start_date ? new Date(customer.service_start_date).toISOString().split('T')[0] : '',
            service_last_date: customer.service_last_date ? new Date(customer.service_last_date).toISOString().split('T')[0] : '',
        },
    });

    // Load dữ liệu area_customer khi component mount nếu đã có Id_area_customer
    useEffect(() => {
        if (customer.Id_area_customer) {
            // Tự động load danh sách để hiển thị khu vực đã chọn
            loadAreaCustomersData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer.Id_area_customer]); // Chỉ chạy khi customer.Id_area_customer thay đổi

    // Cập nhật type_area khi areaCustomerOptions thay đổi
    useEffect(() => {
        if (customer.Id_area_customer && areaCustomerOptions.length > 0) {
            // Tìm option có _id trùng với customer.Id_area_customer
            const selectedOption = areaCustomerOptions.find(opt => 
                opt.value === customer.Id_area_customer || 
                opt._id === customer.Id_area_customer ||
                String(opt._id) === String(customer.Id_area_customer) ||
                String(opt.value) === String(customer.Id_area_customer)
            );
            if (selectedOption) {
                if (selectedOption.type_area) {
                    setSelectedAreaType(selectedOption.type_area);
                }
                // Đảm bảo form value đúng với _id
                const currentFormValue = form.getValues('Id_area_customer');
                if (currentFormValue !== selectedOption.value && String(currentFormValue) !== String(selectedOption.value)) {
                    form.setValue('Id_area_customer', selectedOption.value);
                }
            }
        }
    }, [areaCustomerOptions, customer.Id_area_customer]);

    const handleImageChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                toast.error('Kích thước ảnh không được vượt quá 5MB');
                return;
            }
            if (!file.type.startsWith('image/')) {
                toast.error('Vui lòng chọn file ảnh');
                return;
            }
            setCoverImage(file);
            setCoverImageRemoved(false); // Reset flag khi chọn ảnh mới
            const reader = new FileReader();
            reader.onloadend = () => {
                setCoverImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveImage = () => {
        setCoverImage(null);
        setCoverImagePreview(null);
        setCoverImageRemoved(true); // Đánh dấu đã xóa ảnh
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const onSubmit = async (values) => {
        setIsSubmitting(true);
        const formData = new FormData();
        formData.append('_id', customer._id);
        Object.entries(values).forEach(([key, value]) => {
            if (key === 'tags' && Array.isArray(value)) {
                value.forEach(tagId => formData.append('tags', tagId));
            } else {
                formData.append(key, value || '');
            }
        });

        // Thêm ảnh nếu có
        if (coverImage) {
            formData.append('cover_customer', coverImage);
        } else if (coverImageRemoved) {
            // Nếu người dùng xóa ảnh, gửi chuỗi rỗng để xóa trong database
            formData.append('cover_customer_id', '');
        }

        // Id_area_customer đã là _id rồi, không cần gửi thêm area_customer_id
        // (vì value của option đã là _id)

        // CẬP NHẬT: Truyền thẳng promise từ server action vào
        const promise = updateCustomerInfo(null, formData);

        toast.promise(promise, {
            loading: 'Đang cập nhật thông tin...',
            success: (result) => {
                setIsSubmitting(false);
                if (result.success) {
                    setCoverImage(null); // Reset sau khi lưu thành công
                }
                return result.message || 'Cập nhật thành công!';
            },
            error: (result) => {
                setIsSubmitting(false);
                return result.error || 'Cập nhật thất bại!';
            },
        });
    };

    return (
        <Form {...form}>
            {/* Không cần bất kỳ component thông báo hay lớp phủ nào ở đây */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4 flex-1 scroll">
                <h4 className='font-semibold' style={{ marginBottom: 16 }}>Thông tin cơ bản</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (<FormItem><Label><h6>Tên khách hàng *</h6></Label><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    <FormField control={form.control} name="email" render={({ field }) => (<FormItem><Label><h6>Email</h6></Label><FormControl><Input type="email" {...field} /></FormControl></FormItem>)} />
                    <div className="grid gap-2"><Label><h6>Nguồn chi tiết</h6></Label><Input defaultValue={customer.sourceDetails} disabled /></div>
                    <FormField control={form.control} name="area" render={({ field }) => (<FormItem><Label><h6>Địa chỉ</h6></Label><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    <FormField 
                        control={form.control} 
                        name="Id_area_customer" 
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex items-center gap-2">
                                    <Label><h6>Khu vực</h6></Label>
                                    {selectedAreaType && (
                                        <Badge variant="secondary" className="text-xs">
                                            {selectedAreaType}
                                        </Badge>
                                    )}
                                </div>
                                <FormControl>
                                    <SingleSelect
                                        value={field.value || ''}
                                        onChange={(value) => {
                                            field.onChange(value);
                                            // Tìm type_area tương ứng với khu vực được chọn
                                            const selectedOption = areaCustomerOptions.find(opt => opt.value === value);
                                            if (selectedOption && selectedOption.type_area) {
                                                setSelectedAreaType(selectedOption.type_area);
                                            } else {
                                                setSelectedAreaType(null);
                                            }
                                        }}
                                        placeholder="Chọn khu vực..."
                                        onOpenChange={handleLoadAreaCustomers}
                                        isLoading={isLoadingAreaCustomers}
                                        options={areaCustomerOptions}
                                    />
                                </FormControl>
                            </FormItem>
                        )} 
                    />
                    <FormField control={form.control} name="bd" render={({ field }) => (<FormItem><Label><h6>Ngày Tháng Năm sinh</h6></Label><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
                </div>
                
                {/* Upload ảnh khách hàng */}
                <div className="grid gap-2">
                    <Label><h6>Ảnh khách hàng</h6></Label>
                    <div className="flex flex-col gap-3">
                        {coverImagePreview ? (
                            <div className="relative w-full max-w-xs">
                                <img 
                                    src={coverImagePreview} 
                                    alt="Ảnh khách hàng" 
                                    className="w-full h-48 object-cover rounded-lg border"
                                />
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="absolute top-2 right-2"
                                    onClick={handleRemoveImage}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <div className="border-2 border-dashed rounded-lg p-6 text-center">
                                <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground mb-2">Chưa có ảnh khách hàng</p>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                className="hidden"
                                id="cover-customer-upload"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2"
                            >
                                <Upload className="h-4 w-4" />
                                {coverImagePreview ? 'Thay đổi ảnh' : 'Tải ảnh lên'}
                            </Button>
                        </div>
                    </div>
                </div>
                <Separator className="my-4" />
                <h4 className='font-semibold' style={{ marginBottom: 16 }}>Thông tin liên hệ & Dịch vụ</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2"><Label><h6>Số điện thoại</h6></Label><Input defaultValue={customer.phone} disabled /></div>
                    <div className="grid gap-2"><Label><h6>Tên Zalo</h6></Label><Input defaultValue={customer.zaloname} disabled /></div>
                </div>

                <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                        <FormItem className="flex flex-col grid gap-2">
                            <FormLabel><h6 className="font-semibold">Dịch vụ quan tâm</h6></FormLabel>
                            <MultiSelect options={serviceOptions} selected={field.value} onChange={field.onChange} className="w-full" />
                        </FormItem>
                    )}
                />

                {/* Lịch sử - Sử dụng dịch vụ */}
                <div className="mt-6">
                    <h6 className="font-semibold mb-3">Lịch sử - Sử dụng dịch vụ</h6>
                    <div className="border-2 border-black rounded-lg p-4 space-y-6">
                        {/* Hiển thị từng dịch vụ, mỗi dịch vụ có nhiều liệu trình */}
                        {groupedServiceDetailsByService.length > 0 ? (
                            groupedServiceDetailsByService.map((serviceGroup, serviceIndex) => {
                                // Format date để hiển thị trong input
                                const formatDate = (date) => {
                                    if (!date) return '';
                                    const d = new Date(date);
                                    if (isNaN(d.getTime())) return '';
                                    return d.toISOString().split('T')[0];
                                };

                                return (
                                    <div key={serviceIndex} className="space-y-4">
                                        {/* Tên dịch vụ (chỉ hiển thị 1 lần cho mỗi dịch vụ) */}
                                        <div className="grid gap-2">
                                            <Label style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                                {serviceGroup.serviceName || 'tên dịch vụ'}
                                            </Label>
                                        </div>

                                        {/* Hiển thị từng liệu trình của dịch vụ này */}
                                        {serviceGroup.courses.map((course, courseIndex) => (
                                            <div key={courseIndex} className="space-y-4 pl-4 border-l-2 border-gray-300">
                                                {/* Tên liệu trình */}
                                                <div className="grid gap-1">
                                                    <Input 
                                                        value={course.courseName || 'Chưa có liệu trình'}
                                                        disabled
                                                        className="rounded-md border-black bg-muted"
                                                        readOnly
                                                        style={{ color: '#3A2885', fontWeight: 'bold', fontSize: '14px' }}
                                                    />
                                                </div>
                                                
                                                {/* 2 trường ngày */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="grid gap-2">
                                                        <Label><h6>Ngày bắt đầu sử dụng dịch vụ</h6></Label>
                                                        <Input 
                                                            type="date" 
                                                            value={formatDate(course.startDate)}
                                                            disabled
                                                            className="rounded-md border-black bg-muted"
                                                            readOnly
                                                        />
                                                    </div>
                                                    <div className="grid gap-2">
                                                        <Label><h6>Ngày sử dụng dịch vụ lần cuối</h6></Label>
                                                        <Input 
                                                            type="date" 
                                                            value={formatDate(course.lastDate)}
                                                            disabled
                                                            className="rounded-md border-black bg-muted"
                                                            readOnly
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })
                        ) : (
                            // Nếu không có liệu trình, hiển thị form có thể chỉnh sửa
                            <>
                                <div className="grid gap-2">
                                    <Input 
                                        value="Chưa có liệu trình"
                                        disabled
                                        className="rounded-md border-black bg-muted"
                                        readOnly
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="service_start_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Label><h6>Ngày bắt đầu sử dụng dịch vụ</h6></Label>
                                                <FormControl>
                                                    <Input 
                                                        type="date" 
                                                        {...field} 
                                                        className="rounded-md border-black"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="service_last_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Label><h6>Ngày sử dụng dịch vụ lần cuối</h6></Label>
                                                <FormControl>
                                                    <Input 
                                                        type="date" 
                                                        {...field} 
                                                        className="rounded-md border-black"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <DialogFooter className="pt-4">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /><h6 style={{ color: 'white' }}>Đang lưu...</h6></> : <h6 style={{ color: 'white' }}>Lưu thay đổi</h6>}
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    );
}