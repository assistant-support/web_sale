// ui/WorkflowManager/index.js

'use client';

import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableRow, Button, Dialog, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import WorkflowForm from '../WorkflowForm';
import { workflow_data, reloadWorkflow, assignCustomToFixed, unassignCustom } from '@/data/workflow/wraperdata.db';
import styles from './index.module.css';

export default function WorkflowManager({ initialWorkflows, forms }) {
    const [workflows, setWorkflows] = useState(initialWorkflows);
    const [open, setOpen] = useState(false);
    const [selectedWorkflow, setSelectedWorkflow] = useState(null);
    const [filter, setFilter] = useState('all');
    const [assignOpen, setAssignOpen] = useState(false);
    const [selectedCustom, setSelectedCustom] = useState(null);

    useEffect(() => {
        async function fetchFiltered() {
            const filtered = await workflow_data(null, filter);
            setWorkflows(filtered);
        }
        fetchFiltered();
    }, [filter]);

    const handleOpen = (workflow = null) => {
        setSelectedWorkflow(workflow);
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        setSelectedWorkflow(null);
    };

    const handleSuccess = async (newWorkflow) => {
        await reloadWorkflow();
        const updated = await workflow_data(null, filter);
        setWorkflows(updated);
        handleClose();
    };

    const handleFilter = (event, newFilter) => {
        if (newFilter) setFilter(newFilter);
    };

    const handleAssignOpen = (custom) => {
        setSelectedCustom(custom);
        setAssignOpen(true);
    };

    const handleAssign = async (fixedId) => {
        const result = await assignCustomToFixed(selectedCustom._id, fixedId);
        if (result.success) {
            await reloadWorkflow();
            const updated = await workflow_data(null, filter);
            setWorkflows(updated);
            setAssignOpen(false);
        }
    };

    const handleUnassign = async (customId) => {
        const result = await unassignCustom(customId);
        if (result.success) {
            await reloadWorkflow();
            const updated = await workflow_data(null, filter);
            setWorkflows(updated);
        }
    };

    const fixedWorkflows = workflows.filter(w => w.type === 'fixed');

    return (
        <div className={`${styles.container} scroll`}>
            <div className={styles.header}>
                <h4>Quản lý Workflow</h4>
                <ToggleButtonGroup value={filter} exclusive onChange={handleFilter} color="primary">
                    <ToggleButton value="all">Tất cả</ToggleButton>
                    <ToggleButton value="fixed">Cố định</ToggleButton>
                    <ToggleButton value="custom">Tùy biến</ToggleButton>
                </ToggleButtonGroup>
                <Button variant="contained" color="primary" onClick={() => handleOpen()}>Tạo Workflow Mới</Button>
            </div>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ background: 'var(--main_d)', color: 'white' }}>Tên</TableCell>
                        <TableCell sx={{ background: 'var(--main_d)', color: 'white' }}>Loại</TableCell>
                        <TableCell sx={{ background: 'var(--main_d)', color: 'white' }}>Số Bước</TableCell>
                        <TableCell sx={{ background: 'var(--main_d)', color: 'white' }}>Gán</TableCell>
                        <TableCell sx={{ background: 'var(--main_d)', color: 'white' }}>Hành Động</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {workflows.map(workflow => (
                        <TableRow key={workflow._id}>
                            <TableCell>{workflow.name}</TableCell>
                            <TableCell>{workflow.type}</TableCell>
                            <TableCell>{workflow.steps.length}</TableCell>
                            <TableCell>
                                {workflow.type === 'custom' && (
                                    <>
                                        {workflow.attachedTo ? (
                                            <Button onClick={() => handleUnassign(workflow._id)}>Gỡ Gán</Button>
                                        ) : (
                                            <Button onClick={() => handleAssignOpen(workflow)}>Gán Vào Fixed</Button>
                                        )}
                                    </>
                                )}
                            </TableCell>
                            <TableCell>
                                <Button onClick={() => handleOpen(workflow)}>Chỉnh Sửa</Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
                <WorkflowForm
                    workflow={selectedWorkflow}
                    forms={forms}
                    onSuccess={handleSuccess}
                    onCancel={handleClose}
                />
            </Dialog>
            <Dialog open={assignOpen} onClose={() => setAssignOpen(false)}>
                <Typography variant="h6">Chọn Fixed Để Gán</Typography>
                {fixedWorkflows.map(fixed => (
                    <Button key={fixed._id} onClick={() => handleAssign(fixed._id)}>{fixed.name}</Button>
                ))}
            </Dialog>
        </div>
    );
}