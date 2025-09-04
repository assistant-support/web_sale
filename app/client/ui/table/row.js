'use client';

import React, { useState, useEffect, useActionState, useRef } from 'react';
// --- Icon Imports ---
import {
    LayoutDashboard, Clock, User, CalendarCheck, X, MessageCircle, Phone
} from 'lucide-react';

// --- Action & Data Function Imports ---
import { addCareNoteAction } from '@/app/actions/customer.actions';
import { closeServiceAction } from '@/data/customers/wraperdata.db'
import useActionUI from '@/hooks/useActionUI';

// --- Shadcn UI Component Imports ---
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

// --- TÁCH COMPONENT: Import các component con ---
import CustomerPipeline from './CustomerPipeline';
import CustomerHistory from './CustomerHistory';
import CustomerAppointments from './CustomerAppointments';
import CustomerInfo from './CustomerInfo';
import { history_data } from '@/data/actions/get';
import OMICallClient from './Call';
import ZaloButton from './Zalo';


// =============================================================
// == CÁC COMPONENT PHỤ CÒN LẠI
// =============================================================
function CustomerDetailHeader({ customer, zalo }) {
    const zaloAccount = customer.uid?.[0]?.zalo ? zalo.find(z => z._id === customer.uid[0].zalo) : null;
    return (
        <DialogHeader className="p-2 border-b">
            <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12"><AvatarImage src={customer.zaloavt || undefined} alt={customer.zaloname} /><AvatarFallback>{customer.name.charAt(0)}</AvatarFallback></Avatar>
                <div>
                    <DialogTitle asChild><h4>{customer.zaloname || customer.name}</h4></DialogTitle>
                    <DialogDescription asChild><h6>{customer.phone}</h6></DialogDescription>
                    {zaloAccount && <h6 className='text-muted-foreground'>CSKH: {zaloAccount.name}</h6>}
                </div>
            </div>
        </DialogHeader>
    );
}

