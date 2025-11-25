'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import './CustomerInfo.css';

// --- Import Noti component ---
import Noti from '@/components/(features)/(noti)/noti';

// --- Icon Imports ---
import { Loader2, ChevronsUpDown, Check, X, Upload, Image as ImageIcon, Plus, Trash2, Pencil } from 'lucide-react';

// --- Action & Data Function Imports ---
import { updateCustomerInfo, syncHistoryService } from '@/app/actions/customer.actions';
import { area_customer_data } from '@/data/actions/get';
import { cn } from "@/lib/utils";

// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


// =============================================================
// == COMPONENT PHỤ: SingleSelect (Chọn một giá trị - lazy load)
// =============================================================
function SingleSelect({ value, onChange, placeholder = 'Chọn...', onOpenChange, isLoading, options = [], onDelete, onEdit }) {
    const [open, setOpen] = useState(false);
    const selectedOption = options.find(opt => opt.value === value);
    const commandListRef = useRef(null);
    const [deletingId, setDeletingId] = useState(null);

    const handleDelete = async (areaId, areaName) => {
        if (!onDelete) return;
        setDeletingId(areaId);
        try {
            await onDelete(areaId, areaName);
        } finally {
            setDeletingId(null);
        }
    };

    const handleOpenChange = (newOpen) => {
        setOpen(newOpen);
        if (newOpen && onOpenChange) {
            onOpenChange(); // Load dữ liệu khi mở
        }
    };

    // Xử lý wheel event để cho phép cuộn bằng chuột lăn
    useEffect(() => {
        if (!open) return;

        let cleanup = null;

        // Đợi một chút để element được mount
        const timer = setTimeout(() => {
            const element = commandListRef.current;
            if (!element) return;

            const handleWheel = (e) => {
                const { scrollTop, scrollHeight, clientHeight } = element;
                
                // Nếu có thể scroll trong element
                if (scrollHeight > clientHeight) {
                    const isAtTop = scrollTop <= 0;
                    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

                    // Nếu đang ở đầu và cuộn lên, hoặc ở cuối và cuộn xuống
                    if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
                        // Cho phép scroll page nếu đã đến đầu/cuối
                        return;
                    }
                    
                    // Ngăn scroll page khi đang scroll trong element
                    e.stopPropagation();
                }
            };

            element.addEventListener('wheel', handleWheel, { passive: true });

            cleanup = () => {
                element.removeEventListener('wheel', handleWheel);
            };
        }, 100);

        return () => {
            clearTimeout(timer);
            if (cleanup) cleanup();
        };
    }, [open]);

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
                    {selectedOption ? selectedOption.label : <span className="text-muted-foreground">{placeholder}</span>}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent 
                className="w-[--radix-popover-trigger-width] p-0"
                style={{ maxHeight: '150px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
                <Command className="flex flex-col h-full">
                    <CommandInput placeholder="Tìm kiếm..." className="flex-shrink-0" />
                    <div 
                        ref={commandListRef}
                        style={{
                            maxHeight: '150px',
                            height: '150px',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            WebkitOverflowScrolling: 'touch'
                        }}
                        className="area-select-scroll"
                    >
                    <CommandList 
                        className={cn("flex-1")}
                        style={{ 
                            overflow: 'visible',
                            maxHeight: 'none',
                            height: 'auto'
                        }}
                    >
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
                                            className="flex items-center justify-between group"
                                        >
                                            <div className="flex items-center flex-1">
                                                <Check className={cn("mr-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                                                {option.label}
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {onEdit && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0 hover:bg-blue-50 hover:text-blue-600"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onEdit(option.value, option.label, option.type_area);
                                                        }}
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                )}
                                                {onDelete && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(option.value, option.label);
                                                        }}
                                                        disabled={deletingId === option.value}
                                                    >
                                                        {deletingId === option.value ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
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
    const [isAddAreaDialogOpen, setIsAddAreaDialogOpen] = useState(false);
    const [isAddingArea, setIsAddingArea] = useState(false);
    const [newAreaName, setNewAreaName] = useState('');
    const [newAreaType, setNewAreaType] = useState('');
    const [isEditAreaDialogOpen, setIsEditAreaDialogOpen] = useState(false);
    const [isEditingArea, setIsEditingArea] = useState(false);
    const [editingAreaId, setEditingAreaId] = useState(null);
    const [editAreaName, setEditAreaName] = useState('');
    const [editAreaType, setEditAreaType] = useState('');
    const [notification, setNotification] = useState({ open: false, status: true, mes: '' });

    // Danh sách loại khu vực
    const areaTypeOptions = [
        { value: 'lân cận HCM', label: 'lân cận HCM' },
        { value: 'TP HCM', label: 'TP HCM' },
        { value: 'xa HCM', label: 'xa HCM' }
    ];

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
                    console.log('🔄 [CustomerInfo] Bắt đầu sync history_service cho customer:', customer._id);
                    setIsHistorySyncing(true);
                    const result = await syncHistoryService(customer._id);
                    console.log('📦 [CustomerInfo] Kết quả sync:', result);
                    if (isMounted) {
                        if (result?.success && result?.history_service) {
                            setHistoryService(result.history_service);
                            console.log('✅ [CustomerInfo] Đã sync và cập nhật history_service:', result.history_service);
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
            console.log('✅ [loadAreaCustomersData] Đã có dữ liệu, không load lại');
            return; // Đã load rồi thì không load lại
        }
        
        try {
            console.log('🔄 [loadAreaCustomersData] Bắt đầu load dữ liệu...');
            setIsLoadingAreaCustomers(true);
            const areaCustomers = await area_customer_data();
            console.log('📦 [loadAreaCustomersData] Dữ liệu nhận được:', {
                type: typeof areaCustomers,
                isArray: Array.isArray(areaCustomers),
                data: areaCustomers,
                length: areaCustomers?.length,
                sample: areaCustomers?.[0]
            });
            
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
                    
                    console.log('✅ [loadAreaCustomersData] Options đã tạo:', options);
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
                    setNotification({ open: true, status: false, mes: 'Không có dữ liệu khu vực' });
                }
            } else {
                console.warn('⚠️ [loadAreaCustomersData] Dữ liệu trả về null/undefined');
                setNotification({ open: true, status: false, mes: 'Không thể tải danh sách khu vực' });
            }
        } catch (error) {
            console.error('❌ [loadAreaCustomersData] Lỗi khi tải danh sách khu vực khách hàng:', error);
            setNotification({ open: true, status: false, mes: 'Không thể tải danh sách khu vực: ' + (error?.message || 'Lỗi không xác định') });
        } finally {
            setIsLoadingAreaCustomers(false);
        }
    };

    // Load danh sách khu vực khách hàng khi user mở Select Menu
    const handleLoadAreaCustomers = () => {
        loadAreaCustomersData();
    };

    // Xử lý thêm khu vực mới
    const handleAddArea = async () => {
        if (!newAreaName || !newAreaName.trim()) {
            setNotification({ open: true, status: false, mes: 'Vui lòng nhập tên khu vực' });
            return;
        }

        setIsAddingArea(true);
        try {
            console.log('🔄 [handleAddArea] Bắt đầu thêm khu vực:', newAreaName.trim());
            
            // Cookies sẽ được gửi tự động với fetch request
            const response = await fetch('/api/area_customer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include', // Đảm bảo cookies được gửi
                body: JSON.stringify({
                    name: newAreaName.trim(),
                    type_area: newAreaType.trim() || null
                })
            });

            console.log('📡 [handleAddArea] Response status:', response.status, 'ok:', response.ok);

            // Parse response dù có lỗi hay không để lấy thông báo từ server
            let result;
            try {
                const responseText = await response.text();
                console.log('📦 [handleAddArea] Response text:', responseText);
                result = JSON.parse(responseText);
                console.log('📦 [handleAddArea] Parsed result:', result);
                console.log('📦 [handleAddArea] result.status:', result?.status);
                console.log('📦 [handleAddArea] result.mes:', result?.mes);
            } catch (parseError) {
                console.error('❌ [handleAddArea] API Error - Cannot parse JSON:', parseError);
                setNotification({ open: true, status: false, mes: 'Có lỗi xảy ra khi thêm khu vực' });
                return;
            }

            // Kiểm tra response.ok hoặc result.status
            if (!response.ok || result?.status === false) {
                // Hiển thị thông báo lỗi từ server (ví dụ: "Tên khu vực đã có")
                const errorMessage = result?.mes || result?.message || 'Thêm khu vực thất bại';
                console.log('❌ [handleAddArea] Đang hiển thị thông báo lỗi:', errorMessage);
                console.log('❌ [handleAddArea] response.ok:', response.ok, 'result.status:', result?.status);
                
                // Hiển thị Noti
                setNotification({ open: true, status: false, mes: errorMessage });
                console.log('✅ [handleAddArea] Đã gọi setNotification');
                return;
            }

            // Thành công
            console.log('✅ [handleAddArea] Thêm khu vực thành công:', result);
            setNotification({ open: true, status: true, mes: result.mes || 'Thêm khu vực thành công' });
            
            // Reset form
            setNewAreaName('');
            setNewAreaType('');
            setIsAddAreaDialogOpen(false);
            
            // Reload danh sách khu vực
            setAreaCustomerOptions([]); // Reset để force reload
            await loadAreaCustomersData();
            
            // Tự động chọn khu vực vừa tạo
            if (result.data && result.data._id) {
                form.setValue('Id_area_customer', result.data._id);
                if (result.data.type_area) {
                    setSelectedAreaType(result.data.type_area);
                }
            }
        } catch (error) {
            console.error('❌ [handleAddArea] Lỗi khi thêm khu vực:', error);
            setNotification({ open: true, status: false, mes: 'Có lỗi xảy ra khi thêm khu vực' });
        } finally {
            setIsAddingArea(false);
        }
    };

    const handleDeleteArea = async (areaId, areaName) => {
        if (!areaId) {
            setNotification({ open: true, status: false, mes: 'Không tìm thấy ID khu vực để xóa' });
            return;
        }

        // Xác nhận trước khi xóa
        if (!confirm(`Bạn có chắc chắn muốn xóa khu vực "${areaName}"?`)) {
            return;
        }

        try {
            console.log('🔄 [handleDeleteArea] Bắt đầu xóa khu vực:', areaId);
            
            const response = await fetch(`/api/area_customer/${areaId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });

            console.log('📡 [handleDeleteArea] Response status:', response.status, 'ok:', response.ok);

            let result;
            try {
                const responseText = await response.text();
                console.log('📦 [handleDeleteArea] Response text:', responseText);
                result = JSON.parse(responseText);
                console.log('📦 [handleDeleteArea] Parsed result:', result);
            } catch (parseError) {
                console.error('❌ [handleDeleteArea] API Error - Cannot parse JSON:', parseError);
                setNotification({ open: true, status: false, mes: 'Có lỗi xảy ra khi xóa khu vực' });
                return;
            }

            if (!response.ok || result?.status === false) {
                const errorMessage = result?.mes || result?.message || 'Xóa khu vực thất bại';
                setNotification({ open: true, status: false, mes: errorMessage });
                return;
            }

            // Thành công
            console.log('✅ [handleDeleteArea] Xóa khu vực thành công:', result);
            setNotification({ open: true, status: true, mes: result.mes || 'Xóa khu vực thành công' });
            
            // Nếu khu vực đang được chọn, xóa selection
            const currentValue = form.getValues('Id_area_customer');
            if (currentValue === areaId) {
                form.setValue('Id_area_customer', '');
                setSelectedAreaType(null);
            }
            
            // Reload danh sách khu vực
            setAreaCustomerOptions([]);
            await loadAreaCustomersData();
        } catch (error) {
            console.error('❌ [handleDeleteArea] Lỗi khi xóa khu vực:', error);
            setNotification({ open: true, status: false, mes: 'Có lỗi xảy ra khi xóa khu vực' });
        }
    };

    const handleEditArea = (areaId, areaName, areaType) => {
        setEditingAreaId(areaId);
        setEditAreaName(areaName);
        setEditAreaType(areaType || '');
        setIsEditAreaDialogOpen(true);
    };

    const handleUpdateArea = async () => {
        if (!editAreaName || !editAreaName.trim()) {
            setNotification({ open: true, status: false, mes: 'Vui lòng nhập tên khu vực' });
            return;
        }

        if (!editingAreaId) {
            setNotification({ open: true, status: false, mes: 'Không tìm thấy ID khu vực để cập nhật' });
            return;
        }

        setIsEditingArea(true);
        try {
            console.log('🔄 [handleUpdateArea] Bắt đầu cập nhật khu vực:', editingAreaId);
            
            const response = await fetch(`/api/area_customer/${editingAreaId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: editAreaName.trim(),
                    type_area: editAreaType.trim() || null
                })
            });

            console.log('📡 [handleUpdateArea] Response status:', response.status, 'ok:', response.ok);

            let result;
            try {
                const responseText = await response.text();
                console.log('📦 [handleUpdateArea] Response text:', responseText);
                result = JSON.parse(responseText);
                console.log('📦 [handleUpdateArea] Parsed result:', result);
            } catch (parseError) {
                console.error('❌ [handleUpdateArea] API Error - Cannot parse JSON:', parseError);
                setNotification({ open: true, status: false, mes: 'Có lỗi xảy ra khi cập nhật khu vực' });
                return;
            }

            if (!response.ok || result?.status === false) {
                const errorMessage = result?.mes || result?.message || 'Cập nhật khu vực thất bại';
                setNotification({ open: true, status: false, mes: errorMessage });
                return;
            }

            // Thành công
            console.log('✅ [handleUpdateArea] Cập nhật khu vực thành công:', result);
            setNotification({ open: true, status: true, mes: result.mes || 'Cập nhật khu vực thành công' });
            
            // Lưu editingAreaId trước khi reset
            const updatedAreaId = editingAreaId;
            
            // Reset form
            setEditAreaName('');
            setEditAreaType('');
            setEditingAreaId(null);
            setIsEditAreaDialogOpen(false);
            
            // Reload danh sách khu vực
            setAreaCustomerOptions([]);
            await loadAreaCustomersData();
            
            // Nếu khu vực đang được chọn, cập nhật lại type_area
            const currentValue = form.getValues('Id_area_customer');
            if (currentValue === updatedAreaId && result.data) {
                if (result.data.type_area) {
                    setSelectedAreaType(result.data.type_area);
                } else {
                    setSelectedAreaType(null);
                }
            }
        } catch (error) {
            console.error('❌ [handleUpdateArea] Lỗi khi cập nhật khu vực:', error);
            setNotification({ open: true, status: false, mes: 'Có lỗi xảy ra khi cập nhật khu vực' });
        } finally {
            setIsEditingArea(false);
        }
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
                setNotification({ open: true, status: false, mes: 'Kích thước ảnh không được vượt quá 5MB' });
                return;
            }
            if (!file.type.startsWith('image/')) {
                setNotification({ open: true, status: false, mes: 'Vui lòng chọn file ảnh' });
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

        // Xử lý promise thủ công
        try {
            setIsSubmitting(true);
            const result = await updateCustomerInfo(null, formData);
            
            if (result.success) {
                setCoverImage(null); // Reset sau khi lưu thành công
                setNotification({ 
                    open: true, 
                    status: true, 
                    mes: result.message || 'Cập nhật thành công!' 
                });
            } else {
                setNotification({ 
                    open: true, 
                    status: false, 
                    mes: result.error || 'Cập nhật thất bại!' 
                });
            }
        } catch (error) {
            console.error('Lỗi khi cập nhật thông tin:', error);
            setNotification({ 
                open: true, 
                status: false, 
                mes: 'Có lỗi xảy ra khi cập nhật thông tin' 
            });
        } finally {
            setIsSubmitting(false);
        }
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
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Label><h6>Khu vực</h6></Label>
                                        {selectedAreaType && (
                                            <Badge variant="secondary" className="text-xs">
                                                {selectedAreaType}
                                            </Badge>
                                        )}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() => setIsAddAreaDialogOpen(true)}
                                    >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Thêm khu vực
                                    </Button>
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
                                        onDelete={handleDeleteArea}
                                        onEdit={handleEditArea}
                                    />
                                </FormControl>
                            </FormItem>
                        )} 
                    />
                    {/* Dialog thêm khu vực - đặt ngoài FormField để tránh xung đột */}
                    <Dialog open={isAddAreaDialogOpen} onOpenChange={setIsAddAreaDialogOpen}>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Thêm khu vực mới</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="area-name">
                                        Tên khu vực <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="area-name"
                                        value={newAreaName}
                                        onChange={(e) => setNewAreaName(e.target.value)}
                                        placeholder="Nhập tên khu vực"
                                        disabled={isAddingArea}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newAreaName.trim() && !isAddingArea) {
                                                handleAddArea();
                                            }
                                        }}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="area-type">
                                        Loại khu vực
                                    </Label>
                                    <Select
                                        value={newAreaType}
                                        onValueChange={setNewAreaType}
                                        disabled={isAddingArea}
                                    >
                                        <SelectTrigger id="area-type" className="w-full">
                                            <SelectValue placeholder="Chọn loại khu vực (tùy chọn)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {areaTypeOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setIsAddAreaDialogOpen(false);
                                        setNewAreaName('');
                                        setNewAreaType('');
                                    }}
                                    disabled={isAddingArea}
                                >
                                    Hủy
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleAddArea}
                                    disabled={isAddingArea || !newAreaName.trim()}
                                >
                                    {isAddingArea ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Đang thêm...
                                        </>
                                    ) : (
                                        'Thêm'
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    {/* Dialog sửa khu vực */}
                    <Dialog open={isEditAreaDialogOpen} onOpenChange={setIsEditAreaDialogOpen}>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Sửa khu vực</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-area-name">
                                        Tên khu vực <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="edit-area-name"
                                        value={editAreaName}
                                        onChange={(e) => setEditAreaName(e.target.value)}
                                        placeholder="Nhập tên khu vực"
                                        disabled={isEditingArea}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && editAreaName.trim() && !isEditingArea) {
                                                handleUpdateArea();
                                            }
                                        }}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-area-type">
                                        Loại khu vực
                                    </Label>
                                    <Select
                                        value={editAreaType}
                                        onValueChange={setEditAreaType}
                                        disabled={isEditingArea}
                                    >
                                        <SelectTrigger id="edit-area-type" className="w-full">
                                            <SelectValue placeholder="Chọn loại khu vực (tùy chọn)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {areaTypeOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setIsEditAreaDialogOpen(false);
                                        setEditAreaName('');
                                        setEditAreaType('');
                                        setEditingAreaId(null);
                                    }}
                                    disabled={isEditingArea}
                                >
                                    Hủy
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleUpdateArea}
                                    disabled={isEditingArea || !editAreaName.trim()}
                                >
                                    {isEditingArea ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Đang cập nhật...
                                        </>
                                    ) : (
                                        'Cập nhật'
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
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
            <Noti 
                open={notification.open} 
                onClose={() => setNotification({ ...notification, open: false })} 
                status={notification.status} 
                mes={notification.mes}
                button={
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                        <Button 
                            onClick={() => setNotification({ ...notification, open: false })}
                            style={{ 
                                padding: '8px 24px',
                                borderRadius: 4,
                                border: 'none',
                                backgroundColor: notification.status ? 'var(--green)' : 'var(--red)',
                                color: 'white',
                                cursor: 'pointer'
                            }}
                        >
                            Đóng
                        </Button>
                    </div>
                }
            />
        </Form>
    );
}