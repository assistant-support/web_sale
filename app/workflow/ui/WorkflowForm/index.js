// ui/WorkflowForm/index.js

'use client';

import React, { useState, useEffect } from 'react';
import { TextField, Button, Select, MenuItem, FormControl, InputLabel, Chip, Box, Typography, IconButton } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { createWorkflow, updateWorkflow } from '@/data/workflow/wraperdata.db';
import styles from './index.module.css';

function formatDelay(ms) {
    const min = ms / 60000;
    if (min === 0) return '0 phút';
    if (min >= 1440) return (min / 1440).toFixed(2) + ' ngày';
    if (min >= 60) return (min / 60).toFixed(2) + ' giờ';
    return min.toFixed(0) + ' phút';
}

export default function WorkflowForm({ workflow, forms, onSuccess, onCancel }) {
    const [name, setName] = useState('');
    const [steps, setSteps] = useState([]);
    const [newStep, setNewStep] = useState({ action: '', delay: 0, params: {} });
    const [delayUnit, setDelayUnit] = useState('minutes');
    const isFixed = workflow?.type === 'fixed';

    useEffect(() => {
        if (workflow) {
            setName(workflow.name);
            setSteps(workflow.steps);
        }
    }, [workflow]);

    const handleActionChange = (value) => {
        setNewStep({ ...newStep, action: value, params: {} });
    };

    const handleAddStep = () => {
        if (newStep.action && newStep.delay >= 0) {
            let ms = newStep.delay * 60000;
            if (delayUnit === 'hours') ms *= 60;
            if (delayUnit === 'days') ms *= 1440;
            setSteps(prev => [...prev, { ...newStep, delay: ms }]);
            setNewStep({ action: '', delay: 0, params: {} });
            setDelayUnit('minutes');
        }
    };

    const handleRemoveStep = (index) => {
        setSteps(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpdateParam = (index, key, value) => {
        const updated = [...steps];
        updated[index].params[key] = value;
        setSteps(updated);
    };

    const handleUpdateDelay = (index, value) => {
        const updated = [...steps];
        updated[index].delay = value * 60000; // Giả sử phút
        setSteps(updated);
    };

    const handleSubmit = async () => {
        if (name && steps.length > 0) {
            const formData = { name, steps };
            let result;
            if (workflow) {
                result = await updateWorkflow(workflow._id, formData);
            } else {
                formData.type = isFixed ? 'fixed' : 'custom';
                result = await createWorkflow(formData);
            }
            if (result.success) {
                onSuccess(formData);
            }
        }
    };

    const sortedSteps = [...steps].sort((a, b) => a.delay - b.delay);

    return (
        <Box className={styles.form}>
            <div className={styles.header}>
                <h4>{workflow ? 'Chỉnh Sửa' : 'Tạo'} Workflow {isFixed ? '(Cố Định)' : '(Tùy Biến)'}</h4>
            </div>
            <Box className={`${styles.content} scroll`}>
                <Box className={styles.left}>
                    <TextField
                        label="Tên Workflow"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        fullWidth
                        margin="normal"
                        variant="outlined"
                        size="small"
                        className={styles.input}
                    />
                    {!isFixed && (
                        <Box className={styles.addStep}>
                            <FormControl fullWidth margin="normal" variant="outlined" size="small">
                                <InputLabel>Hành Động</InputLabel>
                                <Select value={newStep.action} onChange={e => handleActionChange(e.target.value)}>
                                    <MenuItem value="message">Nhắn Tin</MenuItem>
                                    <MenuItem value="friendRequest">Kết Bạn</MenuItem>
                                    <MenuItem value="checkFriend">Kiểm Tra Kết Bạn</MenuItem>
                                    <MenuItem value="tag">Gắn Tag/Đổi Tên</MenuItem>
                                </Select>
                            </FormControl>
                            <Box className={styles.delayContainer}>
                                <TextField
                                    label="Delay"
                                    type="number"
                                    value={newStep.delay}
                                    onChange={e => setNewStep({ ...newStep, delay: parseFloat(e.target.value) || 0 })}
                                    fullWidth
                                    margin="normal"
                                    variant="outlined"
                                    size="small"
                                    className={styles.input}
                                />
                                <FormControl fullWidth margin="normal" variant="outlined" size="small">
                                    <InputLabel>Đơn vị</InputLabel>
                                    <Select value={delayUnit} onChange={e => setDelayUnit(e.target.value)}>
                                        <MenuItem value="minutes">Phút</MenuItem>
                                        <MenuItem value="hours">Giờ</MenuItem>
                                        <MenuItem value="days">Ngày</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>
                            {['message', 'tag'].includes(newStep.action) && (
                                <TextField
                                    label={newStep.action === 'tag' ? 'Tag/Tên' : 'Tin nhắn'}
                                    value={newStep.params.message || ''}
                                    onChange={e => setNewStep({ ...newStep, params: { message: e.target.value } })}
                                    fullWidth
                                    margin="normal"
                                    variant="outlined"
                                    size="small"
                                    className={styles.input}
                                    multiline
                                    rows={4}
                                />
                            )}
                            <Button variant="outlined" color="secondary" onClick={handleAddStep} className={styles.addButton}>Thêm Bước</Button>
                        </Box>
                    )}
                </Box>
                <Box className={styles.right}>
                    <Typography variant="subtitle1" className={styles.subtitle}>Các Bước Workflow:</Typography>
                    <Box className={styles.timeline}>
                        {sortedSteps.map((step, index) => (
                            <Box key={index} className={styles.timelineItem}>
                                <Box className={styles.timelineDot} />
                                {index < sortedSteps.length - 1 && <Box className={styles.timelineConnector} />}
                                <Chip
                                    label={`Bước ${index + 1}: Hành động: ${step.action}`}
                                    onDelete={isFixed ? undefined : () => handleRemoveStep(index)}
                                    deleteIcon={isFixed ? undefined : <DeleteIcon />}
                                    color="primary"
                                    variant="outlined"
                                    className={styles.stepChip}
                                />
                                <div className={styles.stepDetails}>
                                    <h6>Thời gian thực hiện: {formatDelay(step.delay)} sau khi khách hàng đăng ký</h6>
                                    <h6>{step.params.message ? `${step.action === 'tag' ? `Tên gợi nhớ: ${step.params.message}` : 'Tin nhắn'}` : ''}</h6>
                                    <h6>{step.action !== 'tag' && step.params.message ? step.params.message : ''}</h6>
                                    <TextField
                                        label="Delay (phút)"
                                        type="number"
                                        value={step.delay / 60000}
                                        onChange={e => handleUpdateDelay(index, parseFloat(e.target.value) || 0)}
                                        fullWidth
                                        margin="normal"
                                        variant="outlined"
                                        size="small"
                                        className={styles.input}
                                        disabled={isFixed}
                                    />
                                    {['message', 'tag'].includes(step.action) && (
                                        <TextField
                                            label={step.action === 'tag' ? 'Tag/Tên' : 'Tin nhắn'}
                                            value={step.params.message || ''}
                                            onChange={e => handleUpdateParam(index, 'message', e.target.value)}
                                            fullWidth
                                            margin="normal"
                                            variant="outlined"
                                            size="small"
                                            className={styles.input}
                                            multiline
                                            rows={4}
                                        />
                                    )}
                                </div>
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>
            <div className={styles.footer}>
                <Button variant="outlined" onClick={onCancel} className={styles.cancelButton}>Hủy</Button>
                <Button variant="contained" color="primary" onClick={handleSubmit} className={styles.submitButton}>Lưu</Button>
            </div>
        </Box>
    );
}