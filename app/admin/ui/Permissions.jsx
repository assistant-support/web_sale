'use client'

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Grid from "@mui/material/Grid";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";


export default function Permissions() {
    const roles = ['Admin', 'Trưởng phòng', 'Nhân viên Telesale', 'Marketing'];
    const features = [
        'Xem tất cả Lead', 'Chỉnh sửa Lead', 'Xóa Lead', 'Xuất báo cáo', 'Cấu hình hệ thống'
    ];

    return (
        <Grid container spacing={3}>
            <Grid item xs={12} md={7}>
                <Card sx={{ boxShadow: 'var(--boxshaw)' }}>
                    <CardContent>
                        <h5 style={{ marginBottom: '1rem' }}>Phân quyền theo chức năng</h5>
                        <Box sx={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...tableHeaderStyle, minWidth: '200px' }}>Chức năng</th>
                                        {roles.map(role => <th key={role} style={tableHeaderStyle}>{role}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {features.map(feature => (
                                        <tr key={feature}>
                                            <td style={tableCellStyle}>{feature}</td>
                                            {roles.map(role => (
                                                <td key={`${feature}-${role}`} style={{ ...tableCellStyle, textAlign: 'center' }}>
                                                    <Checkbox size="small" />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Box>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={5}>
                <Card sx={{ boxShadow: 'var(--boxshaw)' }}>
                    <CardContent>
                        <h5 style={{ marginBottom: '1.5rem' }}>Phân quyền theo Nguồn Lead / Khách hàng</h5>
                        <FormControl fullWidth sx={{ mb: 2 }}>
                            <InputLabel id="user-select-label">Chọn nhân viên</InputLabel>
                            <Select labelId="user-select-label" label="Chọn nhân viên" defaultValue="">
                                <MenuItem value={1}>Nguyễn Văn An</MenuItem>
                                <MenuItem value={2}>Trần Thị Bình</MenuItem>
                                <MenuItem value={3}>Lê Minh Cường</MenuItem>
                            </Select>
                        </FormControl>
                        <h6 style={{ marginBottom: '1rem' }}>Nguồn được phép truy cập:</h6>
                        <FormGroup>
                            <FormControlLabel control={<Checkbox defaultChecked />} label="Facebook Ads" />
                            <FormControlLabel control={<Checkbox />} label="Google SEO" />
                            <FormControlLabel control={<Checkbox defaultChecked />} label="Zalo Marketing" />
                            <FormControlLabel control={<Checkbox />} label="Hội thảo" />
                        </FormGroup>
                    </CardContent>
                </Card>
            </Grid>
        </Grid>
    );
}

const tableHeaderStyle = {
    padding: '12px 16px',
    textAlign: 'left',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)'
};

const tableCellStyle = {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-color)',
};