// =============================================================
// == COMPONENT CHÍNH
// =============================================================
export default function CustomerRow({ customer, index, isSelected, onSelect, visibleColumns, renderCellContent, user, zalo, service }) {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('pipeline');
    const actionUI = useActionUI();
    const processedNoteState = useRef(null);
    const processedCloseState = useRef(null);
    const [historyData, setHistoryData] = useState([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    // --- State cho các server actions ---
    const [noteState, addNoteActionFn, isNotePending] = useActionState(addCareNoteAction, null);
    const [closeState, closeServiceActionFn] = useActionState(closeServiceAction, null);
    useEffect(() => {
        const fetchHistoryForPopup = async () => {
            if (!customer._id) return;

            setIsHistoryLoading(true);
            try {
                // Sử dụng hàm history_data đã có
                const result = await history_data(customer._id, 'customer');
                if (result.success) {
                    setHistoryData(result.data);
                } else {
                    // Bạn có thể dùng toast ở đây nếu muốn
                    console.error("Failed to fetch history:", result.error);
                    setHistoryData([]); // Đảm bảo dữ liệu cũ được xóa nếu có lỗi
                }
            } catch (error) {
                console.error("Error fetching history:", error);
                setHistoryData([]);
            } finally {
                setIsHistoryLoading(false);
            }
        };

        if (isPopupOpen) {
            fetchHistoryForPopup();
        }
    }, [isPopupOpen, customer._id])
    // Xử lý thông báo cho các actions
    useEffect(() => {
        if (noteState && noteState !== processedNoteState.current) {
            actionUI.showNoti(noteState.success, noteState.message || noteState.error);
            processedNoteState.current = noteState;
        }
    }, [noteState, actionUI]);

    useEffect(() => {
        if (closeState && closeState !== processedCloseState.current) {
            actionUI.showNoti(closeState.success, closeState.message || closeState.error);
            processedCloseState.current = closeState;
        }
    }, [closeState, actionUI]);

    const handleOpenPopup = (e) => {
        if (e.target.closest('input[type="checkbox"]')) return;
        setIsPopupOpen(true);
    };

    const handlePointerDownOutside = (event) => {
        if (event.target.closest('[data-action-ui-container]')) {
            event.preventDefault();
        }
    };

    // --- Logic render nội dung cho các tab ---
    const renderContent = () => {
        switch (activeTab) {
            case 'pipeline':
                return <CustomerPipeline customer={customer} addNoteAction={addNoteActionFn} isNotePending={isNotePending} noteState={noteState} closeServiceAction={closeServiceActionFn} closeState={closeState} />;
            case 'history':
                return <CustomerHistory customer={customer} initialHistory={historyData}
                    isLoading={isHistoryLoading} />;
            case 'info':
                return <CustomerInfo customer={customer} service={service} onClose={() => setIsPopupOpen(false)} />;
            case 'appointments':
                return <CustomerAppointments customer={customer} />;
            case 'calls':
                return <OMICallClient customer={customer} user={user} />;
            case 'zalo':
                return <ZaloButton />;
            default:
                return null;
        }
    };

    return (
        <>
            <actionUI.UI />
            {isPopupOpen && <tr className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />}

            <TableRow data-state={isSelected ? "selected" : "unselected"} className="cursor-pointer">
                <TableCell onClick={(e) => e.stopPropagation()} className="w-[60px]">
                    <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelect(customer, checked)} />
                </TableCell>
                <TableCell className="font-medium w-[80px]" onClick={handleOpenPopup}><h6>{index}</h6></TableCell>
                {visibleColumns.map(colKey => (
                    <TableCell key={colKey} className="truncate" onClick={handleOpenPopup}>
                        {renderCellContent(customer, colKey)}
                    </TableCell>
                ))}
            </TableRow>

            <Dialog open={isPopupOpen} onOpenChange={setIsPopupOpen}>
                <DialogContent
                    onPointerDownOutside={handlePointerDownOutside}
                    showCloseButton={false}
                    className="max-w-4xl p-0 gap-0 flex flex-col md:flex-row h-[80vh] z-50"
                >
                    <div className="md:hidden flex-shrink-0"><CustomerDetailHeader customer={customer} zalo={zalo} /></div>
                    <div className="flex-1" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="hidden md:block"><CustomerDetailHeader customer={customer} zalo={zalo} /></div>
                        {renderContent()}
                    </div>
                    <Separator orientation="vertical" className="hidden md:block h-full" />
                    <div className="w-full md:w-56 p-4 flex-shrink-0 flex md:flex-col gap-3 border-t md:border-t-0 md:border-l overflow-y-auto">
                        <Button variant={activeTab === 'pipeline' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('pipeline')}><LayoutDashboard className="h-5 w-5" /><h6 style={{ color: activeTab === 'pipeline' ? 'white' : 'var(--text_primary)' }}>Lịch trình</h6></Button>
                        <Button variant={activeTab === 'history' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('history')}><Clock className="h-5 w-5" /><h6 style={{ color: activeTab === 'history' ? 'white' : 'var(--text_primary)' }}>Lịch sử</h6></Button>
                        <Button variant={activeTab === 'info' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('info')}><User className="h-5 w-5" /><h6 style={{ color: activeTab === 'info' ? 'white' : 'var(--text_primary)' }}>Thông tin</h6></Button>
                        <Button variant={activeTab === 'appointments' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('appointments')}><CalendarCheck className="h-5 w-5" /><h6 style={{ color: activeTab === 'appointments' ? 'white' : 'var(--text_primary)' }}>Lịch hẹn</h6></Button>
                        <Button variant={activeTab === 'calls' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('calls')}><Phone className="h-5 w-5" /><h6 style={{ color: activeTab === 'calls' ? 'white' : 'var(--text_primary)' }}>Cuộc gọi</h6></Button>
                        <Button variant={activeTab === 'zalo' ? 'default' : 'outline'} className="flex-1 md:flex-none h-20 flex flex-col items-center justify-center gap-1 min-w-[100px]" onClick={() => setActiveTab('zalo')}><MessageCircle className="h-5 w-5" /><h6 style={{ color: activeTab === 'zalo' ? 'white' : 'var(--text_primary)' }}>Zalo</h6></Button>

                    </div>
                    <DialogClose className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </DialogClose>
                </DialogContent >
            </Dialog >
        </>
    );
}