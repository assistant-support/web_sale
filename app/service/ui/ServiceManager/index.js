// app/services/ui/ServiceManager/index.js

'use client';
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, PlusCircle } from 'lucide-react';
import ServiceForm from '../ServiceForm';
import { deleteService, reloadServices } from '@/data/services/wraperdata.db';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ServiceManager({ initialServices }) {
    // --- STATE MANAGEMENT (Logic không đổi) ---
    const [services, setServices] = useState(initialServices);
    const [openForm, setOpenForm] = useState(false);
    const [selectedService, setSelectedService] = useState(null);

    // --- LOGIC (Không đổi) ---
    const handleOpenForm = (service = null) => {
        setSelectedService(service);
        setOpenForm(true);
    };

    const handleCloseForm = () => {
        setOpenForm(false);
        setSelectedService(null);
    };

    const handleSuccess = (serviceData) => {
        setServices(prev => {
            const feesArray = typeof serviceData.fees === 'string' ? JSON.parse(serviceData.fees) : serviceData.fees;
            const updatedService = { ...serviceData, fees: feesArray };
            if (selectedService) {
                return prev.map(s => s._id === selectedService._id ? { ...s, ...updatedService } : s);
            }
            return [...prev, updatedService];
        });
        handleCloseForm();
    };

    const handleDelete = async (id) => {
        try {
            const result = await deleteService(id);
            if (result.success) {
                setServices(prev => prev.filter(s => s._id !== id));
                toast.success('Xóa dịch vụ thành công');
                reloadServices();
            } else { throw new Error(result.error || 'Xóa dịch vụ thất bại'); }
        } catch (error) { toast.error(error.message); }
    };

    // --- GIAO DIỆN ĐÃ ĐƯỢC TINH CHỈNH ---
    return (
        <div className="bg-muted/30 h-full w-full rounded-lg">
            {/* Header */}
            <header className="flex justify-between items-center pb-4 mb-4 border-b">
                <div>
                    <p className='text_w_600'>Quản lý Dịch vụ</p>
                    <h5>Thêm, sửa, hoặc xóa các dịch vụ y tế.</h5>
                </div>
                <Button onClick={() => handleOpenForm()}>
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Tạo Dịch vụ Mới
                </Button>
            </header>

            {/* Service Grid */}
            <main className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {services.map(service => (
                    <Card key={service._id} className="flex flex-col cursor-pointer">
                        <CardHeader>
                            <h4>{service.name}</h4>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <div className='flex gap-2 align-center'>
                                <h4 className='text_w_400'>Loại dịch vụ:</h4>
                                <h4> {service.type === 'noi_khoa' ? 'Nội khoa' : 'Ngoại khoa'}</h4>
                            </div>
                            <div className='flex gap-2 align-center'>
                                <h4 className='text_w_400'>Tổng phí dịch vụ:</h4>
                                <h4>{Number(service.price).toLocaleString()}</h4>
                                <h4 className='text_w_600'>VND</h4>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-start gap-2 bg-slate-50">
                            <Button variant="outline" size="sm" onClick={() => handleOpenForm(service)}>
                                <Pencil className="w-4 h-4 mr-2" /> Sửa
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                        <Trash2 className="w-4 h-4 mr-2" /> Xóa
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Hành động này không thể hoàn tác. Dịch vụ {service.name} sẽ bị xóa vĩnh viễn khỏi hệ thống.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDelete(service._id)}>Xác nhận Xóa</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardFooter>
                    </Card>
                ))}
            </main>

            {/* Form Dialog */}
            <Dialog open={openForm} onOpenChange={setOpenForm}>
                <DialogTitle />
                <DialogContent className="sm:max-w-4xl p-0 border-0">
                    <ServiceForm
                        service={selectedService}
                        onSuccess={handleSuccess}
                        onCancel={handleCloseForm}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}