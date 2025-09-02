'use client';

import React, { useState, useEffect } from 'react';

// === Import component từ shadcn/ui ===
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AnimatePresence, motion } from 'framer-motion';

// === Import icon từ lucide-react ===
import { PlusCircle, Pencil, Trash2, MessageSquare, UserPlus, CheckCircle2, Tag, ArrowRight } from 'lucide-react';

// === Giữ nguyên các hàm data và helper ===
import { createWorkflow, updateWorkflow } from '@/data/workflow/wraperdata.db';

function formatDelay(ms) { /* ... Giữ nguyên ... */ }

const actionIcons = {
    message: MessageSquare,
    friendRequest: UserPlus,
    checkFriend: CheckCircle2,
    tag: Tag,
};

// --- Component con cho từng bước, với logic chỉnh sửa tại chỗ ---
const WorkflowStep = ({ step, index, onRemove, onUpdateDelay, onUpdateParam, isFixed }) => {
    const Icon = actionIcons[step.action] || ArrowRight;
    const [isEditing, setIsEditing] = useState(false);

    // State cục bộ để chỉnh sửa mà không ảnh hưởng ngay lập tức đến state cha
    const [editableDelay, setEditableDelay] = useState(step.delay / 60000);
    const [editableMessage, setEditableMessage] = useState(step.params.message || '');

    const handleSave = () => {
        onUpdateDelay(index, editableDelay);
        if (['message', 'tag'].includes(step.action)) {
            onUpdateParam(index, 'message', editableMessage);
        }
        setIsEditing(false);
    };

    return (
        <Card className="transition-shadow duration-300 hover:shadow-lg">
            <div className="p-4 flex justify-between items-start gap-4">
                <div className="flex items-start gap-4 flex-grow">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-blue-600 flex-shrink-0">
                        <Icon className="h-5 w-5" />
                    </div>
                    <div>
                        <h5 className="font-semibold capitalize text-gray-800">{step.action.replace(/([A-Z])/g, ' $1')}</h5>
                        <p className="text-sm text-gray-500">Delay: {formatDelay(step.delay)}</p>
                        {step.params.message && <p className="text-sm text-gray-600 mt-1 italic break-all">"{step.params.message}"</p>}
                    </div>
                </div>
                {!isFixed && (
                    <div className="flex gap-2 flex-shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => setIsEditing(!isEditing)}>
                            <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {isEditing && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="border-t p-4 space-y-4 bg-gray-50/50">
                            <div className='grid grid-cols-2 gap-4'>
                                <div>
                                    <Label>Delay (phút)</Label>
                                    <Input type="number" value={editableDelay} onChange={e => setEditableDelay(parseFloat(e.target.value) || 0)} />
                                </div>
                            </div>

                            {['message', 'tag'].includes(step.action) && (
                                <div>
                                    <Label>{step.action === 'tag' ? 'Tag/Tên' : 'Tin nhắn'}</Label>
                                    <Textarea value={editableMessage} onChange={e => setEditableMessage(e.target.value)} rows={3} />
                                </div>
                            )}
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setIsEditing(false)}>Hủy</Button>
                                <Button onClick={handleSave}>Lưu</Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
};


// --- Component chính ---
export default function WorkflowForm({ workflow, forms, onSuccess, onCancel }) {
    // === Toàn bộ State và Effect được giữ nguyên ===
    const [name, setName] = useState('');
    const [steps, setSteps] = useState([]);
    const [newStep, setNewStep] = useState({ action: '', delay: 0, params: {} });
    const [delayUnit, setDelayUnit] = useState('minutes');
    const isFixed = workflow?.type === 'fixed';

    useEffect(() => { /* Giữ nguyên logic */ }, [workflow]);

    // === Toàn bộ các hàm xử lý logic được giữ nguyên ===
    const handleActionChange = (value) => { /* Giữ nguyên logic */ };
    const handleAddStep = () => { /* Giữ nguyên logic */ };
    const handleRemoveStep = (index) => { /* Giữ nguyên logic */ };
    const handleUpdateParam = (index, key, value) => { /* Giữ nguyên logic */ };
    const handleUpdateDelay = (index, value) => { /* Giữ nguyên logic */ };
    const handleSubmit = async () => { /* Giữ nguyên logic */ };

    const sortedSteps = [...steps].sort((a, b) => a.delay - b.delay);

    return (
        <>
            <SheetHeader className="p-4 border-b bg-white flex-shrink-0">
                <SheetTitle>{workflow ? 'Chỉnh Sửa' : 'Tạo'} Workflow {isFixed ? '(Cố Định)' : '(Tùy Biến)'}</SheetTitle>
                <SheetDescription>
                    Điền thông tin và thêm các bước để cấu hình luồng công việc của bạn.
                </SheetDescription>
            </SheetHeader>

            <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                <Card>
                    <CardHeader><CardTitle>Thông tin cơ bản</CardTitle></CardHeader>
                    <CardContent>
                        <Label htmlFor="workflow-name">Tên Workflow</Label>
                        <Input id="workflow-name" value={name} onChange={e => setName(e.target.value)} />
                    </CardContent>
                </Card>

                {!isFixed && (
                    <Card>
                        <CardHeader><CardTitle>Thêm bước mới</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Hành động</Label>
                                <Select value={newStep.action} onValueChange={handleActionChange}>
                                    <SelectTrigger><SelectValue placeholder="Chọn một hành động..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="message">Nhắn Tin</SelectItem>
                                        <SelectItem value="friendRequest">Kết Bạn</SelectItem>
                                        <SelectItem value="checkFriend">Kiểm Tra Kết Bạn</SelectItem>
                                        <SelectItem value="tag">Gắn Tag/Đổi Tên</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Delay</Label>
                                    <Input type="number" value={newStep.delay} onChange={e => setNewStep({ ...newStep, delay: parseFloat(e.target.value) || 0 })} />
                                </div>
                                <div>
                                    <Label>Đơn vị</Label>
                                    <Select value={delayUnit} onValueChange={setDelayUnit}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="minutes">Phút</SelectItem>
                                            <SelectItem value="hours">Giờ</SelectItem>
                                            <SelectItem value="days">Ngày</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            {['message', 'tag'].includes(newStep.action) && (
                                <div>
                                    <Label>{newStep.action === 'tag' ? 'Tag/Tên' : 'Tin nhắn'}</Label>
                                    <Textarea value={newStep.params.message || ''} onChange={e => setNewStep({ ...newStep, params: { message: e.target.value } })} />
                                </div>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" onClick={handleAddStep}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Thêm Bước
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                <div>
                    <h3 className="text-lg font-semibold mb-3">Các bước trong luồng</h3>
                    {sortedSteps.length > 0 ? (
                        <div className="space-y-3">
                            {sortedSteps.map((step, index) => (
                                <WorkflowStep
                                    key={index}
                                    index={index}
                                    step={step}
                                    onRemove={handleRemoveStep}
                                    onUpdateDelay={handleUpdateDelay}
                                    onUpdateParam={handleUpdateParam}
                                    isFixed={isFixed}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-gray-500 border-2 border-dashed rounded-lg p-8">
                            <p>Chưa có bước nào.</p>
                        </div>
                    )}
                </div>

            </main>

            <footer className="p-4 border-t bg-white flex justify-end gap-3 flex-shrink-0">
                <Button variant="outline" onClick={onCancel}>Hủy</Button>
                <Button onClick={handleSubmit}>Lưu</Button>
            </footer>
        </>
    );
}