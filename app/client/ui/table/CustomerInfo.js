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
import { getServiceDetailById } from '@/data/customers/wraperdata.db';
import { cn } from "@/lib/utils";
import { driveImage } from '@/function/index';

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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

function TreatmentDoseAccordion({ item }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [doseInfo, setDoseInfo] = useState(null);

    const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const handleToggle = async () => {
        const next = !open;
        setOpen(next);
        if (!next || doseInfo || loading) return;
        const sourceId = item.sourceId;
        if (!sourceId) return;
        try {
            setLoading(true);
            setError('');
            const res = await fetch(
                `/api/treatment-sessions/usage?serviceDetailId=${encodeURIComponent(String(sourceId))}`
            );
            const json = await res.json();
            if (!res.ok || !json?.success) {
                setError(json?.error || 'Không lấy được dữ liệu liệu trình.');
                return;
            }
            const data = json.data || {};
            const totalDose = typeof data.totalDose === 'number' ? data.totalDose : null;
            const usedDose = typeof data.usedDose === 'number' ? data.usedDose : 0;
            const unit = data.medicationUnit || '';
            const sessions = Array.isArray(data.sessions) ? data.sessions : [];
            setDoseInfo({ totalDose, usedDose, unit, sessions });
        } catch (err) {
            console.error('[TreatmentDoseAccordion] error:', err);
            setError('Lỗi khi tải dữ liệu liệu trình.');
        } finally {
            setLoading(false);
        }
    };

    const headerTitle = doseInfo
        ? `${item.courseName || 'Liệu trình'} - Tổng: ${doseInfo.totalDose ?? '—'} ${
              doseInfo.unit || ''
          } / Đã dùng: ${doseInfo.usedDose ?? 0} ${doseInfo.unit || ''}`
        : `${item.courseName || 'Liệu trình'}`;

    return (
        <div className="border rounded-md bg-muted/30">
            <button
                type="button"
                onClick={handleToggle}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
            >
                <span className="text-sm font-medium">{headerTitle}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                    {open ? 'Thu gọn' : 'Xem chi tiết'}
                </span>
            </button>
            {open && (
                <div className="border-t px-3 py-2 space-y-2">
                    <p className="text-xs text-muted-foreground" style={{ fontSize: '12px' }}>
                        Ngày làm liệu trình lần cuối: <b>{formatDate(item.doneAt)}</b>
                    </p>
                    {loading ? (
                        <p className="text-xs text-muted-foreground">Đang tải...</p>
                    ) : error ? (
                        <p className="text-xs text-destructive">{error}</p>
                    ) : doseInfo && doseInfo.sessions.length > 0 ? (
                        <div className="space-y-1">
                            {doseInfo.sessions.map((s, idx) => {
                                const dose = s.medicationDose ?? 0;
                                const unit = s.medicationUnit || doseInfo.unit || '';
                                const start = s.startDate ? formatDate(s.startDate) : '—';
                                return (
                                    <div
                                        key={s._id || `${idx}`}
                                        className="text-xs text-muted-foreground"
                                    >
                                        {`${item.courseName || 'Liệu trình'} - ${dose} ${
                                            unit || ''
                                        } - ${start}`}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Chưa có dữ liệu lượng thuốc cho liệu trình này.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
import Popup from '@/components/ui/popup';
import CloseServiceForm from './CloseServiceForm';


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
    customerCode: z.string().optional(),
    service_start_date: z.string().optional(),
    service_last_date: z.string().optional(),
});

export default function CustomerInfo({ customer, onClose, service = [], discountPrograms = [], unitMedicines = [], treatmentDoctors = [] }) {
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
    const [isEditingCustomerCode, setIsEditingCustomerCode] = useState(false);
    const [isGeneratingCustomerCode, setIsGeneratingCustomerCode] = useState(false);
    const [editingAreaId, setEditingAreaId] = useState(null);
    const [editAreaName, setEditAreaName] = useState('');
    const [editAreaType, setEditAreaType] = useState('');
    const [notification, setNotification] = useState({ open: false, status: true, mes: '' });
    
    // State cho popup xem chi tiết đơn chốt dịch vụ
    const [isViewDetailOpen, setIsViewDetailOpen] = useState(false);
    const [viewingDetail, setViewingDetail] = useState(null);

    // Chỉ khóa khi mã do hệ thống gán (NORMAL) và đã có mã — không khóa theo nguồn chi tiết
    const hasCustomerCode = !!(customer?.customerCode && String(customer.customerCode).trim() !== '');
    const customerCodeLocked = customer?.customerCodeType === 'NORMAL' && hasCustomerCode;
    
    // ✅ State để lưu full serviceDetails đã fetch từ service_details collection
    const [fullServiceDetails, setFullServiceDetails] = useState([]);
    const [isLoadingServiceDetails, setIsLoadingServiceDetails] = useState(false);

    // Danh sách loại khu vực
    const areaTypeOptions = [
        { value: 'lân cận HCM', label: 'lân cận HCM' },
        { value: 'TP HCM', label: 'TP HCM' },
        { value: 'xa HCM', label: 'xa HCM' }
    ];

    // Lịch sử liệu trình/dịch vụ được lấy từ collection treatment_sessions (thiết kế mới)
    const [treatmentSummary, setTreatmentSummary] = useState([]);
    const [isHistorySyncing, setIsHistorySyncing] = useState(false);

    const serviceOptions = useMemo(() =>
        service.map(item => ({ value: item._id, label: item.name })),
        [service]
    );

    // ✅ Fetch full serviceDetails từ service_details collection dựa vào serviceDetailIds
    useEffect(() => {
        const fetchFullServiceDetails = async () => {
            if (!customer.serviceDetails || !Array.isArray(customer.serviceDetails) || customer.serviceDetails.length === 0) {
                setFullServiceDetails([]);
                return;
            }

            // Lấy danh sách serviceDetailIds từ customer.serviceDetails
            const serviceDetailIds = customer.serviceDetails
                .map(sd => {
                    // Lấy serviceDetailId từ reference (có thể là ObjectId object hoặc string)
                    if (sd.serviceDetailId) {
                        // Nếu là object có _id hoặc toString, lấy _id hoặc toString
                        if (typeof sd.serviceDetailId === 'object') {
                            return String(sd.serviceDetailId._id || sd.serviceDetailId.toString());
                        }
                        return String(sd.serviceDetailId);
                    }
                    // Fallback: nếu có _id trực tiếp
                    if (sd._id) {
                        if (typeof sd._id === 'object') {
                            return String(sd._id._id || sd._id.toString());
                        }
                        return String(sd._id);
                    }
                    return null;
                })
                .filter(id => id); // Lọc bỏ null/undefined

            if (serviceDetailIds.length === 0) {
                setFullServiceDetails([]);
                return;
            }

            setIsLoadingServiceDetails(true);
            try {
                console.log('[CustomerInfo] Fetching service details với IDs:', serviceDetailIds);
                const response = await fetch('/api/service-details/batch', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ serviceDetailIds }),
                });

                const result = await response.json();
                console.log('[CustomerInfo] Fetch result:', result);
                if (result.success && result.data) {
                    console.log('[CustomerInfo] Fetched service details:', result.data.length, 'items');
                    setFullServiceDetails(result.data);
                } else {
                    console.error('[CustomerInfo] Error fetching service details:', result.error);
                    setFullServiceDetails([]);
                }
            } catch (error) {
                console.error('[CustomerInfo] Error fetching service details:', error);
                setFullServiceDetails([]);
            } finally {
                setIsLoadingServiceDetails(false);
            }
        };

        fetchFullServiceDetails();
    }, [customer.serviceDetails]);

    // Lấy tên dịch vụ đã sử dụng từ treatmentSummary (thiết kế mới) hoặc fallback serviceDetails
    const serviceNamesFromServiceDetails = useMemo(() => {
        if (Array.isArray(treatmentSummary) && treatmentSummary.length > 0) {
            const names = treatmentSummary.map((s) => s?.serviceName).filter(Boolean);
            return [...new Set(names)].join(', ');
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
    }, [treatmentSummary, customer.serviceDetails, serviceOptions]);

    // Đồng bộ dữ liệu lịch sử liệu trình từ treatment_sessions
    useEffect(() => {
        let isMounted = true;
        const fetchTreatmentSummary = async () => {
            try {
                if (!customer?._id) return;
                setIsHistorySyncing(true);
                const res = await fetch(`/api/treatment-sessions/summary/${customer._id}`);
                const data = await res.json();
                if (!isMounted) return;
                if (data?.success && Array.isArray(data.data)) {
                    setTreatmentSummary(data.data);
                } else {
                    console.error('[CustomerInfo] Lỗi khi tải treatment summary:', data?.error);
                    setTreatmentSummary([]);
                }
            } catch (error) {
                console.error('[CustomerInfo] Lỗi fetch treatment summary:', error);
                if (isMounted) {
                    setTreatmentSummary([]);
                }
            } finally {
                if (isMounted) {
                    setIsHistorySyncing(false);
                }
            }
        };

        fetchTreatmentSummary();

        return () => {
            isMounted = false;
        };
    }, [customer._id]);

    // ✅ Nhóm dữ liệu lịch sử để hiển thị
    // Ưu tiên dùng treatmentSummary (treatment_sessions) cho đúng kiến trúc tối ưu,
    // fallback sang fullServiceDetails (service_details) nếu chưa có dữ liệu session.
    const groupedServiceDetailsByService = useMemo(() => {
        // 1) Ưu tiên: dùng treatmentSummary (treatment_sessions)
        if (Array.isArray(treatmentSummary) && treatmentSummary.length > 0) {
            return treatmentSummary.map((s) => ({
                serviceId: s.serviceId,
                serviceName: s.serviceName,
                courses: (s.courses || []).map((course) => ({
                    courseName: course.courseName || 'Chưa có liệu trình',
                    startDate: course.firstTime || null,
                    lastDate: course.lastTime || null,
                })),
            }));
        }

        // 2) Fallback: sử dụng fullServiceDetails đã fetch từ service_details collection
        // Sử dụng fullServiceDetails (đã fetch đầy đủ từ service_details collection)
        const serviceDetailsToUse = fullServiceDetails.length > 0 ? fullServiceDetails : [];
        
        console.log('[CustomerInfo] groupedServiceDetailsByService - fullServiceDetails:', serviceDetailsToUse.length);
        
        // Nếu không có serviceDetails, trả về mảng rỗng
        if (serviceDetailsToUse.length === 0) {
            console.log('[CustomerInfo] Không có serviceDetails để hiển thị');
            return [];
        }

        // Tạo map để tìm tên dịch vụ từ serviceId
        const serviceMap = new Map();
        service.forEach(s => {
            if (s._id) {
                serviceMap.set(String(s._id), s.name);
            }
        });

        // Group serviceDetails theo serviceId
        const groupedByServiceId = new Map();

        serviceDetailsToUse.forEach(detail => {
            // Lấy serviceId từ detail
            let serviceIdStr = null;
            if (detail.serviceId) {
                serviceIdStr = String(detail.serviceId._id || detail.serviceId);
            }

            if (!serviceIdStr) {
                return; // Bỏ qua nếu không có serviceId
            }

            // Lấy tên dịch vụ
            const serviceName = serviceMap.get(serviceIdStr) 
                || (detail.serviceId?.name) 
                || serviceOptions.find(opt => String(opt.value) === serviceIdStr)?.label 
                || 'Không rõ dịch vụ';

            // Lấy courseName từ selectedCourse
            const courseName = detail.selectedCourse?.name || 'Chưa có liệu trình';

            // Khởi tạo group nếu chưa có
            if (!groupedByServiceId.has(serviceIdStr)) {
                groupedByServiceId.set(serviceIdStr, {
                    serviceId: serviceIdStr,
                    serviceName,
                    courses: new Map(), // Dùng Map để group theo courseName
                });
            }

            const serviceGroup = groupedByServiceId.get(serviceIdStr);
            
            // Group courses theo courseName
            if (!serviceGroup.courses.has(courseName)) {
                serviceGroup.courses.set(courseName, []);
            }
            serviceGroup.courses.get(courseName).push(detail);
        });

        // Chuyển Map thành mảng và tính startDate, lastDate cho mỗi course
        return Array.from(groupedByServiceId.values()).map(serviceGroup => {
            const courses = Array.from(serviceGroup.courses.entries()).map(([courseName, items]) => {
                // Sắp xếp theo closedAt để lấy ngày đầu và ngày cuối
                const sortedItems = items
                    .filter(d => d.closedAt)
                    .sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));

                return {
                    courseName: courseName || 'Chưa có liệu trình',
                    startDate: sortedItems[0]?.closedAt || items[0]?.createdAt || items[0]?.closedAt || null,
                    lastDate: sortedItems[sortedItems.length - 1]?.closedAt || items[items.length - 1]?.createdAt || items[items.length - 1]?.closedAt || null,
                };
            });

            return {
                serviceId: serviceGroup.serviceId,
                serviceName: serviceGroup.serviceName,
                courses,
            };
        });
    }, [treatmentSummary, fullServiceDetails, service, serviceOptions]);

    // Normalize và nhóm lịch sử liệu trình theo dịch vụ để hiển thị (dùng treatmentSummary nếu có)
    const customerTreatments = useMemo(() => {
        // Lấy danh sách dịch vụ từ service prop
        const allServices = Array.isArray(service) ? service : [];

        // Nếu đã có treatmentSummary từ API mới:
        // - Ưu tiên: chỉ hiển thị các dịch vụ trong tags (dịch vụ quan tâm)
        // - Với mỗi dịch vụ quan tâm: dùng dữ liệu session nếu có, và bổ sung các liệu trình chưa làm
        if (Array.isArray(treatmentSummary) && treatmentSummary.length > 0) {
            const summaryByServiceId = new Map();
            treatmentSummary.forEach((s) => {
                if (s?.serviceId) {
                    summaryByServiceId.set(String(s.serviceId), s);
                }
            });

            // Dịch vụ quan tâm (tags) của khách hàng
            const tagIds = Array.isArray(customer.tags)
                ? customer.tags
                      .map((tag) => {
                          if (typeof tag === 'string') return tag;
                          if (tag?._id) return String(tag._id);
                          return String(tag);
                      })
                      .filter(Boolean)
                : [];

            const serviceMapById = new Map();
            allServices.forEach((s) => {
                if (s?._id) serviceMapById.set(String(s._id), s);
            });

            const result = [];

            // Ưu tiên dịch vụ trong tags
            tagIds.forEach((id) => {
                const svc = serviceMapById.get(String(id));
                if (!svc) return;

                const summary = summaryByServiceId.get(String(id));
                const done = [];
                const doneCourseIds = new Set();

                if (summary && Array.isArray(summary.courses)) {
                    summary.courses.forEach((course) => {
                        if (course.status === 'done') {
                            done.push({
                                courseName: course.courseName,
                                doneAt: course.lastTime,
                                firstTime: course.firstTime,
                                total: course.total,
                                // Ưu tiên serviceDetailId từ treatment_sessions để dùng cho "Xem chi tiết"
                                sourceId: course.serviceDetailId || course.courseId,
                            });
                            if (course.courseId) {
                                doneCourseIds.add(String(course.courseId));
                            }
                        }
                    });
                }

                const allCourses = Array.isArray(svc.treatmentCourses) ? svc.treatmentCourses : [];
                const notDone = allCourses
                    .filter((c) => !doneCourseIds.has(String(c._id || '')))
                    .map((c) => ({
                        courseId: String(c._id || ''),
                        courseName: c.name || 'Liệu trình',
                        totalSessions: c.totalSessions || 1,
                        lastUsedDateForCourse: null,
                    }));

                result.push({
                    serviceName: svc.name || 'Không rõ dịch vụ',
                    serviceId: String(svc._id || ''),
                    done,
                    remaining: notDone.reduce((sum, c) => sum + (c.totalSessions || 1), 0),
                    notDone,
                    lastUsedDate: done.length > 0 ? done[0].doneAt : null,
                });
            });

            // Nếu không có dịch vụ trong tags nhưng vẫn có session → hiển thị như trước (backup)
            if (result.length === 0) {
                return treatmentSummary.map((s) => {
                    const done = [];
                    const notDone = [];

                    (s.courses || []).forEach((course) => {
                        if (course.status === 'done') {
                            done.push({
                                courseName: course.courseName,
                                doneAt: course.lastTime,
                                firstTime: course.firstTime,
                                total: course.total,
                                sourceId: course.courseId,
                            });
                        } else {
                            notDone.push({
                                courseId: course.courseId,
                                courseName: course.courseName,
                                totalSessions: course.total || course.totalSessions || 1,
                                lastUsedDateForCourse: course.lastTime || null,
                            });
                        }
                    });

                    return {
                        serviceName: s.serviceName,
                        serviceId: s.serviceId,
                        done,
                        remaining: notDone.reduce((sum, c) => sum + (c.totalSessions || 1), 0),
                        notDone,
                        lastUsedDate: done.length > 0 ? done[0].doneAt : null,
                    };
                });
            }

            return result;
        }

        // Fallback: logic cũ dựa trên customer.serviceDetails nếu chưa có treatmentSummary
        // Nhưng CHỈ cho các dịch vụ khách hàng quan tâm (tags)
        const customerTags = Array.isArray(customer.tags) ? customer.tags : [];
        const tagIdsForFallback = customerTags
            .map((tag) => {
                if (typeof tag === 'string') return tag;
                if (tag?._id) return String(tag._id);
                return String(tag);
            })
            .filter(Boolean);

        const servicesList = allServices.filter(
            (s) => s?._id && tagIdsForFallback.includes(String(s._id))
        );
        
        // Tạo map để dễ tìm service theo tên hoặc ID
        const serviceMapByName = {};
        const serviceMapById = {};
        servicesList.forEach(s => {
            if (s.name) serviceMapByName[s.name] = s;
            if (s._id) serviceMapById[String(s._id)] = s;
        });

        // Nhóm serviceDetails theo dịch vụ
        const treatmentMap = {};
        
        // Xử lý serviceDetails đã có
        if (customer.serviceDetails && Array.isArray(customer.serviceDetails) && customer.serviceDetails.length > 0) {
            customer.serviceDetails.forEach((sd) => {
                let serviceName = 'Không rõ dịch vụ';
                let serviceId = null;
                // Ưu tiên serviceId (snapshot) để khớp với history_service và list API
                if (sd.serviceId) {
                    const sid = typeof sd.serviceId === 'object' ? String(sd.serviceId._id ?? sd.serviceId) : String(sd.serviceId);
                    const found = serviceMapById[sid];
                    if (found?.name) {
                        serviceName = found.name;
                        serviceId = sid;
                    }
                }
                if (serviceName === 'Không rõ dịch vụ' && typeof sd.selectedService === 'string') {
                    serviceId = sd.selectedService;
                    const foundService = serviceMapById[serviceId];
                    serviceName = foundService?.name || serviceId;
                } else if (serviceName === 'Không rõ dịch vụ' && sd.selectedService?._id) {
                    serviceId = String(sd.selectedService._id);
                    serviceName = sd.selectedService.name || 'Không rõ dịch vụ';
                } else if (serviceName === 'Không rõ dịch vụ' && sd.selectedService?.name) {
                    serviceName = sd.selectedService.name;
                    const foundService = serviceMapByName[serviceName];
                    serviceId = foundService?._id ? String(foundService._id) : null;
                }

                const courseName = sd.selectedCourse?.name || '';
                let courseId = null;
                if (sd.selectedCourse?._id) {
                    courseId = String(sd.selectedCourse._id);
                }

                if (!treatmentMap[serviceName]) {
                    treatmentMap[serviceName] = {
                        serviceName,
                        serviceId,
                        done: [],
                        doneCourseIds: new Set(),
                        doneCourseNames: new Set(), // Track theo tên liệu trình (để khớp history_service / snapshot không có _id)
                        lastUsedDate: null,
                        lastUsedByCourseName: {}   // { courseName: date } — ngày sử dụng lần cuối theo từng liệu trình
                    };
                }

                const doneAt = sd.closedAt || sd.createdAt;
                treatmentMap[serviceName].done.push({
                    courseName,
                    courseId,
                    doneAt,
                    sourceId: sd.serviceDetailId || sd._id
                });

                if (courseId) {
                    treatmentMap[serviceName].doneCourseIds.add(courseId);
                }
                if (courseName) {
                    treatmentMap[serviceName].doneCourseNames.add(courseName);
                    // Ngày sử dụng lần cuối cho từng liệu trình (lấy ngày mới nhất nếu có nhiều đơn)
                    const prev = treatmentMap[serviceName].lastUsedByCourseName[courseName];
                    if (!prev || (doneAt && new Date(doneAt) > new Date(prev))) {
                        treatmentMap[serviceName].lastUsedByCourseName[courseName] = doneAt;
                    }
                }

                if (doneAt) {
                    const doneDate = new Date(doneAt);
                    const currentLastDate = treatmentMap[serviceName].lastUsedDate
                        ? new Date(treatmentMap[serviceName].lastUsedDate)
                        : null;
                    if (!currentLastDate || doneDate > currentLastDate) {
                        treatmentMap[serviceName].lastUsedDate = doneAt;
                    }
                }
            });
        }

        // Xử lý tất cả dịch vụ từ services để tìm liệu trình chưa làm
        const result = [];
        
        servicesList.forEach(service => {
            const serviceName = service.name || 'Không rõ dịch vụ';
            const serviceId = String(service._id || '');
            
            const treatment = treatmentMap[serviceName] || {
                serviceName,
                serviceId,
                done: [],
                doneCourseIds: new Set(),
                doneCourseNames: new Set(),
                lastUsedDate: null,
                lastUsedByCourseName: {}
            };

            treatment.done.sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt));

            const allCourses = service.treatmentCourses || [];
            // Liệu trình chưa làm: chưa có trong doneCourseIds VÀ chưa có trong doneCourseNames (tránh hiển thị sai khi snapshot không có _id)
            const notDoneCourses = allCourses.filter(course => {
                const courseId = String(course._id || '');
                const courseName = course.name || 'Liệu trình';
                return !treatment.doneCourseIds.has(courseId) && !treatment.doneCourseNames.has(courseName);
            });

            let remaining = 0;
            notDoneCourses.forEach(course => {
                remaining += (course.totalSessions || 1);
            });

            result.push({
                serviceName,
                serviceId,
                done: treatment.done,
                remaining,
                notDone: notDoneCourses.map(course => {
                    const courseName = course.name || 'Liệu trình';
                    const lastUsedDateForCourse = treatment.lastUsedByCourseName?.[courseName] || null;
                    return {
                        courseId: String(course._id || ''),
                        courseName,
                        totalSessions: course.totalSessions || 1,
                        lastUsedDateForCourse
                    };
                }),
                lastUsedDate: treatment.lastUsedDate
            });
        });

        // Nếu không có service nào trong services list, vẫn hiển thị những gì đã làm
        if (result.length === 0 && Object.keys(treatmentMap).length > 0) {
            Object.values(treatmentMap).forEach(treatment => {
                treatment.done.sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt));
                result.push({
                    serviceName: treatment.serviceName,
                    serviceId: treatment.serviceId,
                    done: treatment.done,
                    remaining: 0,
                    notDone: [],
                    lastUsedDate: treatment.lastUsedDate
                });
            });
        }

        return result;
    }, [customer.serviceDetails, customer.tags, customer.service_use, service, treatmentSummary]);

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
            customerCode: customer.customerCode || '',
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
                setIsEditingCustomerCode(false);
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
                    <FormField 
                        control={form.control} 
                        name="customerCode" 
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex items-center justify-between mb-2">
                                    <Label><h6>Mã khách hàng</h6></Label>
                                    {!customerCodeLocked && !isEditingCustomerCode && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            disabled={isGeneratingCustomerCode}
                                            onClick={async () => {
                                                setIsEditingCustomerCode(true);
                                                setIsGeneratingCustomerCode(true);
                                                try {
                                                    const res = await fetch('/api/customers/generate-code?type=NORMAL');
                                                    const json = await res.json();
                                                    if (!res.ok || !json?.success) {
                                                        throw new Error(json?.error || json?.message || 'Không thể tạo mã gợi ý');
                                                    }
                                                    form.setValue('customerCode', json.suggestedCode, { shouldDirty: true, shouldTouch: true });
                                                } catch (e) {
                                                    setNotification({ open: true, status: false, mes: e?.message || 'Có lỗi khi tạo mã gợi ý' });
                                                    setIsEditingCustomerCode(false);
                                                } finally {
                                                    setIsGeneratingCustomerCode(false);
                                                }
                                            }}
                                        >
                                            {isGeneratingCustomerCode ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                                        </Button>
                                    )}
                                </div>
                                <FormControl>
                                    <Input
                                        {...field}
                                        value={field.value && String(field.value).trim() !== '' ? field.value : 'Null'}
                                        disabled={customerCodeLocked || !isEditingCustomerCode}
                                        readOnly={customerCodeLocked || !isEditingCustomerCode}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
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

                {/* Liệu trình của khách hàng */}
                <div className="mt-6">
                    <h6 className="font-semibold mb-3">Liệu trình của khách hàng</h6>
                    {customerTreatments.length === 0 ? (
                        <div className="text-center text-muted-foreground py-4 border rounded-md">
                            Chưa có liệu trình nào
                        </div>
                    ) : (
                        <Accordion type="single" collapsible className="w-full">
                            {customerTreatments.map((treatment, index) => {
                                const formatDate = (date) => {
                                    if (!date) return '';
                                    const d = new Date(date);
                                    if (isNaN(d.getTime())) return '';
                                    return d.toLocaleDateString('vi-VN', { 
                                        day: '2-digit', 
                                        month: '2-digit', 
                                        year: 'numeric' 
                                    });
                                };

                                return (
                                    <AccordionItem key={index} value={`treatment-${index}`}>
                                        <AccordionTrigger className="hover:no-underline">
                                            <div className="flex items-center justify-between w-full pr-4">
                                                <span className="font-semibold">{treatment.serviceName}</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="space-y-4 pt-2">
                                                {/* Liệu trình đã làm */}
                                                {treatment.done.length > 0 && (
                                                    <div>
                                                        <h6 className="font-semibold mb-2 text-sm">Liệu trình đã làm:</h6>
                                                        <div className="space-y-2">
                                                            {treatment.done.map((item, idx) => (
                                                                <TreatmentDoseAccordion
                                                                    key={item.sourceId || `done-${idx}`}
                                                                    item={item}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Liệu trình còn lại (số buổi) */}
                                                {/* {treatment.remaining > 0 && (
                                                    <div>
                                                        <h6 className="font-semibold mb-2 text-sm">Liệu trình còn lại của dịch vụ:</h6>
                                                        <div className="space-y-2">
                                                            {Array.from({ length: treatment.remaining }).map((_, idx) => (
                                                                <div key={idx} className="flex items-center justify-between p-2 border rounded-md bg-amber-50">
                                                                    <span className="text-sm">
                                                                        Buổi {idx + 1} - Thời gian sử dụng liệu trình trước đó: {treatment.lastUsedDate ? formatDate(treatment.lastUsedDate) : '—'}
                                                                    </span>
                                                                    <Button 
                                                                        size="sm" 
                                                                        variant="outline"
                                                                        className="text-amber-700 border-amber-300 hover:bg-amber-100"
                                                                        onClick={() => {
                                                                            // TODO: Nhắc nhân viên
                                                                            console.log('Nhắc nhân viên cho:', treatment.serviceName);
                                                                        }}
                                                                    >
                                                                        Nhắc nhân viên
                                                                    </Button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )} */}

                                                {/* Liệu trình chưa làm - chỉ hiển thị tên liệu trình */}
                                                    {treatment.notDone && treatment.notDone.length > 0 && (
                                                    <div>
                                                        <h6 className="font-semibold mb-2 text-sm">Liệu trình chưa làm:</h6>
                                                        <div className="space-y-2">
                                                            {treatment.notDone.map((course, idx) => (
                                                                <div key={idx} className="flex items-center justify-between p-2 border rounded-md bg-red-50">
                                                                    <span className="text-sm">
                                                                        {`${course.courseName} - Chưa thực hiện`}
                                                                    </span>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="text-red-700 border-red-300 hover:bg-red-100"
                                                                        onClick={() => {
                                                                            console.log('Nhắc nhân viên cho liệu trình chưa làm:', course.courseName);
                                                                        }}
                                                                    >
                                                                        Nhắc nhân viên
                                                                    </Button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {treatment.done.length === 0 && treatment.remaining === 0 && (!treatment.notDone || treatment.notDone.length === 0) && (
                                                    <div className="text-center text-muted-foreground py-2">
                                                        Chưa có liệu trình
                                                    </div>
                                                )}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    )}
                </div>

                {/* Lịch sử - Sử dụng dịch vụ */}
                <div className="mt-6">
                    <h6 className="font-semibold mb-3">Lịch sử - Sử dụng dịch vụ</h6>
                    <div className="border-2 border-black rounded-lg p-4 space-y-6">
                        {/* Hiển thị loading state */}
                        {isLoadingServiceDetails ? (
                            <div className="text-center text-muted-foreground py-4">
                                Đang tải dữ liệu...
                            </div>
                        ) : groupedServiceDetailsByService.length > 0 ? (
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
            
            {/* Popup xem chi tiết đơn chốt dịch vụ */}
            {isViewDetailOpen && viewingDetail && (
                <ViewServiceDetailPopup
                    detail={viewingDetail}
                    services={service}
                    discountPrograms={discountPrograms}
                    unitMedicines={unitMedicines}
                    treatmentDoctors={treatmentDoctors}
                    onClose={() => {
                        setIsViewDetailOpen(false);
                        setViewingDetail(null);
                    }}
                />
            )}
        </Form>
    );
}

// Schema cho CloseServiceForm (giống CustomerPipeline)
const closeServiceSchema = z.object({
    _id: z.string().optional(),
    status: z.enum(['new', 'in_progress', 'completed', 'rejected']),
    selectedService: z.string().optional(),
    selectedCourseName: z.string().optional(),
    notes: z.string().optional(),
    invoiceImage: z.any().optional(),
    customerPhotos: z.any().optional(),
    discountType: z.enum(['none', 'amount', 'percent']).default('none'),
    discountValue: z.string().optional(),
    adjustmentType: z.enum(['none', 'discount', 'increase']).default('none'),
    adjustmentValue: z.string().optional(),
    medicationName: z.string().optional(),
    medicationUnit: z.string().optional(),
    medicationDosage: z.string().optional(),
    consultantName: z.string().optional(),
    doctorName: z.string().optional(),
});

// Component để hiển thị chi tiết đơn chốt dịch vụ (read-only)
function ViewServiceDetailPopup({ detail, services, discountPrograms, unitMedicines, treatmentDoctors, onClose }) {
    const [availableCourses, setAvailableCourses] = useState([]);
    const [existingImageUrls, setExistingImageUrls] = useState([]);
    const [existingImageIds, setExistingImageIds] = useState([]);
    const [existingCustomerPhotoUrls, setExistingCustomerPhotoUrls] = useState([]);
    const [existingCustomerPhotoIds, setExistingCustomerPhotoIds] = useState([]);
    const [unifiedInvoiceImages, setUnifiedInvoiceImages] = useState([]);
    const [unifiedCustomerPhotos, setUnifiedCustomerPhotos] = useState([]);
    
    const detailForm = useForm({
        resolver: zodResolver(closeServiceSchema),
        defaultValues: {
            status: 'completed',
            selectedService: '',
            selectedCourseName: '',
            notes: '',
            discountType: 'none',
            discountValue: '0',
            adjustmentType: 'none',
            adjustmentValue: '0',
            medicationName: '',
            medicationUnit: '',
            medicationDosage: '',
            consultantName: '',
            doctorName: '',
        },
    });

    useEffect(() => {
        if (!detail) return;

        const loadDetailData = (detailData) => {
            if (!detailData) return;
            let serviceId = '';
            if (detailData.serviceId) {
                const raw = detailData.serviceId;
                serviceId = typeof raw === 'object' && raw !== null ? String(raw._id ?? raw) : String(raw);
            } else {
                const raw = detailData.selectedService;
                serviceId = raw ? (typeof raw === 'object' ? String(raw._id ?? raw) : String(raw)) : '';
            }

            const service = services?.find(s => String(s._id) === serviceId) ?? null;
            const courses = service?.treatmentCourses ?? [];
            setAvailableCourses(courses);

            const courseName = detailData.selectedCourse?.name ?? '';

            const ids = detailData.invoiceDriveIds || [];
            const urls = ids.map(id => driveImage(id)).filter(Boolean);
            setExistingImageUrls(urls);
            setExistingImageIds(ids);
            setUnifiedInvoiceImages(urls.map((url, idx) => ({
                type: 'existing',
                url,
                id: ids[idx],
                index: idx
            })));

            const customerPhotoIds = detailData.customerPhotosDriveIds || [];
            const customerPhotoUrls = customerPhotoIds.map(id => driveImage(id));
            const validCustomerPhotoUrls = customerPhotoUrls.filter(Boolean);
            setExistingCustomerPhotoUrls(validCustomerPhotoUrls);
            setExistingCustomerPhotoIds(customerPhotoIds);
            setUnifiedCustomerPhotos(validCustomerPhotoUrls.map((url, idx) => ({
                type: 'existing',
                url,
                id: customerPhotoIds[idx],
                index: idx
            })));

            const pricing = detailData.pricing || {};
            const adjustmentType = pricing.adjustmentType || 'none';
            const adjustmentValue = pricing.adjustmentValue ?? 0;
            const discountValue = pricing.discountValue ?? 0;

            const formatDiscountValue = (value, unit) => {
                if (unit === 'percent') return String(value);
                if (unit === 'amount') return new Intl.NumberFormat('vi-VN').format(value);
                return '0';
            };

            // Map status DB (processing|completed|cancelled) sang form (in_progress|completed|rejected)
            const formStatus = detailData.status === 'processing' ? 'in_progress'
                : detailData.status === 'cancelled' ? 'rejected'
                : (detailData.status || 'completed');

            const detailId = detailData._id ?? detailData.serviceDetailId;
            const idForForm = detailId != null ? (typeof detailId === 'object' ? String(detailId._id ?? detailId) : String(detailId)) : undefined;
            if (serviceId || idForForm) {
                detailForm.reset({
                    _id: idForForm || '',
                    status: formStatus,
                    selectedService: serviceId,
                    selectedCourseName: courses.some(c => c.name === courseName) ? courseName : courseName,
                    medicationName: detailData.selectedCourse?.medicationName || '',
                    medicationDosage: detailData.selectedCourse?.medicationDosage || '',
                    medicationUnit: detailData.selectedCourse?.medicationUnit || '',
                    consultantName: detailData.selectedCourse?.consultantName || '',
                    doctorName: detailData.selectedCourse?.doctorName || '',
                    notes: detailData.notes || '',
                    invoiceImage: new DataTransfer().files,
                    customerPhotos: new DataTransfer().files,
                    discountType: pricing.discountType || 'none',
                    discountValue: formatDiscountValue(discountValue, pricing.discountType || 'none'),
                    adjustmentType: adjustmentType,
                    adjustmentValue: formatDiscountValue(adjustmentValue, pricing.discountType || 'none'),
                }, {
                    keepDefaultValues: false,
                    keepValues: false,
                    keepDirty: false,
                    keepIsSubmitted: false,
                    keepTouched: false,
                    keepIsValid: false,
                    keepSubmitCount: false,
                });
            }
        };

        const fetchFullDetail = async () => {
            const hasId = detail.serviceDetailId ?? detail._id;
            const idStr = hasId != null ? (typeof hasId === 'object' ? String(hasId._id ?? hasId) : String(hasId)) : '';
            if (idStr && !detail.invoiceDriveIds?.length) {
                try {
                    const result = await getServiceDetailById(idStr);
                    if (result?.success && result?.data) {
                        loadDetailData(result.data);
                        return;
                    }
                } catch (err) {
                    console.error('Lỗi khi fetch service detail:', err);
                }
            }
            loadDetailData(detail);
        };

        fetchFullDetail();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detail, services]);

    return (
        <Popup
            open={true}
            onClose={onClose}
            widthClass="max-w-5xl"
            header="Xem Chi Tiết Đơn Chốt Dịch Vụ"
            footer={
                <Button type="button" onClick={onClose}>Đóng</Button>
            }
        >
            {(() => {
                const CloseServiceForm = require('./CloseServiceForm').default;
                const pricing = detail?.pricing || {};
                return (
                    <CloseServiceForm
                        form={detailForm}
                        status={detailForm.watch('status') || detail?.status || 'completed'}
                        services={services ?? []}
                        availableCourses={availableCourses}
                        listPrice={pricing.listPrice ?? 0}
                        finalRevenue={pricing.finalPrice ?? 0}
                        discountType={pricing.discountType || 'none'}
                        discountPrograms={discountPrograms ?? []}
                        currentUserName={detail?.selectedCourse?.consultantName || detailForm.watch('consultantName') || ''}
                        unitMedicines={unitMedicines}
                        treatmentDoctors={treatmentDoctors}
                        fileReg={detailForm.register('invoiceImage')}
                        onImageChange={() => {}}
                        existingImageUrls={existingImageUrls}
                        setExistingImageUrls={setExistingImageUrls}
                        existingImageIds={existingImageIds}
                        setExistingImageIds={setExistingImageIds}
                        newImagePreviews={[]}
                        onRemoveNewImage={() => {}}
                        customerPhotoFileReg={detailForm.register('customerPhotos')}
                        onCustomerPhotoChange={() => {}}
                        existingCustomerPhotoUrls={existingCustomerPhotoUrls}
                        setExistingCustomerPhotoUrls={setExistingCustomerPhotoUrls}
                        existingCustomerPhotoIds={existingCustomerPhotoIds}
                        setExistingCustomerPhotoIds={setExistingCustomerPhotoIds}
                        newCustomerPhotoPreviews={[]}
                        onRemoveCustomerPhoto={() => {}}
                        onSubmit={() => {}}
                        readOnly={true}
                        unifiedInvoiceImages={unifiedInvoiceImages}
                        setUnifiedInvoiceImages={setUnifiedInvoiceImages}
                        onReorderInvoiceImages={() => {}}
                        unifiedCustomerPhotos={unifiedCustomerPhotos}
                        setUnifiedCustomerPhotos={setUnifiedCustomerPhotos}
                        onReorderCustomerPhotos={() => {}}
                        onGetDeletedIds={() => {}}
                        resetToken={0}
                    />
                );
            })()}
        </Popup>
    );
}