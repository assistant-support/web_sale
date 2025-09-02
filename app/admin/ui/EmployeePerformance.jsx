'use client'

import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function EmployeePerformance({ data }) {
    return (
        <Paper sx={{ width: '100%', overflow: 'hidden', boxShadow: 'var(--boxshaw)' }}>
            <TableContainer sx={{ maxHeight: 600 }}>
                <Table stickyHeader aria-label="sticky table">
                    <TableHead>
                        <TableRow sx={{
                            "& .MuiTableCell-root": {
                                backgroundColor: 'var(--bg-secondary)',
                                fontWeight: 'bold'
                            }
                        }}>
                            <TableCell><h6>Nhân viên</h6></TableCell>
                            <TableCell align="right"><h6>Số Lead</h6></TableCell>
                            <TableCell align="right"><h6>Số cuộc gọi</h6></TableCell>
                            <TableCell align="right"><h6>Lịch hẹn</h6></TableCell>
                            <TableCell align="right"><h6>Tỷ lệ chốt (%)</h6></TableCell>
                            <TableCell align="right"><h6>Doanh số (VND)</h6></TableCell>
                            <TableCell align="right"><h6>Hoa hồng (VND)</h6></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((row) => (
                            <TableRow hover role="checkbox" tabIndex={-1} key={row.id}>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Avatar alt={row.name} src={row.avt} sx={{ mr: 2 }} />
                                        <Typography variant="body2" fontWeight="medium">{row.name}</Typography>
                                    </Box>
                                </TableCell>
                                <TableCell align="right">{row.leads.toLocaleString()}</TableCell>
                                <TableCell align="right">{row.calls.toLocaleString()}</TableCell>
                                <TableCell align="right">{row.appointments.toLocaleString()}</TableCell>
                                <TableCell align="right" sx={{ color: 'var(--green)' }}>{row.closeRate}%</TableCell>
                                <TableCell align="right" fontWeight="bold">{row.revenue.toLocaleString()}</TableCell>
                                <TableCell align="right" sx={{ color: 'var(--main_b)' }}>{row.commission.toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
}