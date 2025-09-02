'use client';

import React, { useState, useEffect } from 'react';

// === Import component từ shadcn/ui ===
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// === Import icon từ lucide-react ===
import { Plus, Eye, Pencil, MessageSquare, UserPlus, CheckCircle2, Tag, ArrowRight, Link, Unlink } from 'lucide-react';

// === Giữ nguyên các hàm data và logic ===
import WorkflowForm from '../WorkflowForm';
import { workflow_data, reloadWorkflow, assignCustomToFixed, unassignCustom } from '@/data/workflow/wraperdata.db';

// --- Component con để xem Flowchart ---
const actionDetails = {
    message: { icon: MessageSquare, name: "Gửi Tin Nhắn", color: "bg-blue-100 text-blue-700" },
    friendRequest: { icon: UserPlus, name: "Gửi Kết Bạn", color: "bg-green-100 text-green-700" },
    checkFriend: { icon: CheckCircle2, name: "Kiểm Tra Bạn Bè", color: "bg-yellow-100 text-yellow-700" },
    tag: { icon: Tag, name: "Gắn Thẻ", color: "bg-purple-100 text-purple-700" },
};

const formatDelay = (ms) => {
    const min = ms / 60000;
    if (min === 0) return 'Ngay lập tức';
    if (min >= 1440) return `${(min / 1440).toFixed(1)} ngày`;
    if (min >= 60) return `${(min / 60).toFixed(1)} giờ`;
    return `${min.toFixed(0)} phút`;
}

const WorkflowViewer = ({ workflow }) => {
    if (!workflow) return null;
    return (
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Xem Luồng Công Việc: {workflow.name}</DialogTitle>
            </DialogHeader>
            <div className="p-4 overflow-x-auto">
                <div className="flex items-center gap-4">
                    {workflow.steps.sort((a, b) => a.delay - b.delay).map((step, index) => {
                        const details = actionDetails[step.action] || { icon: ArrowRight, name: step.action, color: "bg-gray-100 text-gray-700" };
                        const Icon = details.icon;
                        return (
                            <React.Fragment key={index}>
                                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                                    <div className={`w-20 h-20 rounded-lg flex items-center justify-center ${details.color}`}>
                                        <Icon className="h-8 w-8" />
                                    </div>
                                    <p className="font-semibold text-center w-32 text-sm">{details.name}</p>
                                    <p className="text-xs text-gray-500">{formatDelay(step.delay)}</p>
                                </div>
                                {index < workflow.steps.length - 1 && (
                                    <div className="flex-shrink-0 text-gray-300">
                                        <ArrowRight className="h-10 w-10" />
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </DialogContent>
    );
};

// --- Component chính ---
export default function WorkflowManager({ initialWorkflows, forms }) {
    // === Toàn bộ State và Effect được giữ nguyên ===
    const [workflows, setWorkflows] = useState(initialWorkflows || []);
    const [selectedWorkflow, setSelectedWorkflow] = useState(null);
    const [filter, setFilter] = useState('all');
    const [isFormOpen, setFormOpen] = useState(false); // State cho Sheet
    const [isViewerOpen, setViewerOpen] = useState(false); // State cho Dialog Viewer
    const [assignOpen, setAssignOpen] = useState(false);
    const [selectedCustom, setSelectedCustom] = useState(null);

    useEffect(() => {
        async function fetchFiltered() {
            const filtered = await workflow_data(null, filter);
            setWorkflows(filtered);
        }
        fetchFiltered();
    }, [filter]);

    // === Toàn bộ các hàm xử lý logic được giữ nguyên ===
    const handleSuccess = async (newWorkflow) => {
        await reloadWorkflow();
        const updated = await workflow_data(null, filter);
        setWorkflows(updated);
        setFormOpen(false);
    };

    const handleAssign = async (fixedId) => {
        if (!selectedCustom) return;
        const result = await assignCustomToFixed(selectedCustom._id, fixedId);
        if (result.success) {
            await handleSuccess();
            setAssignOpen(false);
        }
    };

    const handleUnassign = async (customId) => {
        const result = await unassignCustom(customId);
        if (result.success) await handleSuccess();
    };

    // === Hàm mới để điều khiển UI ===
    const handleOpenForm = (workflow = null) => {
        setSelectedWorkflow(workflow);
        setFormOpen(true);
    };

    const handleOpenViewer = (workflow) => {
        setSelectedWorkflow(workflow);
        setViewerOpen(true);
    };

    const handleOpenAssign = (custom) => {
        setSelectedCustom(custom);
        setAssignOpen(true);
    };

    const fixedWorkflows = workflows.filter(w => w.type === 'fixed');

    return (
        <div className="p-4 md:p-6 space-y-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h4>Quản lý Workflow</h4>
                    <p className="text-gray-500">Tạo, chỉnh sửa và quản lý các luồng công việc.</p>
                </div>
                <div className='flex items-center gap-2'>
                    <Tabs value={filter} onValueChange={setFilter}>
                        <TabsList>
                            <TabsTrigger value="all">Tất cả</TabsTrigger>
                            <TabsTrigger value="fixed">Cố định</TabsTrigger>
                            <TabsTrigger value="custom">Tùy biến</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Button onClick={() => handleOpenForm()}>
                        <Plus className="mr-2 h-4 w-4" /> Tạo Mới
                    </Button>
                </div>
            </header>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-2/5">Tên</TableHead>
                                <TableHead>Loại</TableHead>
                                <TableHead>Số Bước</TableHead>
                                <TableHead>Gán</TableHead>
                                <TableHead className="text-right">Hành Động</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {workflows.map(workflow => (
                                <TableRow key={workflow._id}>
                                    <TableCell className="font-medium">{workflow.name}</TableCell>
                                    <TableCell>{workflow.type}</TableCell>
                                    <TableCell>{workflow.steps.length}</TableCell>
                                    <TableCell>
                                        {workflow.type === 'custom' && (
                                            <>
                                                {workflow.attachedTo ? (
                                                    <Button variant="link" className="px-0" onClick={() => handleUnassign(workflow._id)}><Unlink className="mr-2 h-4 w-4" /> Gỡ Gán</Button>
                                                ) : (
                                                    <Button variant="link" className="px-0" onClick={() => handleOpenAssign(workflow)}><Link className="mr-2 h-4 w-4" /> Gán</Button>
                                                )}
                                            </>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="icon" onClick={() => handleOpenViewer(workflow)}>
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button variant="outline" size="icon" onClick={() => handleOpenForm(workflow)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isFormOpen} onOpenChange={setFormOpen}>
                <DialogContent className="w-full sm:max-w-[700px] p-0">
                    <WorkflowForm
                        workflow={selectedWorkflow}
                        forms={forms}
                        onSuccess={handleSuccess}
                        onCancel={() => setFormOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={isViewerOpen} onOpenChange={setViewerOpen}>
                <WorkflowViewer workflow={selectedWorkflow} />
            </Dialog>

            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Chọn Fixed Để Gán</DialogTitle>
                    </DialogHeader>
                    <div className='flex flex-col gap-2 py-4'>
                        {fixedWorkflows.map(fixed => (
                            <Button key={fixed._id} variant="outline" onClick={() => handleAssign(fixed._id)}>{fixed.name}</Button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}