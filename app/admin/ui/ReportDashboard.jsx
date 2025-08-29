'use client'

import { useState } from 'react';
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import KpiReport from './KpiReport';
import EmployeePerformance from './EmployeePerformance';
import Permissions from './Permissions';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && (
                <Box sx={{ pt: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export default function ReportDashboard({ kpiData, employeeData }) {
    const [tabIndex, setTabIndex] = useState(0);

    const handleTabChange = (event, newValue) => {
        setTabIndex(newValue);
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'var(--border-color)' }}>
                <Tabs value={tabIndex} onChange={handleTabChange} aria-label="report tabs">
                    <Tab label="Báo cáo KPI & Phân tích" />
                    <Tab label="Hiệu suất nhân viên" />
                </Tabs>
            </Box>
            <TabPanel value={tabIndex} index={0}>
                <KpiReport data={kpiData} />
            </TabPanel>
            <TabPanel value={tabIndex} index={1}>
                <EmployeePerformance data={employeeData} />
            </TabPanel>
        </Box>
    );
}