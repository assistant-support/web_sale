'use client';

import { useMemo, useState, useEffect, useRef, useCallback, memo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import Popup from '@/components/ui/popup';
import {
    DollarSign, ShoppingCart, UserCheck, Percent, History, Check, X, UserCog, PiggyBank,
    Eye, LineChart, RefreshCw, ChevronDown
} from 'lucide-react';

import {
    approveServiceDealAction,
    rejectServiceDealAction
} from '@/data/customers/wraperdata.db';
import { driveImage } from '@/function';
import { useActionFeedback } from '@/hooks/useAction';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/* ======================= YearlyRevenueChart Component (tách ra ngoài) ======================= */
// Tách component ra ngoài để tránh re-create mỗi lần parent re-render
const YearlyRevenueChart = memo(({ data }) => {
    const fmtVND = (n = 0) => (Number(n) || 0).toLocaleString('vi-VN') + ' đ';
    
    // Memoize options để tránh tạo lại mỗi lần render
    const options = useMemo(() => {
        const values = Array.isArray(data?.datasets?.[0]?.data) ? data.datasets[0].data : [];
        const maxVal = values.length ? Math.max(...values.map(v => Number(v) || 0)) : 0;
        const noData = !values.length || maxVal === 0;

        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Biểu đồ Doanh thu theo Năm', font: { size: 18 } },
                tooltip: { callbacks: { label: ctx => fmtVND(ctx.parsed.y) } }
            },
            scales: {
                y: {
                    suggestedMin: 0,
                    suggestedMax: noData ? 1_000_000 : undefined,
                    ticks: {
                        stepSize: noData ? 1_000_000 : undefined,
                        callback: (v) => (v / 1_000_000) + 'tr'
                    }
                }
            }
        };
    }, [data]);
    
    return <Bar data={data} options={options} />;
}, (prevProps, nextProps) => {
    // Custom comparison: chỉ re-render khi data thực sự thay đổi
    const prevData = prevProps.data;
    const nextData = nextProps.data;
    
    if (!prevData || !nextData) return prevData === nextData;
    
    // So sánh labels và data
    const prevLabels = prevData.labels || [];
    const nextLabels = nextData.labels || [];
    if (prevLabels.length !== nextLabels.length) return false;
    if (prevLabels.some((label, i) => label !== nextLabels[i])) return false;
    
    const prevValues = prevData.datasets?.[0]?.data || [];
    const nextValues = nextData.datasets?.[0]?.data || [];
    if (prevValues.length !== nextValues.length) return false;
    if (prevValues.some((val, i) => val !== nextValues[i])) return false;
    
    return true; // Không có thay đổi, không cần re-render
});

YearlyRevenueChart.displayName = 'YearlyRevenueChart';

