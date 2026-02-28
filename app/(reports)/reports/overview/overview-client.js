'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar, RefreshCw, Download, DollarSign } from 'lucide-react';

// Listbox component (từ appointment-stats)
function Listbox({ label, options, value, onChange, placeholder = 'Chọn...' }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const listRef = useRef(null);
    const [active, setActive] = useState(-1);

    const current = useMemo(
        () => options.find(o => o.value === value) || { label: placeholder, value: undefined },
        [options, value, placeholder]
    );

    useEffect(() => {
        function onClickOutside(e) {
            if (!open) return;
            if (btnRef.current?.contains(e.target)) return;
            if (listRef.current?.contains(e.target)) return;
            setOpen(false);
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    return (
        <div className="w-full">
            {label && <label className="block mb-2 text-sm text-muted-foreground">{label}</label>}
            <div className="relative">
                <button
                    ref={btnRef}
                    type="button"
                    onClick={() => setOpen(v => !v)}
                    className="inline-flex w-full items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                >
                    <span className="truncate">{current.label}</span>
                    <span className="text-xs">▼</span>
                </button>
                {open && (
                    <ul
                        ref={listRef}
                        className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-[6px] border bg-white shadow-sm"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        {options.map((opt, idx) => (
                            <li
                                key={opt.value ?? `opt-${idx}`}
                                onClick={() => { onChange(opt.value); setOpen(false); }}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
                            >
                                {opt.label}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

const StatCard = ({ title, value, icon: Icon, color }) => (
    <Card className="shadow-lg border-l-4" style={{ borderLeftColor: color }}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-5 w-5" style={{ color }} />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
);

export default function OverviewReportClient({ customers = [], appointments = [], services = [], sources = [], messageSources = [], conversations = [] }) {
    const PAGE_SIZE = 40;

    // Filters
    const [sourceFilter, setSourceFilter] = useState('all');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [customerTypeFilter, setCustomerTypeFilter] = useState('all');
    const [appointmentTypeFilter, setAppointmentTypeFilter] = useState('all');
    const [conversationTypeFilter, setConversationTypeFilter] = useState('all'); // 'all' | 'lead' | 'not_lead'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Source options
    const sourceOptions = useMemo(() => {
        const opts = [{ value: 'all', label: 'Tất cả nguồn' }];
        (sources || []).forEach(s => opts.push({ value: String(s._id), label: s.name }));
        (messageSources || []).forEach(s => opts.push({ value: String(s._id), label: s.name }));
        return opts;
    }, [sources, messageSources]);

    // Service options
    const serviceOptions = useMemo(() => {
        const opts = [{ value: 'all', label: 'Tất cả dịch vụ' }];
        (services || []).forEach(s => opts.push({ value: String(s._id), label: s.name }));
        return opts;
    }, [services]);

    // Filtered data
    const filteredData = useMemo(() => {
        let filteredCustomers = [...customers];
        let filteredAppointments = [...appointments];
        let filteredConversations = [...conversations];

        console.log('[Overview][Filters] start =', {
            sourceFilter,
            serviceFilter,
            customerTypeFilter,
            appointmentTypeFilter,
            conversationTypeFilter,
            startDate,
            endDate,
            totalCustomers: customers.length,
        });

        // Date filter
        if (startDate) {
            const start = new Date(startDate + 'T00:00:00');
            filteredCustomers = filteredCustomers.filter(c => new Date(c.createAt) >= start);
            filteredAppointments = filteredAppointments.filter(a => new Date(a.appointmentDate) >= start);
            filteredConversations = filteredConversations.filter(conv => {
                if (!conv.createdAt) return true;
                return new Date(conv.createdAt) >= start;
            });
        }
        if (endDate) {
            const end = new Date(endDate + 'T23:59:59.999');
            filteredCustomers = filteredCustomers.filter(c => new Date(c.createAt) <= end);
            filteredAppointments = filteredAppointments.filter(a => new Date(a.appointmentDate) <= end);
            filteredConversations = filteredConversations.filter(conv => {
                if (!conv.createdAt) return true;
                return new Date(conv.createdAt) <= end;
            });
        }

        // Source filter
        if (sourceFilter !== 'all') {
            filteredCustomers = filteredCustomers.filter(c => {
                const sourceId = c.source ? String(c.source._id || c.source) : '';
                const sourceDetails = c.sourceDetails ? String(c.sourceDetails).trim() : '';
                return sourceId === sourceFilter || sourceDetails === sourceFilter;
            });
        }

        // Service filter
        if (serviceFilter !== 'all') {
            filteredCustomers = filteredCustomers.filter(c => {
                if (!c.serviceDetails || !Array.isArray(c.serviceDetails)) return false;
                return c.serviceDetails.some(sd => String(sd.selectedService?._id || sd.selectedService) === serviceFilter);
            });
        }

        // Customer type filter
        if (customerTypeFilter === 'new') {
            filteredCustomers = filteredCustomers.filter(c => !c.serviceDetails || c.serviceDetails.length === 0);
        } else if (customerTypeFilter === 'old') {
            filteredCustomers = filteredCustomers.filter(c => c.serviceDetails && c.serviceDetails.length > 0);
        }

        // Appointment type filter
        if (appointmentTypeFilter !== 'all') {
            filteredAppointments = filteredAppointments.filter(a => a.status === appointmentTypeFilter);
        }

        // Conversation type filter (LEAD / NOT_LEAD)
        if (conversationTypeFilter === 'lead') {
            filteredConversations = filteredConversations.filter(conv => conv.status === 'LEAD');
        } else if (conversationTypeFilter === 'not_lead') {
            filteredConversations = filteredConversations.filter(conv => conv.status === 'NOT_LEAD');
        }

        return { filteredCustomers, filteredAppointments, filteredConversations };
    }, [customers, appointments, conversations, startDate, endDate, sourceFilter, serviceFilter, customerTypeFilter, appointmentTypeFilter, conversationTypeFilter]);

    // Stats
    const stats = useMemo(() => ({
        totalCustomers: filteredData.filteredCustomers.length,
        totalAppointments: filteredData.filteredAppointments.length,
    }), [filteredData]);

    // Source map for lookup
    const sourceMap = useMemo(() => {
        const map = new Map();
        (sources || []).forEach(s => map.set(String(s._id), s.name));
        (messageSources || []).forEach(s => map.set(String(s._id), s.name));
        return map;
    }, [sources, messageSources]);

    // Service map for lookup
    const serviceMap = useMemo(() => {
        const map = new Map();
        (services || []).forEach(s => map.set(String(s._id), s.name));
        return map;
    }, [services]);

    // Helper function to get customer source name
    const getCustomerSourceName = (customer) => {
        // Check if source is populated (object with name)
        if (customer.source && typeof customer.source === 'object' && customer.source.name) {
            return customer.source.name;
        }
        // Check if source is ObjectId/string
        if (customer.source) {
            const sourceId = String(customer.source._id || customer.source);
            const sourceName = sourceMap.get(sourceId);
            if (sourceName) return sourceName;
        }
        // Check sourceDetails (for messageSources)
        if (customer.sourceDetails) {
            const sourceDetailsStr = String(customer.sourceDetails).trim();
            const sourceName = sourceMap.get(sourceDetailsStr);
            if (sourceName) return sourceName;
        }
        return '—';
    };

    // Helper function to get customer services
    const getCustomerServices = (customer) => {
        if (!customer.serviceDetails || !Array.isArray(customer.serviceDetails) || customer.serviceDetails.length === 0) {
            return [];
        }
        
        const serviceNames = [];
        customer.serviceDetails.forEach(sd => {
            if (sd.selectedService) {
                // Check if service is populated (object with name)
                if (typeof sd.selectedService === 'object' && sd.selectedService.name) {
                    serviceNames.push(sd.selectedService.name);
                } else {
                    // Check service ID in serviceMap
                    const serviceId = String(sd.selectedService._id || sd.selectedService);
                    const serviceName = serviceMap.get(serviceId);
                    if (serviceName) {
                        serviceNames.push(serviceName);
                    }
                }
            }
        });
        
        return serviceNames;
    };

    // Helper function to get customer order count
    const getCustomerOrderCount = (customer) => {
        if (!customer.serviceDetails || !Array.isArray(customer.serviceDetails)) {
            return 0;
        }
        return customer.serviceDetails.length;
    };

    // Helper function to get customer type (new/old)
    const getCustomerType = (customer) => {
        if (!customer) return '—';
        // Check if customer has serviceDetails (old customer) or not (new customer)
        if (customer.serviceDetails && Array.isArray(customer.serviceDetails) && customer.serviceDetails.length > 0) {
            return 'Khách cũ';
        }
        return 'Khách mới';
    };

    // Helper function to format appointment status
    const getAppointmentStatusText = (status) => {
        if (status === 'cancelled' || status === 'missed') {
            return 'Không đến/Hủy';
        }
        if (status === 'completed') {
            return 'Đến/ Hoàn thành';
        }
        if (status === 'pending') {
            return 'Chờ xử lý';
        }
        return status || '—';
    };

    // Helper function to get appointment status badge variant
    const getAppointmentStatusVariant = (status) => {
        if (status === 'completed') {
            return 'default';
        }
        if (status === 'cancelled' || status === 'missed') {
            return 'destructive';
        }
        if (status === 'pending') {
            return 'secondary';
        }
        return 'secondary';
    };

    // Helper function to format currency
    const formatCurrency = (value) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '0 đ';
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
    };

    // Helper function to calculate total base price from treatment courses
    const calculateTotalBasePrice = (service) => {
        if (!service.treatmentCourses || !Array.isArray(service.treatmentCourses)) {
            return 0;
        }
        return service.treatmentCourses.reduce((totalSum, course) => {
            // Lấy tất cả các giá trị số từ object 'costs' của liệu trình
            const allPricesForCourse = Object.values(course.costs || {});
            // Tính tổng tất cả chi phí cho liệu trình này
            const courseTotal = allPricesForCourse.reduce((courseSum, price) => courseSum + (price || 0), 0);
            // Cộng tổng của liệu trình vào tổng chung
            return totalSum + courseTotal;
        }, 0);
    };

    // Tables data with service stats + lazy loading
    const [customerLimit, setCustomerLimit] = useState(PAGE_SIZE);
    const [appointmentLimit, setAppointmentLimit] = useState(PAGE_SIZE);
    const [serviceLimit, setServiceLimit] = useState(PAGE_SIZE);
    const [conversationLimit, setConversationLimit] = useState(PAGE_SIZE);

    // Mỗi lần bộ lọc thay đổi, reset lại số dòng hiển thị
    useEffect(() => {
        setCustomerLimit(PAGE_SIZE);
        setAppointmentLimit(PAGE_SIZE);
        setConversationLimit(PAGE_SIZE);
    }, [filteredData]);

    // Tính thống kê dịch vụ cho TẤT CẢ services (dùng cho bảng + export)
    const servicesWithStatsAll = useMemo(() => {
        const getServiceInterestedCount = (serviceId) => {
            return filteredData.filteredCustomers.filter(c => {
                if (c.tags && Array.isArray(c.tags)) {
                    return c.tags.some(tag => String(tag._id || tag) === String(serviceId));
                }
                return false;
            }).length;
        };

        const getServiceUsedCount = (serviceId) => {
            return filteredData.filteredCustomers.filter(c => {
                if (c.serviceDetails && Array.isArray(c.serviceDetails)) {
                    return c.serviceDetails.some(sd => {
                        const sdServiceId = sd.serviceId
                            ? String(sd.serviceId._id || sd.serviceId)
                            : (sd.selectedService ? String(sd.selectedService._id || sd.selectedService) : null);
                        if (sdServiceId !== String(serviceId)) return false;
                        return sd.approvalStatus === 'approved' || sd.status === 'completed';
                    });
                }
                return false;
            }).length;
        };

        return services.map(s => ({
            ...s,
            totalBasePrice: calculateTotalBasePrice(s),
            interestedCount: getServiceInterestedCount(s._id),
            usedCount: getServiceUsedCount(s._id),
        }));
    }, [services, filteredData]);

    const tableData = useMemo(() => {
        const servicesWithStats = servicesWithStatsAll.slice(0, serviceLimit);
        
        return {
            customers: filteredData.filteredCustomers.slice(0, customerLimit),
            appointments: filteredData.filteredAppointments.slice(0, appointmentLimit),
            services: servicesWithStats,
            conversations: filteredData.filteredConversations.slice(0, conversationLimit),
            sources: [...sources, ...messageSources].slice(0, 20),
        };
    }, [filteredData, servicesWithStatsAll, sources, messageSources, customerLimit, appointmentLimit, serviceLimit, conversationLimit]);

    // Khi cuộn tới cuối bảng thì load thêm PAGE_SIZE bản ghi
    const handleScrollLoadMore = (e, type) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        const isBottom = scrollTop + clientHeight >= scrollHeight - 8;
        if (!isBottom) return;

        if (type === 'customers') {
            const maxLen = filteredData.filteredCustomers.length;
            setCustomerLimit((prev) => (prev < maxLen ? Math.min(prev + PAGE_SIZE, maxLen) : prev));
        } else if (type === 'appointments') {
            const maxLen = filteredData.filteredAppointments.length;
            setAppointmentLimit((prev) => (prev < maxLen ? Math.min(prev + PAGE_SIZE, maxLen) : prev));
        } else if (type === 'services') {
            const maxLen = services.length;
            setServiceLimit((prev) => (prev < maxLen ? Math.min(prev + PAGE_SIZE, maxLen) : prev));
        } else if (type === 'conversations') {
            const maxLen = filteredData.filteredConversations.length;
            setConversationLimit((prev) => (prev < maxLen ? Math.min(prev + PAGE_SIZE, maxLen) : prev));
        }
    };

    // Export Excel: luôn lấy TOÀN BỘ dữ liệu đã lọc (không theo limit)
    const handleDownload = async (type) => {
        const workbook = new ExcelJS.Workbook();
        const sheetName =
            type === 'customers' ? 'Khach hang' :
            type === 'appointments' ? 'Lich hen' :
            'Dich vu';

        const worksheet = workbook.addWorksheet(sheetName);

        if (type === 'customers') {
            worksheet.columns = [
                { header: 'Tên', key: 'name', width: 25 },
                { header: 'SĐT', key: 'phone', width: 18 },
                { header: 'Nguồn', key: 'source', width: 25 },
                { header: 'Dịch vụ sử dụng', key: 'services', width: 40 },
                { header: 'Số lượng đơn', key: 'orderCount', width: 15 },
            ];

            filteredData.filteredCustomers.forEach((c) => {
                const customerServices = getCustomerServices(c);
                const orderCount = getCustomerOrderCount(c);
                worksheet.addRow({
                    name: c.name || '',
                    phone: c.phone || '',
                    source: getCustomerSourceName(c),
                    services: customerServices.join(', '),
                    orderCount,
                });
            });
        } else if (type === 'appointments') {
            worksheet.columns = [
                { header: 'Tiêu đề', key: 'title', width: 30 },
                { header: 'Tên khách hàng', key: 'customerName', width: 25 },
                { header: 'Loại khách hàng', key: 'customerType', width: 18 },
                { header: 'Trạng thái', key: 'status', width: 18 },
            ];

            filteredData.filteredAppointments.forEach((a) => {
                const customerType = getCustomerType(a.customer);
                worksheet.addRow({
                    title: a.title || '',
                    customerName: a.customer?.name || '',
                    customerType,
                    status: getAppointmentStatusText(a.status),
                });
            });
        } else if (type === 'services') {
            worksheet.columns = [
                { header: 'Tên dịch vụ', key: 'name', width: 30 },
                { header: 'Giá (tổng các liệu trình)', key: 'price', width: 25 },
                { header: 'Số lượng người quan tâm', key: 'interested', width: 22 },
                { header: 'Số lượng người sử dụng', key: 'used', width: 22 },
            ];

            servicesWithStatsAll.forEach((s) => {
                worksheet.addRow({
                    name: s.name || '',
                    price: s.totalBasePrice || 0,
                    interested: s.interestedCount || 0,
                    used: s.usedCount || 0,
                });
            });
        } else if (type === 'conversations') {
            worksheet.columns = [
                { header: 'Tên khách hàng', key: 'name', width: 30 },
                { header: 'Nguồn', key: 'source', width: 40 },
                { header: 'Trạng thái', key: 'status', width: 15 },
            ];

            filteredData.filteredConversations.forEach((conv) => {
                worksheet.addRow({
                    name: conv.name || '',
                    source: conv.pageDisplayName || '',
                    status: conv.status || '',
                });
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
            type === 'customers'
                ? 'overview-khach-hang.xlsx'
                : type === 'appointments'
                    ? 'overview-lich-hen.xlsx'
                    : type === 'services'
                        ? 'overview-dich-vu.xlsx'
                        : 'overview-hoi-thoai-tin-nhan.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex-1 space-y-4 py-4 pt-6 min-h-screen">
            {/* Filters */}
            <Card className="shadow-md">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Bộ lọc</CardTitle>
                    <button
                        type="button"
                        onClick={() => {
                            setSourceFilter('all');
                            setServiceFilter('all');
                            setCustomerTypeFilter('all');
                            setAppointmentTypeFilter('all');
                            setConversationTypeFilter('all');
                            setStartDate('');
                            setEndDate('');
                        }}
                        className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                    >
                        <RefreshCw className="w-4 h-4" /> Đặt lại bộ lọc
                    </button>
                </CardHeader>
                <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
                    <Listbox
                        label="Nguồn"
                        options={sourceOptions}
                        value={sourceFilter}
                        onChange={setSourceFilter}
                    />
                    <Listbox
                        label="Dịch vụ"
                        options={serviceOptions}
                        value={serviceFilter}
                        onChange={setServiceFilter}
                    />
                    <Listbox
                        label="Loại khách hàng"
                        options={[
                            { value: 'all', label: 'Tất cả' },
                            { value: 'new', label: 'Khách hàng mới' },
                            { value: 'old', label: 'Khách hàng cũ' },
                        ]}
                        value={customerTypeFilter}
                        onChange={setCustomerTypeFilter}
                    />
                    <Listbox
                        label="Loại lịch hẹn"
                        options={[
                            { value: 'all', label: 'Tất cả' },
                            { value: 'completed', label: 'Hoàn thành' },
                            { value: 'pending', label: 'Chờ xử lý' },
                            { value: 'cancelled', label: 'Đã hủy' },
                        ]}
                        value={appointmentTypeFilter}
                        onChange={setAppointmentTypeFilter}
                    />
                    
                    <div>
                        <label className="block mb-2 text-sm text-muted-foreground">Từ ngày</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>
                    <div>
                        <label className="block mb-2 text-sm text-muted-foreground">Đến ngày</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>
                    <Listbox
                        label="Loại hội thoại"
                        options={[
                            { value: 'all', label: 'Tất cả hội thoại' },
                            { value: 'lead', label: 'Lead' },
                            { value: 'not_lead', label: 'Not lead' },
                        ]}
                        value={conversationTypeFilter}
                        onChange={setConversationTypeFilter}
                    />
                </CardContent>
            </Card>

            {/* Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                <StatCard
                    title="Tổng số khách hàng"
                    value={stats.totalCustomers}
                    icon={Users}
                    color="#6366f1"
                />
                <StatCard
                    title="Tổng số lịch hẹn"
                    value={stats.totalAppointments}
                    icon={Calendar}
                    color="#10b981"
                />
            </div>

            {/* Tables */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Table Khách hàng */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm">Khách hàng</CardTitle>
                        <button
                            type="button"
                            onClick={() => handleDownload('customers')}
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </CardHeader>
                    <CardContent>
                        <div
                            className="max-h-[400px] overflow-y-auto"
                            onScroll={(e) => handleScrollLoadMore(e, 'customers')}
                        >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-xs">Tên</TableHead>
                                        <TableHead className="text-xs">SĐT</TableHead>
                                        <TableHead className="text-xs">Nguồn</TableHead>
                                        <TableHead className="text-xs">Dịch vụ sử dụng</TableHead>
                                        <TableHead className="text-xs text-right">Số lượng đơn</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tableData.customers.map((c) => {
                                        const customerServices = getCustomerServices(c);
                                        const orderCount = getCustomerOrderCount(c);
                                        return (
                                            <TableRow key={c._id}>
                                                <TableCell className="text-xs">{c.name || '—'}</TableCell>
                                                <TableCell className="text-xs">{c.phone || '—'}</TableCell>
                                                <TableCell className="text-xs">
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {getCustomerSourceName(c)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {customerServices.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {customerServices.map((serviceName, idx) => (
                                                                <Badge key={idx} variant="secondary" className="text-[10px]">
                                                                    {serviceName}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs text-right">
                                                    <Badge variant={orderCount > 0 ? "default" : "secondary"} className="text-[10px]">
                                                        {orderCount}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Table Lịch hẹn */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm">Lịch hẹn</CardTitle>
                        <button
                            type="button"
                            onClick={() => handleDownload('appointments')}
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </CardHeader>
                    <CardContent>
                        <div
                            className="max-h-[400px] overflow-y-auto"
                            onScroll={(e) => handleScrollLoadMore(e, 'appointments')}
                        >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-xs">Tiêu đề</TableHead>
                                        <TableHead className="text-xs">Tên khách hàng</TableHead>
                                        <TableHead className="text-xs">Loại khách hàng</TableHead>
                                        <TableHead className="text-xs">Trạng thái</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tableData.appointments.map((a) => {
                                        const customerType = getCustomerType(a.customer);
                                        return (
                                            <TableRow key={a._id}>
                                                <TableCell className="text-xs">{a.title || '—'}</TableCell>
                                                <TableCell className="text-xs">{a.customer?.name || '—'}</TableCell>
                                                <TableCell className="text-xs">
                                                    <Badge 
                                                        variant={customerType === 'Khách cũ' ? 'default' : 'secondary'}
                                                        className="text-[10px]"
                                                    >
                                                        {customerType}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    <Badge variant={getAppointmentStatusVariant(a.status)}>
                                                        {getAppointmentStatusText(a.status)}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Table Dịch vụ */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm">Dịch vụ</CardTitle>
                        <button
                            type="button"
                            onClick={() => handleDownload('services')}
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </CardHeader>
                    <CardContent>
                        <div
                            className="max-h-[400px] overflow-y-auto"
                            onScroll={(e) => handleScrollLoadMore(e, 'services')}
                        >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-xs">Tên</TableHead>
                                        <TableHead className="text-xs">Giá(Tổng các liệu trình)</TableHead>
                                        <TableHead className="text-xs text-right">Số lượng người quan tâm</TableHead>
                                        <TableHead className="text-xs text-right">Số lượng người sử dụng</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tableData.services.map((s) => (
                                        <TableRow key={s._id}>
                                            <TableCell className="text-xs">{s.name || '—'}</TableCell>
                                            <TableCell className="text-xs">
                                                <div className="inline-flex items-center gap-2">
                                                    {/* <DollarSign className="w-4 h-4" style={{ color: 'var(--primary)' }} /> */}
                                                    <span className="font-medium">{formatCurrency(s.totalBasePrice || 0)}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-right">
                                                <Badge variant="secondary" className="text-[10px]">
                                                    {s.interestedCount || 0}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-right">
                                                <Badge variant="default" className="text-[10px]">
                                                    {s.usedCount || 0}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Table Hội thoại tin nhắn */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm">Hội thoại tin nhắn</CardTitle>
                        <button
                            type="button"
                            onClick={() => handleDownload('conversations')}
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </CardHeader>
                    <CardContent>
                        <div
                            className="max-h-[400px] overflow-y-auto"
                            onScroll={(e) => handleScrollLoadMore(e, 'conversations')}
                        >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-xs">Tên khách hàng</TableHead>
                                        <TableHead className="text-xs">Nguồn</TableHead>
                                        <TableHead className="text-xs text-right">Trạng thái</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tableData.conversations && tableData.conversations.length > 0 ? (
                                        tableData.conversations.map((conv, idx) => {
                                            const statusLabel = conv.status === 'LEAD' ? 'Lead' : 'Not lead';
                                            const statusVariant = conv.status === 'LEAD' ? 'default' : 'secondary';
                                            return (
                                                <TableRow key={conv._id ?? idx}>
                                                    <TableCell className="text-xs">{conv.name || '—'}</TableCell>
                                                    <TableCell className="text-xs">
                                                        {conv.pageDisplayName || '—'}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-right">
                                                        <Badge variant={statusVariant} className="text-[10px]">
                                                            {statusLabel}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-8">
                                                Không có hội thoại nào
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

