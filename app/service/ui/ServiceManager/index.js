// app/services/ui/ServiceManager/index.js

'use client';

import React, { useState } from 'react';
import { Grid, Card, CardContent, CardActions, Typography, Button, IconButton, Box, Dialog } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import ServiceForm from '../ServiceForm';
import { deleteService, reloadServices } from '@/data/services/wraperdata.db';
import styles from './index.module.css';

export default function ServiceManager({ initialServices }) {
    const [services, setServices] = useState(initialServices);
    const [open, setOpen] = useState(false);
    const [selectedService, setSelectedService] = useState(null);

    const handleOpen = (service = null) => {
        console.log(service);
        
        setSelectedService(service);
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        setSelectedService(null);
    };

    const handleSuccess = (newService) => {
        setServices(prev => {
            if (selectedService) {
                return prev.map(s => s._id === selectedService._id ? { ...s, ...newService } : s);
            }
            return [...prev, newService];
        });
        handleClose();
    };

    const handleDelete = async (id) => {
        if (confirm('Bạn có chắc chắn muốn xóa dịch vụ này?')) {
            const result = await deleteService(id);
            if (result.success) {
                setServices(prev => prev.filter(s => s._id !== id));
                reloadServices();
            } else {
                alert(result.error);
            }
        }
    };

    return (
        <Box className={`${styles.container} scroll`}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 2, borderBottom: 'thin solid var(--border-color)' }}>
                <Typography variant="h6">Quản lý Dịch vụ</Typography>
                <Button variant="contained" color="primary" onClick={() => handleOpen()}>Tạo Dịch vụ Mới</Button>
            </Box>
            <Grid container spacing={2} sx={{ mt: 2 }}>
                {services.map(service => (
                    <Grid item xs={12} sm={6} md={4} key={service._id}>
                        <Card className={styles.card}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>{service.name}</Typography>
                                <Typography color="textSecondary">Loại: {service.type === 'noi_khoa' ? 'Nội khoa' : 'Ngoại khoa'}</Typography>
                                <Typography color="textSecondary">Giá: {service.price.toLocaleString()} VND</Typography>
                            </CardContent>
                            <CardActions>
                                <IconButton onClick={() => handleOpen(service)} color="primary">
                                    <EditIcon />
                                </IconButton>
                                <IconButton onClick={() => handleDelete(service._id)} color="secondary">
                                    <DeleteIcon />
                                </IconButton>
                            </CardActions>
                        </Card>
                    </Grid>
                ))}
            </Grid>
            <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
                <ServiceForm
                    service={selectedService}
                    onSuccess={handleSuccess}
                    onCancel={handleClose}
                />
            </Dialog>
        </Box>
    );
}