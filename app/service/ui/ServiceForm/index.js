// app/services/ui/ServiceForm/index.js

'use client';
import { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { createService, updateService } from '@/data/services/wraperdata.db';
import { useCrudManager } from '@/hooks/useCrudManager'; 
import styles from './index.module.css';

export default function ServiceForm({ service, onSuccess, onCancel }) {
    const [name, setName] = useState('');
    const [type, setType] = useState('noi_khoa');
    const [description, setDescription] = useState('');
    const [fees, setFees] = useState([]);
    const [editingIndex, setEditingIndex] = useState(-1);
    const [newFee, setNewFee] = useState({ description: '', amount: 0 });
    const [loading, setLoading] = useState(false);

    const { notification, closeNotification, handleActionComplete } = useCrudManager();

    useEffect(() => {
        if (service) {
            setName(service.name || '');
            setType(service.type || 'noi_khoa');
            setDescription(service.description || '');
            setFees(service.fees || []);
        }
    }, [service]);

    const totalPrice = useMemo(() => fees.reduce((sum, fee) => sum + fee.amount, 0), [fees]);

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
        setLoading(true);
        const formData = {
            name,
            type,
            description,
            fees: JSON.stringify(fees)
        };
        let apiResult;
        let actionResult;
        if (service) {
            apiResult = await updateService(service._id, formData);
            actionResult = {
                status: apiResult.success,
                message: apiResult.success ? 'Cập nhật dịch vụ thành công' : 'Cập nhật dịch vụ thất bại'
            };
        } else {
            apiResult = await createService(formData);
            actionResult = {
                status: apiResult.success,
                message: apiResult.success ? 'Tạo dịch vụ thành công' : 'Tạo dịch vụ thất bại'
            };
        }
        handleActionComplete(actionResult);
        if (actionResult.status) {
            onSuccess({ ...formData, _id: apiResult.id || service._id, price: totalPrice });
        }
        setLoading(false);
    };

    return (
        <Box className={styles.form}>
            <Typography variant="h6" className={styles.header}>
                {service ? 'Chỉnh sửa Dịch vụ' : 'Tạo Dịch vụ Mới'}
            </Typography>
            <Box className={`${styles.content} scroll`}>
                <Box className={styles.left}>
                    <Box className={styles.section}>
                        <TextField label="Tên Dịch vụ" value={name} onChange={e => setName(e.target.value)} fullWidth margin="normal" variant="outlined" size="small" />
                        <FormControl fullWidth margin="normal" variant="outlined" size="small">
                            <InputLabel>Loại Dịch vụ</InputLabel>
                            <Select value={type} onChange={e => setType(e.target.value)}>
                                <MenuItem value="noi_khoa">Nội khoa</MenuItem>
                                <MenuItem value="ngoai_khoa">Ngoại khoa</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField label="Mô tả" value={description} onChange={e => setDescription(e.target.value)} fullWidth margin="normal" variant="outlined" size="small" multiline rows={3} />
                    </Box>
                    <Box className={styles.section}>
                        <Box className={styles.feeHeader}>
                            <Typography variant="body1">Chi tiết phí (feeBreakdown)</Typography>
                            <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={handleAddOrUpdateFee}>
                                {editingIndex >= 0 ? 'Cập nhật mục' : 'Thêm mục'}
                            </Button>
                        </Box>
                        <Box className={styles.addGroup}>
                            <TextField label="Mô tả phí" value={newFee.description} onChange={e => setNewFee({ ...newFee, description: e.target.value })} fullWidth margin="normal" variant="outlined" size="small" />
                            <TextField label="Số tiền" type="number" value={newFee.amount} onChange={e => setNewFee({ ...newFee, amount: parseFloat(e.target.value) || 0 })} fullWidth margin="normal" variant="outlined" size="small" />
                        </Box>
                        <List dense>
                            {fees.map((fee, index) => (
                                <ListItem key={index}>
                                    <ListItemText primary={fee.description} secondary={`${fee.amount.toLocaleString()} VND`} />
                                    <ListItemSecondaryAction>
                                        <IconButton onClick={() => handleEditFee(index)} color="primary">
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton onClick={() => handleRemoveFee(index)} color="secondary">
                                            <DeleteIcon />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                </Box>
                <Box className={styles.right}>
                    <Box className={styles.section}>
                        <Typography variant="subtitle1" gutterBottom>Xem trước</Typography>
                        <Typography>Giá Tổng: {totalPrice.toLocaleString()} VND</Typography>
                        <Typography variant="body2" sx={{ mt: 2 }}>Chi tiết Phí:</Typography>
                        <List dense>
                            {fees.map((fee, index) => (
                                <ListItem key={index}>
                                    <ListItemText primary={fee.description} secondary={`${fee.amount.toLocaleString()} VND`} />
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                </Box>
            </Box>
            <Box className={styles.footer}>
                <Button variant="outlined" onClick={onCancel} disabled={loading}>Hủy</Button>
                <Button variant="contained" color="primary" onClick={handleSubmit} disabled={loading}>
                    {loading ? 'Đang lưu...' : 'Lưu'}
                </Button>
            </Box>
            <Snackbar open={notification.open} autoHideDuration={6000} onClose={closeNotification}>
                <Alert onClose={closeNotification} severity={notification.status ? 'success' : 'error'} sx={{ width: '100%' }}>
                    {notification.mes}
                </Alert>
            </Snackbar>
        </Box>
    );
}