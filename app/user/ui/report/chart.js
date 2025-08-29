'use client';

import { Bar, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';

// Đăng ký các thành phần cần thiết cho Chart.js
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
);

const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: 'top',
        },
        title: {
            display: true,
            font: {
                size: 16
            }
        },
    },
};

const StatusCharts = ({ summaryData, violationTypesData }) => {
    const summaryChartData = {
        labels: ['Trạng thái buổi học'],
        datasets: [
            {
                label: 'Hoàn thành',
                data: [summaryData.completed],
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
            },
            {
                label: 'Vi phạm',
                data: [summaryData.violations],
                backgroundColor: 'rgba(255, 99, 132, 0.6)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
            },
        ],
    };

    const violationTypesChartData = {
        labels: ['Điểm Danh', 'Nhận Xét', 'Hình Ảnh'],
        datasets: [
            {
                label: 'Số lỗi vi phạm',
                data: [
                    violationTypesData.attendance,
                    violationTypesData.comment,
                    violationTypesData.image,
                ],
                backgroundColor: [
                    'rgba(255, 159, 64, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                ],
                borderColor: [
                    'rgba(255, 159, 64, 1)',
                    'rgba(153, 102, 255, 1)',
                    'rgba(54, 162, 235, 1)',
                ],
                borderWidth: 1,
                hoverOffset: 4,
            },
        ],
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%' }}>
            <div style={{ position: 'relative', height: '40%' }}>
                <Bar
                    options={{ ...chartOptions, title: { ...chartOptions.plugins.title, text: `Tổng quan: ${summaryData.total} buổi học` } }}
                    data={summaryChartData}
                />
            </div>
            <div style={{ position: 'relative', height: '60%', display: 'flex', justifyContent: 'center' }}>
                <Doughnut
                    options={{ ...chartOptions, title: { ...chartOptions.plugins.title, text: 'Phân loại vi phạm phổ biến' } }}
                    data={violationTypesChartData}
                />
            </div>
        </div>
    );
};

export default StatusCharts;