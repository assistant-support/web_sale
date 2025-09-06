// app/services/ui/ServiceForm/index.js

'use client';
import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from 'lucide-react';
import { createService, updateService } from '@/data/services/wraperdata.db';

export default function ServiceForm({ service, onSuccess, onCancel }) {
    // --- STATE MANAGEMENT (Logic không đổi) ---
    const [name, setName] = useState('');
    const [type, setType] = useState('noi_khoa');
    const [description, setDescription] = useState('');
    const [fees, setFees] = useState([]);
    const [editingIndex, setEditingIndex] = useState(-1);
    const [newFee, setNewFee] = useState({ description: '', amount: 0 });
    const [loading, setLoading] = useState(false);

    // --- LOGIC (Không đổi) ---
    useEffect(() => {
        if (service) {
            setName(service.name || '');
            setType(service.type || 'noi_khoa');
            setDescription(service.description || '');
            setFees(typeof service.fees === 'string' ? JSON.parse(service.fees) : (service.fees || []));
        }
    }, [service]);

    const totalPrice = useMemo(() => fees.reduce((sum, fee) => sum + Number(fee.amount), 0), [fees]);

    const handleAddOrUpdateFee = () => {
        if (newFee.description && newFee.amount > 0) {
            if (editingIndex >= 0) {
                const updatedFees = [...fees];
                updatedFees[editingIndex] = newFee;
                setFees(updatedFees);
                setEditingIndex(-1);
            } else {
                setFees(prev => [...prev, newFee]);
            }
            setNewFee({ description: '', amount: 0 });
        } else {
            toast.warning("Vui lòng nhập đầy đủ mô tả và số tiền hợp lệ.");
        }
    };

    const handleEditFee = (index) => {
        setNewFee(fees[index]);
        setEditingIndex(index);
    };

    const handleRemoveFee = (index) => {
        setFees(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!name) {
            toast.error("Tên dịch vụ không được để trống.");
            return;
        }
        setLoading(true);
        const formData = { name, type, description, fees: JSON.stringify(fees) };
        try {
            if (service) {
                const apiResult = await updateService(service._id, formData);
                if (apiResult.success) {
                    toast.success('Cập nhật dịch vụ thành công');
                    onSuccess({ ...formData, _id: service._id, price: totalPrice });
                } else { throw new Error(apiResult.error || 'Cập nhật dịch vụ thất bại'); }
            } else {
                const apiResult = await createService(formData);
                if (apiResult.success) {
                    toast.success('Tạo dịch vụ thành công');
                    onSuccess({ ...formData, _id: apiResult.id, price: totalPrice, fees: fees });
                } else { throw new Error(apiResult.error || 'Tạo dịch vụ thất bại'); }
            }
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- GIAO DIỆN ĐÃ ĐƯỢC TINH CHỈNH ---
    return (
        <div className="flex flex-col h-full max-h-[90vh] bg-background rounded-md overflow-hidden">
            {/* Header */}
            <div className="p-4 text-center border-b">
                <h4 className="text-xl font-semibold">{service ? 'Chỉnh sửa Dịch vụ' : 'Tạo Dịch vụ Mới'}</h4>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 scroll">
                <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Cột trái: Form nhập liệu */}
                    <div className="lg:col-span-2 space-y-4">
                        <Card>
                            <CardHeader>
                                <h5 className="font-semibold text-lg">Thông tin chung</h5>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <h6 className="font-medium text-sm" htmlFor="name">Tên Dịch vụ</h6>
                                    <Input id="name" value={name} onChange={e => setName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <h6 className="font-medium text-sm">Loại Dịch vụ</h6>
                                    <Select value={type} onValueChange={setType}>
                                        <SelectTrigger><SelectValue placeholder="Chọn loại dịch vụ" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="noi_khoa">Nội khoa</SelectItem>
                                            <SelectItem value="ngoai_khoa">Ngoại khoa</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <h6 className="font-medium text-sm" htmlFor="description">Mô tả</h6>
                                    <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={4} />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <h5 className="font-semibold text-lg">Chi tiết phí (Fee Breakdown)</h5>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end mb-4">
                                    <div className="sm:col-span-2 space-y-2">
                                        <h6 className="font-medium text-sm" htmlFor="fee-desc">Mô tả phí</h6>
                                        <Input id="fee-desc" value={newFee.description} onChange={e => setNewFee({ ...newFee, description: e.target.value })} />
                                    </div>
                                    <div className="sm:col-span-2 space-y-2">
                                        <h6 className="font-medium text-sm" htmlFor="fee-amount">Số tiền</h6>
                                        <Input id="fee-amount" type="number" value={newFee.amount} onChange={e => setNewFee({ ...newFee, amount: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <Button onClick={handleAddOrUpdateFee} className="w-full sm:w-auto">
                                        <Plus className="w-4 h-4 mr-2" />
                                        {editingIndex >= 0 ? 'Cập nhật' : 'Thêm'}
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                    {fees.map((fee, index) => (
                                        <div key={index} className="flex items-center justify-between p-3 rounded-lg border bg-slate-50">
                                            <div>
                                                <h6 className="font-medium text-base">{fee.description}</h6>
                                                <h5 className="text-sm text-muted-foreground">{Number(fee.amount).toLocaleString()} VND</h5>
                                            </div>
                                            <div className="flex items-center">
                                                <Button variant="ghost" size="icon" onClick={() => handleEditFee(index)}><Pencil className="w-4 h-4" /></Button>
                                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleRemoveFee(index)}><Trash2 className="w-4 h-4" /></Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Cột phải: Xem trước */}
                    <div className="lg:col-span-1">
                        <Card className="sticky top-4">
                            <CardHeader>
                                <h5 className="font-semibold text-lg">Xem trước</h5>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-baseline p-4 bg-slate-100 rounded-lg">
                                        <h5 className="text-muted-foreground font-semibold">Tổng giá</h5>
                                        <div className='text-right flex gap-2'>
                                            <h5 >{totalPrice.toLocaleString()}</h5>
                                            <h5 >VND</h5>
                                        </div>
                                    </div>
                                    <hr />
                                    <h5 className="font-medium pb-2">Chi tiết Phí:</h5>
                                    <div className="space-y-2 text-sm max-h-60 overflow-y-auto pr-2">
                                        {fees.length > 0 ? fees.map((fee, index) => (
                                            <dl key={index} className="flex justify-between items-center">
                                                <dt>{fee.description}</dt>
                                                <dd className="text-muted-foreground font-mono">{Number(fee.amount).toLocaleString()}</dd>
                                            </dl>
                                        )) : <h5>Chưa có chi tiết phí.</h5>}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 flex justify-end gap-4 border-t bg-background">
                <Button variant="outline" onClick={onCancel} disabled={loading}>Hủy</Button>
                <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu Dịch vụ'}</Button>
            </div>
        </div>
    );
}