/* ======================= Listbox (Dropdown) ======================= */
function Listbox({ label, options, value, onChange, placeholder = 'Chọn...', buttonClassName = '' }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const listRef = useRef(null);

    const current = useMemo(
        () => options.find(o => o.value === value) || { label: placeholder, value: undefined },
        [options, value, placeholder]
    );

    useEffect(() => {
        function onClickOutside(e) {
            if (!open) return;
            const t = e.target;
            if (btnRef.current && btnRef.current.contains(t)) return;
            if (listRef.current && listRef.current.contains(t)) return;
            setOpen(false);
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    const [active, setActive] = useState(-1);
    const handleKeyDown = (e) => {
        if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            setOpen(true);
            setActive(Math.max(0, options.findIndex(o => o.value === value)));
            return;
        }
        if (!open) return;
        if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(prev => (prev + 1) % options.length); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(prev => (prev - 1 + options.length) % options.length); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            const opt = options[active] || options.find(o => o.value === value);
            if (opt) onChange(opt.value);
            setOpen(false);
        }
    };

    return (
        <div className="w-full">
            {label && <label className="block mb-2 text-xs text-muted-foreground">{label}</label>}
            <div className="relative" onKeyDown={handleKeyDown}>
                <button
                    ref={btnRef}
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    onClick={() => setOpen(v => !v)}
                    className={`inline-flex w-full items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-xs ${buttonClassName}`}
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                >
                    <span className="truncate">{current.label}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                    <ul
                        ref={listRef}
                        role="listbox"
                        tabIndex={-1}
                        className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-[6px] border bg-white shadow-sm"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        {options.map((opt, idx) => {
                            const selected = opt.value === value;
                            const isActive = idx === active;
                            return (
                                <li
                                    key={opt.value ?? `opt-${idx}`}
                                    role="option"
                                    aria-selected={selected}
                                    onMouseEnter={() => setActive(idx)}
                                    onClick={() => { onChange(opt.value); setOpen(false); }}
                                    className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer ${isActive ? 'bg-muted' : 'bg-white'} ${selected ? 'font-medium' : ''}`}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    {selected && <Check className="w-4 h-4" />}
                                </li>
                            );
                        })}
                        {options.length === 0 && (
                            <li className="px-3 py-2 text-xs text-muted-foreground">Không có tùy chọn</li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
}

/* ================== Component ================== */
export default function DashboardClient({ 
    initialData = [], 
    users = [], 
    discountPrograms = [],
    services = [],
    sources = [],
    messageSources = []
}) {
    /* ===== Helpers đặt TRONG component như yêu cầu ===== */
    const { openDetails, setOpenDetails, detailsRow, setDetailsRow } = useDetailsState();
    const fmtVND = (n = 0) => (Number(n) || 0).toLocaleString('vi-VN') + ' đ';

    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    const startOfWeek = (d) => { const x = startOfDay(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; };
    const endOfWeek = (d) => { const x = startOfWeek(d); x.setDate(x.getDate() + 6); return endOfDay(x); };
    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = (d) => endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const getQuarter = (d) => Math.floor(d.getMonth() / 3) + 1;
    const startOfQuarter = (d) => new Date(d.getFullYear(), (getQuarter(d) - 1) * 3, 1);
    const endOfQuarter = (d) => endOfDay(new Date(d.getFullYear(), (getQuarter(d) - 1) * 3 + 3, 0));
    const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
    const endOfYear = (d) => endOfDay(new Date(d.getFullYear(), 11, 31));
    const toYMD = (d) => { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; };

    // Đọc pricing an toàn
    const readPricing = (detail = {}) => {
        const p = detail?.pricing || {};
        const discountType = ['none', 'amount', 'percent'].includes(p.discountType) ? p.discountType : 'none';
        return {
            listPrice: Number(p.listPrice) || 0,
            discountType,
            discountValue: Number(p.discountValue) || 0,
            finalPrice: Number(p.finalPrice) || 0,
        };
    };

    const discountLabel = ({ discountType, discountValue }) => {
        if (discountType === 'amount') return fmtVND(discountValue);
        if (discountType === 'percent') return `${discountValue}%`;
        return '0';
    };

    // Lấy “ngày đơn” để lọc/thống kê
    const resolveDetailDate = (row) => {
        const d = row?.detail || {};
        if (d.approvedAt) return new Date(d.approvedAt);
        if (d.closedAt) return new Date(d.closedAt);
        const logs = Array.isArray(row?.care) ? row.care : [];
        const step6 = logs
            .filter(n => n?.step === 6 || String(n?.content || '').includes('[Chốt dịch vụ]'))
            .sort((a, b) => new Date(b.createAt) - new Date(a.createAt))[0];
        return step6?.createAt ? new Date(step6.createAt) : null;
    };

    const nameFromUserId = (id, userMap) => {
        if (!id) return '—';
        const found = userMap.get(String(id));
        return found?.name || (typeof id === 'string' ? `User (${id.slice(-6)})` : 'NV');
    };

    const namesFromAssignees = (assignees = [], userMap) => {
        if (!Array.isArray(assignees) || assignees.length === 0) return '—';
        return assignees.map(a => {
            const u = a?.user;
            if (!u) return 'NV';
            if (typeof u === 'object' && u?._id) return u?.name || nameFromUserId(u._id, userMap);
            return nameFromUserId(u, userMap);
        }).join(', ');
    };

    // Helper để lấy tên nguồn từ sourceId
    const getSourceName = (sourceId) => {
        if (!sourceId) return '—';
        const allSources = [...(sources || []), ...(messageSources || [])];
        const sourceIdStr = typeof sourceId === 'object' ? String(sourceId._id || sourceId) : String(sourceId);
        const found = allSources.find(s => String(s._id) === sourceIdStr);
        return found?.name || '—';
    };

    // Helper để lấy tên dịch vụ từ serviceId hoặc selectedService
    const getServiceName = (serviceIdOrService) => {
        if (!serviceIdOrService) return '—';
        const serviceIdStr = typeof serviceIdOrService === 'object' 
            ? String(serviceIdOrService._id || serviceIdOrService) 
            : String(serviceIdOrService);
        const found = (services || []).find(s => String(s._id) === serviceIdStr);
        return found?.name || '—';
    };

    /* ---------- User map ---------- */
    const userMap = useMemo(() => {
        const m = new Map();
        for (const u of Array.isArray(users) ? users : []) m.set(String(u._id), u);
        return m;
    }, [users]);

    /* ---------- Filter Range ---------- */
    // Mặc định hiển thị theo tháng hiện tại (từ đầu tháng đến hôm nay)
    const now = new Date();
    const [rangePreset, setRangePreset] = useState('this_month');
    const [startDate, setStartDate] = useState(() => toYMD(startOfMonth(now)));
    const [endDate, setEndDate] = useState(() => toYMD(now));
    
    /* ---------- Filter Source & Service ---------- */
    const [sourceFilter, setSourceFilter] = useState('all');
    const [serviceFilter, setServiceFilter] = useState('all');
    
    // Tạo options cho source filter (kết hợp sources và messageSources)
    const sourceOptions = useMemo(() => {
        const options = [{ value: 'all', label: 'Tất cả nguồn' }];
        const allSources = [...(sources || []), ...(messageSources || [])];
        allSources.forEach(s => {
            options.push({ value: String(s._id), label: s.name || 'Nguồn không tên' });
        });
        return options;
    }, [sources, messageSources]);
    
    // Tạo options cho service filter
    const serviceOptions = useMemo(() => {
        const options = [{ value: 'all', label: 'Tất cả dịch vụ' }];
        (services || []).forEach(s => {
            options.push({ value: String(s._id), label: s.name || 'Dịch vụ không tên' });
        });
        return options;
    }, [services]);

    const { rangeStart, rangeEnd } = useMemo(() => {
        // Luôn ưu tiên sử dụng startDate và endDate từ input nếu có
        if (startDate && endDate) {
            try {
                // Đảm bảo parse đúng format YYYY-MM-DD
                const s = startOfDay(new Date(startDate + 'T00:00:00'));
                const e = endOfDay(new Date(endDate + 'T23:59:59.999'));
                // Kiểm tra tính hợp lệ của date
                if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
                    return { rangeStart: s, rangeEnd: e };
                }
            } catch (err) {
                console.error('Error parsing dates:', err);
            }
        }
        
        // Fallback: sử dụng preset nếu không có date hoặc date không hợp lệ
        const now = new Date();
        switch (rangePreset) {
            case 'this_week': return { rangeStart: startOfWeek(now), rangeEnd: endOfWeek(now) };
            case 'last_7': { const e = endOfDay(now); const s = new Date(e); s.setDate(s.getDate() - 6); return { rangeStart: startOfDay(s), rangeEnd: e }; }
            case 'this_month': return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
            case 'last_30': { const e = endOfDay(now); const s = new Date(e); s.setDate(s.getDate() - 29); return { rangeStart: startOfDay(s), rangeEnd: e }; }
            case 'this_quarter': return { rangeStart: startOfQuarter(now), rangeEnd: endOfQuarter(now) };
            case 'this_year': return { rangeStart: startOfYear(now), rangeEnd: endOfYear(now) };
            case 'custom': {
                // Nếu là custom nhưng chưa có date hợp lệ, sử dụng giá trị mặc định
                return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
            }
            default: return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
        }
    }, [rangePreset, startDate, endDate]);

    /* ---------- Chuẩn hoá dữ liệu ---------- */
    const allRows = useMemo(() => {
        const list = Array.isArray(initialData) ? initialData : [];
        const rows = [];
        for (const c of list) {
            const details = Array.isArray(c.serviceDetails)
                ? c.serviceDetails
                : (c.serviceDetails ? [c.serviceDetails] : []);
            for (const d of details) {
                rows.push({
                    customerId: c._id,
                    name: c.name,
                    phone: c.phone,
                    assignees: c.assignees,
                    tags: c.tags,
                    care: c.care,
                    detail: d,
                });
            }
        }
        return rows;
    }, [initialData]);

    /* ---------- Pending Approvals với filter thời gian và pagination ---------- */
    const [pendingApprovalsFromAPI, setPendingApprovalsFromAPI] = useState([]);
    const [loadingPending, setLoadingPending] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const [pendingSkip, setPendingSkip] = useState(0);
    const [pendingTotal, setPendingTotal] = useState(0);
    const [loadingMorePending, setLoadingMorePending] = useState(false);
    const pendingScrollRef = useRef(null);
    
    // Fetch pendingApprovals từ API
    // Quy tắc: danh sách cần duyệt KHÔNG bị giới hạn bởi bộ lọc thời gian,
    // mặc định luôn lấy tất cả đơn ở trạng thái pending.
    // Chỉ áp dụng filter theo nguồn/dịch vụ nếu người dùng chọn.
    const fetchPendingApprovals = useCallback(async (skip = 0, append = false) => {
        try {
            if (skip === 0) {
                setLoadingPending(true);
                setHasFetched(false);
            } else {
                setLoadingMorePending(true);
            }
            
            const params = new URLSearchParams();
            
            // Áp dụng filter nguồn/dịch vụ nếu có
            if (sourceFilter && sourceFilter !== 'all') {
                params.append('sourceId', sourceFilter);
            }
            if (serviceFilter && serviceFilter !== 'all') {
                params.append('serviceId', serviceFilter);
            }
            params.append('limit', '10');
            params.append('skip', String(skip));
            
            const response = await fetch(`/api/service-details/pending?${params.toString()}`);
            const result = await response.json();
            
            if (result.success && Array.isArray(result.data)) {
                if (append) {
                    setPendingApprovalsFromAPI(prev => [...prev, ...result.data]);
                } else {
                    setPendingApprovalsFromAPI(result.data);
                }
                setPendingTotal(result.total || 0);
                setPendingSkip(skip + result.data.length);
                setHasFetched(true);
            } else {
                console.warn('API failed, using fallback logic');
                if (!append) {
                    setPendingApprovalsFromAPI([]);
                    setPendingTotal(0);
                }
                setHasFetched(true);
            }
        } catch (error) {
            console.error('Error fetching pending approvals:', error);
            if (!append) {
                setPendingApprovalsFromAPI([]);
                setPendingTotal(0);
            }
            setHasFetched(true);
        } finally {
            setLoadingPending(false);
            setLoadingMorePending(false);
        }
    }, [startDate, endDate, sourceFilter, serviceFilter]);
    
    // Reset và fetch từ đầu khi filter thay đổi
    useEffect(() => {
        setPendingSkip(0);
        fetchPendingApprovals(0, false);
    }, [fetchPendingApprovals]);
    
    // Load more pending approvals
    const loadMorePending = useCallback(() => {
        if (!loadingMorePending && !loadingPending && pendingSkip < pendingTotal) {
            fetchPendingApprovals(pendingSkip, true);
        }
    }, [pendingSkip, pendingTotal, loadingMorePending, loadingPending, fetchPendingApprovals]);
    
    // Infinite scroll cho pending approvals
    useEffect(() => {
        const scrollContainer = pendingScrollRef.current;
        if (!scrollContainer) return;
        
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
            // Khi scroll đến nửa đường (50%)
            if (scrollTop + clientHeight >= scrollHeight * 0.5) {
                loadMorePending();
            }
        };
        
        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, [loadMorePending]);
    
    // Sử dụng dữ liệu từ API nếu có, nếu không thì fallback về logic cũ (có filter thời gian)
    const pendingApprovals = useMemo(() => {
        // Nếu đã fetch xong từ API, sử dụng kết quả (kể cả mảng rỗng)
        // Chỉ fallback khi chưa fetch được (lần đầu mount hoặc đang loading)
        if (hasFetched) {
            return pendingApprovalsFromAPI;
        }
        
        // Fallback: sử dụng logic cũ từ allRows, KHÔNG filter theo thời gian
        // Chỉ dùng khi chưa fetch được từ API hoặc API lỗi
        const filtered = allRows.filter(r => {
            if (r.detail?.approvalStatus !== 'pending') return false;
            return true;
        });
        
        return filtered;
    }, [pendingApprovalsFromAPI, allRows, hasFetched, startDate, endDate]);

    /* ---------- Approved Deals với filter và pagination ---------- */
    const [approvedDealsFromAPI, setApprovedDealsFromAPI] = useState([]);
    const [loadingApproved, setLoadingApproved] = useState(false);
    const [hasFetchedApproved, setHasFetchedApproved] = useState(false);
    const [approvedSkip, setApprovedSkip] = useState(0);
    const [approvedTotal, setApprovedTotal] = useState(0);
    const [loadingMoreApproved, setLoadingMoreApproved] = useState(false);
    const approvedScrollRef = useRef(null);
    
    // Fetch approvedDeals từ API với filter thời gian, nguồn và dịch vụ
    // Logic: Nếu có filter nguồn/dịch vụ → ưu tiên filter đó, bỏ qua filter thời gian
    // Nếu không có filter nguồn/dịch vụ → ưu tiên filter thời gian
    const fetchApprovedDeals = useCallback(async (skip = 0, append = false) => {
        try {
            if (skip === 0) {
                setLoadingApproved(true);
                setHasFetchedApproved(false);
            } else {
                setLoadingMoreApproved(true);
            }
            
            const params = new URLSearchParams();
            
            // Kiểm tra xem có filter nguồn/dịch vụ không
            const hasSourceOrServiceFilter = (sourceFilter && sourceFilter !== 'all') || (serviceFilter && serviceFilter !== 'all');
            
            // Chỉ áp dụng filter thời gian khi KHÔNG có filter nguồn/dịch vụ
            if (!hasSourceOrServiceFilter) {
                if (startDate) {
                    params.append('fromDate', startDate);
                }
                if (endDate) {
                    params.append('toDate', endDate);
                }
            }
            
            // Luôn áp dụng filter nguồn/dịch vụ nếu có
            if (sourceFilter && sourceFilter !== 'all') {
                params.append('sourceId', sourceFilter);
            }
            if (serviceFilter && serviceFilter !== 'all') {
                params.append('serviceId', serviceFilter);
            }
            params.append('limit', '10');
            params.append('skip', String(skip));
            
            const response = await fetch(`/api/service-details/approved?${params.toString()}`);
            const result = await response.json();
            
            if (result.success && Array.isArray(result.data)) {
                // Transform data để có __dealDate và __dealDateObj
                const transformed = result.data.map(r => {
                    const dealDate = r.detail?.closedAt 
                        ? new Date(r.detail.closedAt) 
                        : (r.detail?.approvedAt ? new Date(r.detail.approvedAt) : null);
                    return {
                        ...r,
                        __dealDate: dealDate ? dealDate.toISOString() : null,
                        __dealDateObj: dealDate
                    };
                });
                
                if (append) {
                    setApprovedDealsFromAPI(prev => [...prev, ...transformed]);
                } else {
                    setApprovedDealsFromAPI(transformed);
                }
                setApprovedTotal(result.total || 0);
                setApprovedSkip(skip + result.data.length);
                setHasFetchedApproved(true);
            } else {
                console.warn('API failed for approved deals, using fallback logic');
                if (!append) {
                    setApprovedDealsFromAPI([]);
                    setApprovedTotal(0);
                }
                setHasFetchedApproved(true);
            }
        } catch (error) {
            console.error('Error fetching approved deals:', error);
            if (!append) {
                setApprovedDealsFromAPI([]);
                setApprovedTotal(0);
            }
            setHasFetchedApproved(true);
        } finally {
            setLoadingApproved(false);
            setLoadingMoreApproved(false);
        }
    }, [startDate, endDate, sourceFilter, serviceFilter]);
    
    // Reset và fetch từ đầu khi filter thay đổi
    useEffect(() => {
        setApprovedSkip(0);
        fetchApprovedDeals(0, false);
    }, [fetchApprovedDeals]);
    
    // Load more approved deals
    const loadMoreApproved = useCallback(() => {
        if (!loadingMoreApproved && !loadingApproved && approvedSkip < approvedTotal) {
            fetchApprovedDeals(approvedSkip, true);
        }
    }, [approvedSkip, approvedTotal, loadingMoreApproved, loadingApproved, fetchApprovedDeals]);
    
    // Infinite scroll cho approved deals
    useEffect(() => {
        const scrollContainer = approvedScrollRef.current;
        if (!scrollContainer) return;
        
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
            // Khi scroll đến nửa đường (50%)
            if (scrollTop + clientHeight >= scrollHeight * 0.5) {
                loadMoreApproved();
            }
        };
        
        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, [loadMoreApproved]);
    
    // Sử dụng dữ liệu từ API nếu có, nếu không thì fallback về logic cũ
    const approvedDeals = useMemo(() => {
        if (hasFetchedApproved) {
            return approvedDealsFromAPI;
        }
        
        // Fallback: sử dụng logic cũ từ allRows
        return allRows
            .filter(r => r.detail?.approvalStatus === 'approved')
            .map(r => {
                const dealDate = resolveDetailDate(r);
                return { 
                    ...r, 
                    __dealDate: dealDate ? dealDate.toISOString() : null,
                    __dealDateObj: dealDate
                };
            })
            .filter(r => {
                if (!r.__dealDateObj) return false;
                const dealDate = r.__dealDateObj;
                return dealDate >= rangeStart && dealDate <= rangeEnd;
            });
    }, [approvedDealsFromAPI, allRows, hasFetchedApproved, rangeStart, rangeEnd]);

    /* ---------- Fetch report_daily data ---------- */
    const [reportDailyData, setReportDailyData] = useState(null);
    const [loadingReportDaily, setLoadingReportDaily] = useState(false);
    
    // Fetch report_daily function - export để dùng ở nơi khác
    const fetchReportDaily = useCallback(async () => {
        try {
            setLoadingReportDaily(true);
            const params = new URLSearchParams();
            if (startDate) params.append('fromDate', startDate);
            if (endDate) params.append('toDate', endDate);
            
            const response = await fetch(`/api/report-daily?${params.toString()}`);
            const result = await response.json();
            
            if (result.success) {
                setReportDailyData(result);
            } else {
                console.error('Error fetching report_daily:', result.error);
                setReportDailyData(null);
            }
        } catch (error) {
            console.error('Error fetching report_daily:', error);
            setReportDailyData(null);
        } finally {
            setLoadingReportDaily(false);
        }
    }, [startDate, endDate]);
    
    // Fetch report_daily khi filter thay đổi
    useEffect(() => {
        fetchReportDaily();
    }, [fetchReportDaily]);

    /* ---------- Stats từ report_daily ---------- */
    const stats = useMemo(() => {
        // Ưu tiên dùng report_daily nếu có
        if (reportDailyData?.totals) {
            const totals = reportDailyData.totals;
            const totalDeals = totals.total_completed_orders || 0;
            const totalRevenueNum = totals.total_revenue || 0;
            const avgRevenueNum = totalDeals > 0 ? totalRevenueNum / totalDeals : 0;
            
            return {
                totalDeals,
                totalRevenue: fmtVND(totalRevenueNum),
                avgRevenue: fmtVND(avgRevenueNum),
            };
        }
        
        // Fallback về logic cũ nếu chưa có report_daily
        const totalDeals = approvedDeals.length;
        const totalRevenueNum = approvedDeals.reduce((s, r) => s + (Number(r?.detail?.revenue) || 0), 0);
        const avgRevenueNum = totalDeals ? totalRevenueNum / totalDeals : 0;
        return {
            totalDeals,
            totalRevenue: fmtVND(totalRevenueNum),
            avgRevenue: fmtVND(avgRevenueNum),
        };
    }, [reportDailyData, approvedDeals]);

    /* ---------- Top Commissions (đã duyệt) - Fetch tất cả đơn đã duyệt để tính hoa hồng ---------- */
    const [allApprovedForCommissions, setAllApprovedForCommissions] = useState([]);
    const [loadingCommissions, setLoadingCommissions] = useState(false);
    
    // Fetch tất cả đơn đã duyệt (không filter) để tính hoa hồng chính xác
    useEffect(() => {
        const fetchAllApprovedForCommissions = async () => {
            try {
                setLoadingCommissions(true);
                // Fetch với limit lớn để lấy tất cả đơn đã duyệt (hoặc ít nhất là 1000 đơn gần nhất)
                const response = await fetch('/api/service-details/approved?limit=1000&skip=0');
                const result = await response.json();
                
                if (result.success && Array.isArray(result.data)) {
                    setAllApprovedForCommissions(result.data);
                } else {
                    // Fallback về allRows nếu API fail
                    const fallback = allRows.filter(r => r.detail?.approvalStatus === 'approved');
                    setAllApprovedForCommissions(fallback);
                }
            } catch (error) {
                console.error('Error fetching all approved for commissions:', error);
                // Fallback về allRows nếu có lỗi
                const fallback = allRows.filter(r => r.detail?.approvalStatus === 'approved');
                setAllApprovedForCommissions(fallback);
            } finally {
                setLoadingCommissions(false);
            }
        };
        
        fetchAllApprovedForCommissions();
    }, []); // Chỉ fetch một lần khi mount
    
    const topCommissions = useMemo(() => {
        const map = new Map(); // userId -> totalAmount
        
        // Sử dụng allApprovedForCommissions (từ API với đầy đủ dữ liệu từ service_details collection)
        // Nếu chưa fetch được, fallback về allRows
        const dataSource = allApprovedForCommissions.length > 0 
            ? allApprovedForCommissions 
            : allRows.filter(r => r.detail?.approvalStatus === 'approved');
        
        for (const r of dataSource) {
            const revBase = Number(r?.detail?.revenue || r?.detail?.pricing?.finalPrice || 0);
            const arr = Array.isArray(r?.detail?.commissions) ? r.detail.commissions : [];
            for (const it of arr) {
                if (!it?.user) continue;
                // Tính hoa hồng: ưu tiên amount, nếu không có thì tính từ percent
                const amount = Number(it.amount) || ((Number(it.percent) || 0) / 100) * revBase;
                const key = String((typeof it.user === 'object' && it.user?._id) ? it.user._id : it.user);
                map.set(key, (map.get(key) || 0) + amount);
            }
        }
        const rows = Array.from(map.entries()).map(([user, total]) => ({ user, total }));
        rows.sort((a, b) => b.total - a.total);
        return rows.slice(0, 5);
    }, [allApprovedForCommissions, allRows]);

    /* ---------- Fetch yearly data từ report_daily (tất cả năm, không filter) ---------- */
    const [yearlyReportData, setYearlyReportData] = useState(null);
    const [loadingYearly, setLoadingYearly] = useState(false);
    const [yearlyDataInitialized, setYearlyDataInitialized] = useState(false);
    
    // Fetch tất cả dữ liệu năm từ report_daily (không filter theo tháng) - chỉ 1 lần khi mount
    useEffect(() => {
        if (yearlyDataInitialized) return; // Đã fetch rồi, không fetch lại
        
        const fetchYearlyData = async () => {
            try {
                setLoadingYearly(true);
                // Fetch tất cả dữ liệu, không filter theo tháng
                const response = await fetch('/api/report-daily');
                const result = await response.json();
                
                if (result.success && result.data) {
                    setYearlyReportData(result.data);
                } else {
                    setYearlyReportData([]);
                }
                setYearlyDataInitialized(true);
            } catch (error) {
                console.error('Error fetching yearly report_daily:', error);
                setYearlyReportData([]);
                setYearlyDataInitialized(true);
            } finally {
                setLoadingYearly(false);
            }
        };
        
        fetchYearlyData();
    }, [yearlyDataInitialized]); // Chỉ fetch một lần khi mount

    /* ---------- Yearly Revenue (chart) từ report_daily ---------- */
    // Tạo stable key để so sánh thay đổi - chỉ tính lại khi dữ liệu thực sự thay đổi
    const yearlyDataKey = useMemo(() => {
        if (!yearlyReportData || !Array.isArray(yearlyReportData) || yearlyReportData.length === 0) {
            return 'empty';
        }
        // Tạo key từ dữ liệu để so sánh - chỉ dùng date và revenue
        return yearlyReportData
            .map(r => {
                const dateStr = r.date ? (typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().split('T')[0]) : '';
                return `${dateStr}_${r.total_revenue || 0}`;
            })
            .sort()
            .join('|');
    }, [yearlyReportData]);
    
    // Chỉ dùng yearlyReportData (tất cả năm), KHÔNG dùng reportDailyData vì nó thay đổi khi filter tháng
    const yearlyChartData = useMemo(() => {
        const dataSource = yearlyReportData && Array.isArray(yearlyReportData) && yearlyReportData.length > 0
            ? yearlyReportData
            : [];
        
        if (dataSource.length === 0) {
            // Nếu không có dữ liệu, trả về chart rỗng
            const y = new Date().getFullYear();
            return {
                labels: [String(y)],
                datasets: [{
                    label: 'Doanh thu',
                    data: [0],
                    backgroundColor: 'rgba(22, 163, 74, 0.7)',
                    borderColor: 'rgba(21, 128, 61, 1)',
                    borderWidth: 1
                }]
            };
        }
        
        const byYear = new Map(); // year -> sum revenue
        
        for (const r of dataSource) {
            if (!r.date) continue;
            const dt = new Date(r.date);
            if (Number.isNaN(dt.getTime())) continue;
            
            const year = dt.getFullYear();
            const rev = Number(r.total_revenue || 0) || 0;
            if (rev <= 0) continue;
            
            byYear.set(year, (byYear.get(year) || 0) + rev);
        }
        
        let years = Array.from(byYear.keys()).sort((a, b) => a - b);
        let values = years.map(y => byYear.get(y));
        
        if (years.length === 0) {
            const y = new Date().getFullYear();
            years = [y];
            values = [0];
        }
        
        return {
            labels: years.map(String),
            datasets: [{
                label: 'Doanh thu',
                data: values,
                backgroundColor: 'rgba(22, 163, 74, 0.7)',
                borderColor: 'rgba(21, 128, 61, 1)',
                borderWidth: 1
            }]
        };
    }, [yearlyDataKey]); // CHỈ depend vào key, tránh tính lại không cần thiết

    /* ---------- Approve / Reject Popup ---------- */
    const [openApprove, setOpenApprove] = useState(false);
    const [selected, setSelected] = useState(null);
    const [selectedDiscountProgram, setSelectedDiscountProgram] = useState('');
    const [form, setForm] = useState({
        listPrice: '',
        discountType: 'none',
        discountValue: '',
        revenue: '',
        commissions: [{ user: '', role: 'sale', mode: 'percent', percent: '', amount: '' }],
        notes: ''
    });

    const { run } = useActionFeedback();

    // ✅ NẠP GIÁ ĐÚNG TỪ pricing hiện có (không ép = revenue)
    const openApproveFor = (row) => {
        setSelected(row);
        const d = row?.detail || {};
        const p = readPricing(d);

        const preparedCommissions = (d?.commissions?.length
            ? d.commissions
            : [{ user: (row.assignees?.[0]?.user?._id || row.assignees?.[0]?.user || ''), role: 'sale', percent: '', amount: '' }]
        ).map(x => {
            const uid = String((typeof x.user === 'object' && x.user?._id) ? x.user._id : x.user || '');
            const amt = Number(x.amount) || 0;
            const pct = Number(x.percent) || 0;
            const mode = amt > 0 ? 'amount' : 'percent';
            return { user: uid, role: x.role || 'sale', mode, percent: mode === 'percent' ? pct : '', amount: mode === 'amount' ? amt : '' };
        });

        // ✅ Revenue: Ưu tiên revenue hiện có, nhưng nếu revenue = listPrice (giá gốc) thì dùng finalPrice (giá sau giảm)
        // Điều này đảm bảo luôn dùng giá sau giảm, không dùng giá gốc
        let revenueValue = d.revenue ?? p.finalPrice ?? p.listPrice ?? '';
        // Nếu revenue = listPrice (có thể là giá gốc cũ), thì dùng finalPrice thay thế
        if (Number(revenueValue) === Number(p.listPrice) && Number(p.finalPrice) > 0 && Number(p.finalPrice) !== Number(p.listPrice)) {
            revenueValue = p.finalPrice;
        }
        
        setForm({
            listPrice: p.listPrice || d.revenue || '',
            discountType: p.discountType || 'none',
            discountValue: p.discountValue || '',
            revenue: revenueValue,
            commissions: preparedCommissions.length ? preparedCommissions : [{ user: '', role: 'sale', mode: 'percent', percent: '', amount: '' }],
            notes: d.notes || ''
        });
        setSelectedDiscountProgram('');

        setOpenApprove(true);
    };

    const calcFinalPrice = () => {
        const lp = Number(form.listPrice) || 0;
        const dv = Number(form.discountValue) || 0;
        if (form.discountType === 'percent') return Math.max(0, Math.round(lp * (1 - dv / 100)));
        if (form.discountType === 'amount') return Math.max(0, lp - dv);
        return lp;
    };

    const onAddCommission = () =>
        setForm(f => ({ ...f, commissions: [...f.commissions, { user: '', role: 'sale', mode: 'percent', percent: '', amount: '' }] }));
    const onRemoveCommission = (idx) =>
        setForm(f => ({ ...f, commissions: f.commissions.filter((_, i) => i !== idx) }));

    const validateCommissions = () => {
        for (const [i, c] of form.commissions.entries()) {
            const p = Number(c.percent) || 0;
            const a = Number(c.amount) || 0;
            if (c.mode === 'percent' && a > 0) return `Dòng hoa hồng #${i + 1}: Chọn theo % thì không được nhập tiền.`;
            if (c.mode === 'amount' && p > 0) return `Dòng hoa hồng #${i + 1}: Chọn theo tiền thì không được nhập %.`;
            if (!c.user) return `Dòng hoa hồng #${i + 1}: Chưa chọn nhân viên.`;
        }
        return '';
    };

    const submitApprove = async () => {
        if (!selected) return;

        const err = validateCommissions();
        if (err) {
            await run(async () => ({ success: false, error: err }), [], { toast: true, overlay: false, autoRefresh: false, silent: false });
            return;
        }

        const fd = new FormData();
        fd.append('customerId', selected.customerId);
        // Lấy serviceDetailId từ detail (có thể là _id hoặc serviceDetailId)
        const serviceDetailId = selected.detail?._id || selected.detail?.serviceDetailId;
        fd.append('serviceDetailId', serviceDetailId);

        // ✅ GIỮ nguyên listPrice người duyệt thấy/chỉnh
        fd.append('listPrice', String(Number(form.listPrice) || 0));
        fd.append('discountType', form.discountType || 'none');
        fd.append('discountValue', String(Number(form.discountValue) || 0));
        fd.append('finalPrice', String(calcFinalPrice()));

        // Doanh thu ghi nhận (approved)
        const revenueNum = Number(form.revenue || 0) || 0;
        fd.append('revenue', String(revenueNum));

        const cleanCommissions = form.commissions.map(x => ({
            user: x.user,
            role: x.role,
            percent: x.mode === 'percent' ? Number(x.percent || 0) : 0,
            amount: x.mode === 'amount' ? Number(x.amount || 0) : 0,
        }));
        fd.append('commissions', JSON.stringify(cleanCommissions));
        fd.append('notes', form.notes || '');

        const res = await run(
            approveServiceDealAction,
            [null, fd],
            {
                successMessage: 'Duyệt đơn thành công.',
                errorMessage: (r) => r?.error || 'Không thể duyệt đơn.',
                autoRefresh: false, // Tắt autoRefresh để tự xử lý
                toast: true,
                overlay: true,
            }
        );
        if (res?.success) {
            setOpenApprove(false);
            
            // Lấy serviceDetailId từ biến đã lấy ở trên hoặc từ selected
            const approvedServiceDetailId = serviceDetailId || selected.detail?._id || selected.detail?.serviceDetailId;
            
            // Xóa đơn khỏi danh sách pending ngay lập tức
            setPendingApprovalsFromAPI(prev => prev.filter(r => {
                const detailId = r.detail?._id || r.detail?.serviceDetailId;
                return String(detailId) !== String(approvedServiceDetailId);
            }));
            
            // Giảm pendingTotal
            setPendingTotal(prev => Math.max(0, prev - 1));
            
            // Reset và fetch lại danh sách approved để hiển thị đơn mới
            setApprovedSkip(0);
            fetchApprovedDeals(0, false).catch(err => console.error('Error refreshing approved deals:', err));
            
            // Refresh lại pending list để đảm bảo đồng bộ (nếu còn đơn khác)
            fetchPendingApprovals(0, false).catch(err => console.error('Error refreshing pending approvals:', err));
            
            // Refresh lại danh sách tất cả đơn đã duyệt để cập nhật top commissions
            fetch('/api/service-details/approved?limit=1000&skip=0')
                .then(res => res.json())
                .then(result => {
                    if (result.success && Array.isArray(result.data)) {
                        setAllApprovedForCommissions(result.data);
                    }
                })
                .catch(err => console.error('Error refreshing all approved for commissions:', err));
            
            // Refresh report_daily để cập nhật stats ngay lập tức
            fetchReportDaily().catch(err => console.error('Error refreshing report_daily:', err));
            
            // ✅ CHỈ refresh yearly data SAU KHI DUYỆT THÀNH CÔNG (đã lưu vào database) để cập nhật biểu đồ năm
            // Đây là lúc duy nhất biểu đồ cần render lại
            // Delay một chút để đảm bảo database đã được cập nhật hoàn toàn
            setTimeout(async () => {
                try {
                    const response = await fetch('/api/report-daily');
                    const result = await response.json();
                    if (result.success && result.data) {
                        setYearlyReportData(result.data);
                    }
                } catch (err) {
                    console.error('Error refreshing yearly report_daily:', err);
                }
            }, 500); // Delay 500ms để đảm bảo database đã được cập nhật
        }
    };

    const submitReject = async () => {
        if (!selected) return;
        const reason = prompt('Lý do từ chối? (không bắt buộc)') || '';

        const fd = new FormData();
        fd.append('customerId', selected.customerId);
        // Lấy serviceDetailId từ detail (có thể là _id hoặc serviceDetailId)
        const rejectServiceDetailId = selected.detail?._id || selected.detail?.serviceDetailId;
        fd.append('serviceDetailId', rejectServiceDetailId);
        fd.append('reason', reason);

        const res = await run(
            rejectServiceDealAction,
            [null, fd],
            {
                successMessage: 'Đã từ chối đơn.',
                errorMessage: (r) => r?.error || 'Không thể từ chối đơn.',
                autoRefresh: false, // Tắt autoRefresh để tự xử lý
                toast: true,
                overlay: true,
            }
        );
        if (res?.success) {
            setOpenApprove(false);
            
            // Xóa đơn khỏi danh sách pending ngay lập tức (sử dụng rejectServiceDetailId đã lấy ở trên)
            setPendingApprovalsFromAPI(prev => prev.filter(r => {
                const detailId = r.detail?._id || r.detail?.serviceDetailId;
                return String(detailId) !== String(rejectServiceDetailId);
            }));
            
            // Giảm pendingTotal
            setPendingTotal(prev => Math.max(0, prev - 1));
            
            // Refresh lại pending list để đảm bảo đồng bộ
            fetchPendingApprovals(0, false).catch(err => console.error('Error refreshing pending approvals:', err));
        }
    };

    /* ---------- Sub components (dùng helpers ở trên) ---------- */
    const StatCard = ({ title, value, icon: Icon, description, color }) => (
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4" style={{ borderLeftColor: color }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-5 w-5 text-muted-foreground" style={{ color }} />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground">{description}</p>
            </CardContent>
        </Card>
    );

    const RecentDealsTable = ({ deals, userMap, scrollRef, onLoadMore, loadingMore, total, loaded }) => {
        // Infinite scroll handler
        useEffect(() => {
            const scrollContainer = scrollRef?.current;
            if (!scrollContainer || !onLoadMore) return;
            
            const handleScroll = () => {
                const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
                // Khi scroll đến nửa đường (50%)
                if (scrollTop + clientHeight >= scrollHeight * 0.5) {
                    onLoadMore();
                }
            };
            
            scrollContainer.addEventListener('scroll', handleScroll);
            return () => scrollContainer.removeEventListener('scroll', handleScroll);
        }, [scrollRef, onLoadMore]);
        
        return (
            <Card className="shadow-lg col-span-1 lg:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5" />Dịch vụ chốt (đã duyệt) gần đây</CardTitle>
                    <CardDescription>Chỉ hiển thị các ĐƠN CHI TIẾT đã duyệt. Sắp xếp mới nhất → cũ nhất.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div ref={scrollRef} className="max-h-[400px] overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-secondary">
                                <TableRow>
                                    <TableHead>Khách hàng</TableHead>
                                    <TableHead>Dịch vụ</TableHead>
                                    <TableHead>Nguồn</TableHead>
                                    <TableHead>Doanh thu</TableHead>
                                    <TableHead className="hidden md:table-cell">Trạng thái</TableHead>
                                    <TableHead className="hidden md:table-cell">Sale</TableHead>
                                    <TableHead className="text-right">Ngày chốt</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deals.length === 0 && (
                                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Chưa có dữ liệu</TableCell></TableRow>
                                )}
                                {deals.map((row, idx) => (
                                    <TableRow key={`${row.detail?._id || `${row.customerId}-${row.__dealDate || ''}`}-${idx}`}>
                                        <TableCell className="font-medium">{row.name}</TableCell>
                                        <TableCell className="text-sm">
                                            {getServiceName(row?.detail?.serviceId || row?.detail?.selectedService)}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {row?.detail?.sourceDetails || getSourceName(row?.detail?.sourceId)}
                                        </TableCell>
                                        <TableCell className="font-semibold text-green-600">
                                            {fmtVND(row.detail?.revenue)}
                                            <div className="text-[11px] text-muted-foreground">
                                                (Final: {fmtVND(readPricing(row.detail).finalPrice)})
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            {row.detail?.status === 'completed'
                                                ? <Badge>Hoàn thành</Badge>
                                                : <Badge variant="secondary">Còn liệu trình</Badge>}
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell text-xs">
                                            {namesFromAssignees(row.assignees, userMap)}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                            {row.__dealDate ? new Date(row.__dealDate).toLocaleDateString('vi-VN') : '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {loadingMore && (
                            <div className="text-center py-3 text-sm text-muted-foreground">Đang tải thêm...</div>
                        )}
                        {loaded >= total && total > 0 && (
                            <div className="text-center py-3 text-sm text-muted-foreground">Đã hiển thị tất cả ({total} đơn)</div>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    };


    /* ---------- UI ---------- */
    return (
        <div className="flex-1 space-y-6 py-4 pt-6 min-h-screen">

            {/* ====== Filter Bar ====== */}
            <Card className="shadow-md">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Bộ lọc thời gian</CardTitle>
                        <CardDescription>Áp dụng cho thống kê & danh sách.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={async () => {
                                const password = prompt('Nhập mật mã Dev để thực thi Rebuild report_daily:');
                                if (password !== '2522026') {
                                    alert('Mật mã không đúng. Vui lòng liên hệ kỹ thuật viên.');
                                    return;
                                }

                                if (!confirm('Bạn có chắc muốn rebuild report_daily? Điều này sẽ xóa tất cả dữ liệu cũ và tính lại từ orders.')) {
                                    return;
                                }

                                try {
                                    const response = await fetch('/api/report-daily/rebuild', { method: 'POST' });
                                    const result = await response.json();
                                    if (result.success) {
                                        alert(`Rebuild thành công!\n- Đã xóa: ${result.deleted} documents\n- Đã tạo lại: ${result.rebuilt} documents\n- Tổng orders: ${result.summary?.total_orders || 0}\n- Tổng doanh thu: ${(result.summary?.total_revenue || 0).toLocaleString('vi-VN')} đ`);
                                        // Refresh dữ liệu
                                        fetchReportDaily();
                                        if (yearlyDataInitialized) {
                                            fetch('/api/report-daily')
                                                .then(res => res.json())
                                                .then(data => {
                                                    if (data.success && data.data) {
                                                        setYearlyReportData(data.data);
                                                    }
                                                });
                                        }
                                    } else {
                                        alert(`Lỗi: ${result.error || 'Không thể rebuild'}`);
                                    }
                                } catch (err) {
                                    alert(`Lỗi: ${err.message || 'Không thể rebuild'}`);
                                }
                            }}
                            className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm bg-yellow-50 hover:bg-yellow-100"
                            style={{ borderColor: '#f59e0b' }}
                            title="Rebuild report_daily từ orders"
                        >
                            <RefreshCw className="w-4 h-4" /> Rebuild report_daily
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setRangePreset('last_30');
                                const d1 = new Date(Date.now() - 7 * 86400000);
                                const d2 = new Date();
                                setStartDate(toYMD(d1));
                                setEndDate(toYMD(d2));
                                // Reset bộ lọc nguồn & dịch vụ về trạng thái ban đầu
                                setSourceFilter('all');
                                setServiceFilter('all');
                            }}
                            className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-sm"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        >
                            <RefreshCw className="w-4 h-4" /> Đặt lại bộ lọc
                        </button>
                        <select
                            className="w-40 border rounded px-3 py-2 text-sm"
                            value={rangePreset}
                            onChange={(e) => {
                                const preset = e.target.value;
                                setRangePreset(preset);
                                const now = new Date();
                                let newStartDate = '';
                                let newEndDate = '';
                                
                                if (preset === 'this_week') {
                                    newStartDate = toYMD(startOfWeek(now));
                                    newEndDate = toYMD(endOfWeek(now));
                                } else if (preset === 'last_7') {
                                    const e = endOfDay(now);
                                    const s = new Date(e);
                                    s.setDate(s.getDate() - 6);
                                    newStartDate = toYMD(startOfDay(s));
                                    newEndDate = toYMD(e);
                                } else if (preset === 'this_month') {
                                    newStartDate = toYMD(startOfMonth(now));
                                    newEndDate = toYMD(endOfMonth(now));
                                } else if (preset === 'last_30') {
                                    const e = endOfDay(now);
                                    const s = new Date(e);
                                    s.setDate(s.getDate() - 29);
                                    newStartDate = toYMD(startOfDay(s));
                                    newEndDate = toYMD(e);
                                } else if (preset === 'this_quarter') {
                                    newStartDate = toYMD(startOfQuarter(now));
                                    newEndDate = toYMD(endOfQuarter(now));
                                } else if (preset === 'this_year') {
                                    newStartDate = toYMD(startOfYear(now));
                                    newEndDate = toYMD(endOfYear(now));
                                }
                                
                                if (newStartDate && newEndDate) {
                                    setStartDate(newStartDate);
                                    setEndDate(newEndDate);
                                }
                            }}
                        >
                            <option value="last_30">30 ngày qua</option>
                            <option value="last_7">7 ngày qua</option>
                            <option value="this_week">Tuần này</option>
                            <option value="this_month">Tháng này</option>
                            <option value="this_quarter">Quý này</option>
                            <option value="this_year">Năm nay</option>
                            <option value="custom">Tùy chọn</option>
                        </select>
                    </div>
                </CardHeader>
                {/* <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-0">
                    <div>
                        <label className="block mb-2 text-xs text-muted-foreground">Từ ngày</label>
                        <Input 
                            type="date" 
                            value={startDate} 
                            onChange={e => {
                                setStartDate(e.target.value);
                                setRangePreset('custom');
                            }} 
                            className="w-auto max-w-[900px]" 
                        />
                    </div>
                    <div>
                        <label className="block mb-2 text-xs text-muted-foreground">Đến ngày</label>
                        <Input 
                            type="date" 
                            value={endDate} 
                            onChange={e => {
                                setEndDate(e.target.value);
                                setRangePreset('custom');
                            }} 
                            className="w-auto max-w-[900px]" 
                        />
                    </div>
                    <div className="text-sm">
                        <span className="text-muted-foreground">Thời gian bắt đầu:&nbsp;</span>
                        <b>{rangeStart.toLocaleString('vi-VN')}</b>
                    </div>
                    <div className="text-sm">
                        <span className="text-muted-foreground">Thời gian kết thúc:&nbsp;</span>
                        <b>{rangeEnd.toLocaleString('vi-VN')}</b>
                    </div>
                </CardContent>
            </Card> */}
            <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Cột trái: Từ ngày & Đến ngày */}
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <label className="block mb-2 text-xs text-muted-foreground">Từ ngày</label>
                            <Input 
                                type="date" 
                                value={startDate} 
                                onChange={e => {
                                    setStartDate(e.target.value);
                                    setRangePreset('custom');
                                }} 
                                className="w-full" 
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block mb-2 text-xs text-muted-foreground">Đến ngày</label>
                            <Input 
                                type="date" 
                                value={endDate} 
                                onChange={e => {
                                    setEndDate(e.target.value);
                                    setRangePreset('custom');
                                }} 
                                className="w-full" 
                            />
                        </div>
                    </div>

                    {/* Cột phải: Thời gian bắt đầu & Thời gian kết thúc */}
                    <div className="flex gap-6 items-center">
                        <div className="text-sm flex-1">
                            <span className="text-muted-foreground">Thời gian bắt đầu:&nbsp;</span>
                            <b>{rangeStart.toLocaleString('vi-VN')}</b>
                        </div>
                        <div className="text-sm flex-1">
                            <span className="text-muted-foreground">Thời gian kết thúc:&nbsp;</span>
                            <b>{rangeEnd.toLocaleString('vi-VN')}</b>
                        </div>
                    </div>
                </div>
            </CardContent>
            </Card>
            
            {/* ====== Bộ lọc doanh thu theo đơn ====== */}
            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle>Bộ lọc doanh thu theo đơn</CardTitle>
                    <CardDescription>Lọc đơn đã duyệt theo nguồn và dịch vụ</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Listbox
                            label="Bộ lọc nguồn"
                            options={sourceOptions}
                            value={sourceFilter}
                            onChange={setSourceFilter}
                            placeholder="Tất cả nguồn"
                        />
                        <Listbox
                            label="Bộ lọc dịch vụ"
                            options={serviceOptions}
                            value={serviceFilter}
                            onChange={setServiceFilter}
                            placeholder="Tất cả dịch vụ"
                        />
                    </div>
                </CardContent>
            </Card>   

            {/* ====== Stats ====== */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard 
                    title="Tổng Dịch vụ (đã duyệt)" 
                    value={loadingReportDaily ? '...' : stats.totalDeals} 
                    icon={ShoppingCart} 
                    description={loadingReportDaily ? 'Đang tải...' : "Số đơn chi tiết đã duyệt trong khoảng lọc"} 
                    color="#16a34a" 
                />
                <StatCard 
                    title="Tổng Doanh thu (đã duyệt)" 
                    value={loadingReportDaily ? '...' : stats.totalRevenue} 
                    icon={DollarSign} 
                    description={loadingReportDaily ? 'Đang tải...' : "Từ report_daily (tổng revenue từ orders)"} 
                    color="#16a34a" 
                />
                <StatCard 
                    title="Doanh thu TB/DV" 
                    value={loadingReportDaily ? '...' : stats.avgRevenue} 
                    icon={UserCheck} 
                    description={loadingReportDaily ? 'Đang tải...' : "Trung bình mỗi đơn đã duyệt"} 
                    color="#16a34a" 
                />
                <StatCard title="Top Hoa hồng" value={topCommissions.length} icon={Percent} description="Số nhân sự hiện diện trong top" color="#f97316" />
            </div>

            {/* ====== Large Yearly Chart ====== */}
            <Card className="shadow-lg">
                <CardHeader className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <LineChart className="w-5 h-5" />
                            Doanh thu theo năm
                        </CardTitle>
                        <CardDescription>Tổng hợp các đơn <b>đã duyệt</b>. Nếu chưa có dữ liệu, trục Y hiển thị bước 1&nbsp;triệu.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="h-[480px]">
                    <YearlyRevenueChart data={yearlyChartData} />
                </CardContent>
            </Card>

            {/* ====== Pending approvals ====== */}
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center"><UserCog className="mr-2 h-5 w-5" />Danh sách cần duyệt</CardTitle>
                    <CardDescription>
                        Đơn chốt đang ở trạng thái <b>chờ duyệt</b> — chưa tính vào doanh thu.
                        {loadingPending && <span className="ml-2 text-xs text-muted-foreground">(Đang tải...)</span>}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div ref={pendingScrollRef} className="max-h-[360px] overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-secondary">
                                <TableRow>
                                    <TableHead>Khách hàng</TableHead>
                                    <TableHead>Giá & Doanh thu</TableHead>
                                    <TableHead>Ghi chú</TableHead>
                                    <TableHead className="text-right">Thao tác</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingApprovals.length === 0 && (
                                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Không có đơn cần duyệt</TableCell></TableRow>
                                )}
                                {pendingApprovals.map((row, idx) => {
                                    const p = readPricing(row.detail);
                                    return (
                                        <TableRow key={`${row.detail?._id || `${row.customerId}-${row.name}`}-${idx}`}>
                                            <TableCell className="font-medium">
                                                {row.name}
                                                <div className="text-xs text-muted-foreground">{row.phone}</div>
                                            </TableCell>
                                            <TableCell className="font-semibold">
                                                <div className="leading-tight">
                                                    <div>Giá gốc: <b>{fmtVND(p.listPrice)}</b></div>
                                                    <div className="text-[12px] text-muted-foreground">
                                                        Giảm: {discountLabel(p)} → Final: <b>{fmtVND(p.finalPrice)}</b>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs">{row.detail?.notes || '—'}</TableCell>
                                            <TableCell className="text-right flex items-center justify-end gap-2">
                                                <Button size="sm" variant="outline" onClick={() => setOpenDetails(true) || setDetailsRow(row)}><Eye className="w-4 h-4 mr-1" />Xem</Button>
                                                <Button size="sm" onClick={() => openApproveFor(row)}><Check className="w-4 h-4 mr-1" />Duyệt</Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                        {loadingMorePending && (
                            <div className="text-center py-3 text-sm text-muted-foreground">Đang tải thêm...</div>
                        )}
                        {pendingSkip >= pendingTotal && pendingTotal > 0 && (
                            <div className="text-center py-3 text-sm text-muted-foreground">Đã hiển thị tất cả ({pendingTotal} đơn)</div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* ====== Top Commissions ====== */}
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center"><PiggyBank className="mr-2 h-5 w-5" />Top nhân viên có hoa hồng cao</CardTitle>
                    <CardDescription>Tính từ các đơn chi tiết đã duyệt (dựa theo amount hoặc % * revenue).</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nhân viên</TableHead>
                                <TableHead className="text-right">Tổng hoa hồng</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {topCommissions.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Chưa có dữ liệu</TableCell></TableRow>}
                            {topCommissions.map(row => (
                                <TableRow key={row.user}>
                                    <TableCell>{nameFromUserId(row.user, userMap)}</TableCell>
                                    <TableCell className="text-right font-semibold">{fmtVND(row.total)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* ====== Recent Deals (approved) ====== */}
            <RecentDealsTable
                userMap={userMap}
                deals={approvedDeals}
                scrollRef={approvedScrollRef}
                onLoadMore={loadMoreApproved}
                loadingMore={loadingMoreApproved}
                total={approvedTotal}
                loaded={approvedSkip}
            />

            {/* ===== POPUP: DUYỆT ===== */}
            <Popup
                open={openApprove}
                onClose={() => setOpenApprove(false)}
                header={selected ? `Duyệt đơn: ${selected?.name} — ${selected?.phone}` : 'Duyệt đơn'}
                widthClass="max-w-4xl"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpenApprove(false)}><X className="w-4 h-4 mr-2" />Đóng</Button>
                        <Button variant="destructive" onClick={submitReject}><X className="w-4 h-4 mr-2" />Từ chối</Button>
                        <Button onClick={submitApprove}><Check className="w-4 h-4 mr-2" />Duyệt & Lưu</Button>
                    </>
                }
            >
                {/* Vùng thông tin KH */}
                {selected && (
                    <div className="mb-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-[8px] border bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }}>
                            <div>
                                <div className="text-xs text-muted-foreground">Khách hàng</div>
                                <div className="font-semibold">{selected.name}</div>
                                <div className="text-xs text-muted-foreground">{selected.phone}</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Sale liên quan</div>
                                <div className="text-sm">{namesFromAssignees(selected.assignees, userMap)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Ghi chú</div>
                                <div className="text-sm truncate">{selected?.detail?.notes || '—'}</div>
                            </div>
                        </div>
                        
                        {/* Nguồn và Dịch vụ */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-[8px] border bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }}>
                            <div>
                                <div className="text-xs text-muted-foreground">Nguồn</div>
                                <div className="text-sm font-medium" style={{ color: 'black' }}>
                                    {/* Ưu tiên lấy nguồn từ service_details.sourceDetails; fallback về form/source thông thường */}
                                    {selected?.detail?.sourceDetails || getSourceName(selected?.detail?.sourceId)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Dịch vụ</div>
                                <div className="text-sm font-medium">
                                    {getServiceName(selected?.detail?.serviceId || selected?.detail?.selectedService)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 1) Giá & Giảm giá */}
                <section className="mb-5 p-4 rounded-[8px] border" style={{ borderColor: 'var(--border)' }}>
                    <h4 className="font-semibold mb-3">1) Giá & Giảm giá</h4>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <div className="md:col-span-1">
                            <label className="block mb-1 text-sm">Giá gốc (listPrice)</label>
                            <Input
                                type="number"
                                value={form.listPrice}
                                onChange={e => setForm(f => ({ ...f, listPrice: e.target.value }))}
                            />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block mb-1 text-sm">CT khuyến mãi</label>
                            <Select
                                onValueChange={(value) => {
                                    const selectedProgram = discountPrograms.find(p => p._id === value);
                                    if (selectedProgram) {
                                        setForm(f => ({
                                            ...f,
                                            discountType: selectedProgram.discount_unit,
                                            discountValue: selectedProgram.discount_value.toString()
                                        }));
                                        setSelectedDiscountProgram(value);
                                    }
                                }}
                                value={selectedDiscountProgram}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="-- Chọn chương trình --" />
                                </SelectTrigger>
                                <SelectContent className={discountPrograms.length > 4 ? "max-h-[200px] overflow-y-auto" : ""}>
                                    {discountPrograms.map((program) => {
                                        const formatValue = () => {
                                            if (program.discount_unit === 'percent') {
                                                return `${program.discount_value}%`;
                                            } else if (program.discount_unit === 'amount') {
                                                return fmtVND(program.discount_value);
                                            }
                                            return program.discount_value;
                                        };
                                        return (
                                            <SelectItem key={program._id} value={program._id}>
                                                {program.name} - {formatValue()}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="md:col-span-1">
                            <label className="block mb-1 text-sm">Kiểu giảm</label>
                            <select
                                className="w-full border rounded px-3 py-2 text-sm"
                                value={form.discountType}
                                onChange={(e) => setForm(f => ({ ...f, discountType: e.target.value }))}
                            >
                                <option value="none">Không</option>
                                <option value="amount">Theo tiền</option>
                                <option value="percent">Theo %</option>
                            </select>
                        </div>
                        <div className="md:col-span-1">
                            <label className="block mb-1 text-sm">Giá trị giảm</label>
                            <Input type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block mb-1 text-sm">Giá sau giảm (final)</label>
                            <Input value={fmtVND(calcFinalPrice()).replace(' đ', '')} readOnly />
                        </div>
                    </div>
                </section>

                {/* 2) Doanh thu */}
                <section className="mb-5 p-4 rounded-[8px] border" style={{ borderColor: 'var(--border)' }}>
                    <h4 className="font-semibold mb-3">2) Ghi chú</h4>
                    <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
                        <div>
                            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                </section>

                {/* 3) Hoa hồng */}
                <section className="mb-5 p-4 rounded-[8px] border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold">3) Hoa hồng</h4>
                        <Button type="button" size="sm" onClick={onAddCommission}>+ Thêm dòng</Button>
                    </div>
                    <div className="space-y-2">
                        {form.commissions.map((row, idx) => {
                            const handleChange = (patch) => setForm(f => {
                                const arr = [...f.commissions];
                                if (patch.mode && patch.mode !== arr[idx].mode) {
                                    if (patch.mode === 'percent') { arr[idx].amount = ''; }
                                    if (patch.mode === 'amount') { arr[idx].percent = ''; }
                                }
                                arr[idx] = { ...arr[idx], ...patch };
                                return { ...f, commissions: arr };
                            });

                            const base = Number(form.revenue) || calcFinalPrice() || 0;
                            const p = Number(row.percent) || 0;
                            const a = Number(row.amount) || 0;
                            const preview = row.mode === 'percent'
                                ? Math.round((p / 100) * base)
                                : a;
                            const computedNote = `≈ ${fmtVND(preview)} (${row.mode === 'percent' ? `${p}% * ${fmtVND(base)}` : 'số tiền cố định'})`;

                            return (
                                <div key={idx} className="grid grid-cols-12 gap-2">
                                    <div className="col-span-3">
                                        <label className="block mb-1 text-xs text-muted-foreground">Nhân viên</label>
                                        <select
                                            className="w-full border rounded px-3 py-2 text-sm"
                                            value={row.user}
                                            onChange={(e) => handleChange({ user: e.target.value })}
                                        >
                                            <option value="">— Chọn nhân viên —</option>
                                            {users.map(u => (
                                                <option key={u._id} value={String(u._id)}>
                                                    {u.name} {u.group ? `• ${u.group}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="text-[11px] mt-1 text-muted-foreground">
                                            {row.user ? nameFromUserId(row.user, userMap) : 'Chưa chọn'}
                                        </div>
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block mb-1 text-xs text-muted-foreground">Vai trò</label>
                                        <Input placeholder="sale/doctor/..." value={row.role} onChange={e => handleChange({ role: e.target.value })} />
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block mb-1 text-xs text-muted-foreground">Cách nhập</label>
                                        <select
                                            className="w-full border rounded px-3 py-2 text-sm"
                                            value={row.mode}
                                            onChange={(e) => handleChange({ mode: e.target.value })}
                                        >
                                            <option value="percent">% theo doanh thu</option>
                                            <option value="amount">Số tiền cố định</option>
                                        </select>
                                    </div>

                                    {row.mode === 'percent' ? (
                                        <>
                                            <div className="col-span-2">
                                                <label className="block mb-1 text-xs text-muted-foreground">Phần trăm (%)</label>
                                                <Input type="number" placeholder="%" value={row.percent} onChange={e => handleChange({ percent: e.target.value, amount: '' })} />
                                            </div>
                                            <div className="col-span-2 opacity-50 pointer-events-none">
                                                <label className="block mb-1 text-xs text-muted-foreground">Số tiền (bị khóa)</label>
                                                <Input disabled placeholder="VND" value="" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="col-span-2 opacity-50 pointer-events-none">
                                                <label className="block mb-1 text-xs text-muted-foreground">Phần trăm (bị khóa)</label>
                                                <Input disabled placeholder="%" value="" />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block mb-1 text-xs text-muted-foreground">Số tiền</label>
                                                <Input type="number" placeholder="VND" value={row.amount} onChange={e => handleChange({ amount: e.target.value, percent: '' })} />
                                            </div>
                                        </>
                                    )}

                                    <div className="col-span-1 flex items-end justify-end">
                                        <Button type="button" variant="ghost" onClick={() => onRemoveCommission(idx)}><X className="w-4 h-4" /></Button>
                                    </div>

                                    <div className="col-span-12 text-[11px] text-muted-foreground -mt-1">{computedNote}</div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* 4) Tóm tắt */}
                <section className="p-4 rounded-[8px] border bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }}>
                    <h4 className="font-semibold mb-2">4) Tóm tắt</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>Giá gốc: <b>{fmtVND(form.listPrice)}</b></div>
                        <div>Giảm: <b>{form.discountType === 'percent' ? `${form.discountValue || 0}%` : (form.discountType === 'amount' ? fmtVND(form.discountValue) : '0')}</b></div>
                        <div>Giá sau giảm: <b>{fmtVND(calcFinalPrice())}</b></div>
                    </div>
                </section>
            </Popup>

            {/* ===== POPUP: XEM CHI TIẾT ===== */}
            <Popup
                open={openDetails}
                onClose={() => setOpenDetails(false)}
                header={detailsRow ? (() => {
                    const detailDate = detailsRow?.detail?.closedAt 
                        ? new Date(detailsRow.detail.closedAt)
                        : (detailsRow?.detail?.approvedAt 
                            ? new Date(detailsRow.detail.approvedAt)
                            : (detailsRow?.detail?.createdAt 
                                ? new Date(detailsRow.detail.createdAt)
                                : null));
                    const dateStr = detailDate 
                        ? detailDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '';
                    return `Chi tiết hồ sơ: ${detailsRow?.name} — ${detailsRow?.phone}${dateStr ? ` — ${dateStr}` : ''}`;
                })() : 'Chi tiết hồ sơ'}
                widthClass="max-w-3xl"
                footer={<Button variant="secondary" onClick={() => setOpenDetails(false)}><X className="w-4 h-4 mr-2" />Đóng</Button>}
            >
                {detailsRow && (
                    <div className="space-y-4">
                        {/* Info row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-[8px] border" style={{ borderColor: 'var(--border)' }}>
                            <div>
                                <div className="text-xs text-muted-foreground">Khách hàng</div>
                                <div className="font-semibold">{detailsRow.name}</div>
                                <div className="text-xs text-muted-foreground">{detailsRow.phone}</div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Sale liên quan</div>
                                <div className="text-sm">
                                    {namesFromAssignees(detailsRow.assignees, userMap)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Trạng thái</div>
                                <div className="text-sm">{detailsRow?.detail?.status || '—'}</div>
                            </div>
                        </div>

                        {/* Nguồn và Dịch vụ */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-[8px] border" style={{ borderColor: 'var(--border)' }}>
                            <div>
                                <div className="text-xs text-muted-foreground">Nguồn</div>
                                <div className="text-sm font-medium" style={{ color: 'black' }}>
                                    {/* Ưu tiên lấy từ service_details.sourceDetails */}
                                    {detailsRow?.detail?.sourceDetails || getSourceName(detailsRow?.detail?.sourceId)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground">Dịch vụ</div>
                                <div className="text-sm font-medium">
                                    {getServiceName(detailsRow?.detail?.serviceId || detailsRow?.detail?.selectedService)}
                                </div>
                            </div>
                        </div>

                        {/* Notes & Revenue */}
                        <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
                            <div className="p-3 rounded-[8px] border" style={{ borderColor: 'var(--border)' }}>
                                <div className="text-xs text-muted-foreground mb-1">Ghi chú Sale</div>
                                <div className="text-sm whitespace-pre-wrap">{detailsRow?.detail?.notes || '—'}</div>
                            </div>
                        </div>

                        {/* Image Preview — hiển thị mảng invoiceDriveIds */}
                        <div className="p-3 rounded-[8px] border" style={{ borderColor: 'var(--border)' }}>
                            <div className="text-xs text-muted-foreground mb-2">Hình ảnh đính kèm</div>
                            {Array.isArray(detailsRow?.detail?.invoiceDriveIds) && detailsRow.detail.invoiceDriveIds.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {detailsRow.detail.invoiceDriveIds.map((id, i) => (
                                        <img
                                            key={id || i}
                                            src={driveImage(id)}
                                            alt={`Invoice ${i + 1}`}
                                            className="w-full max-h-[240px] object-cover rounded-md border"
                                            style={{ borderColor: 'var(--border)' }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground">Chưa có hình ảnh</div>
                            )}
                        </div>

                        {/* Giá & Giảm giá (tóm tắt) */}
                        <div className="p-3 rounded-[8px] border" style={{ borderColor: 'var(--border)' }}>
                            <div className="text-xs text-muted-foreground mb-2">Giá & Giảm giá</div>
                            {(() => {
                                const p = readPricing(detailsRow?.detail);
                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                        <div>Giá gốc: <b>{fmtVND(p.listPrice)}</b></div>
                                        <div>Giảm: <b>{discountLabel(p)}</b></div>
                                        <div>Final: <b>{fmtVND(p.finalPrice)}</b></div>
                                        <div className="md:col-span-3">Doanh thu ghi nhận: <b className="text-green-600">{fmtVND(detailsRow?.detail?.revenue)}</b></div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </Popup>
        </div>
    );
}

/* ===== local state dành cho popup “Xem” ===== */
function useDetailsState() {
    const [openDetails, setOpenDetails] = useState(false);
    const [detailsRow, setDetailsRow] = useState(null);
    return { openDetails, setOpenDetails, detailsRow, setDetailsRow };
}
// dùng: const {openDetails, setOpenDetails, detailsRow, setDetailsRow} = useDetailsState();
