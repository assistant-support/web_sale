'use client'

import { Doughnut } from 'react-chartjs-2';
import { Chart, ArcElement, Tooltip, Legend, Title } from 'chart.js';

Chart.register(ArcElement, Tooltip, Legend, Title);

/**
 * @param {object} props
 * @param {Array<{source: string, leads: number}>} props.data Dữ liệu cho biểu đồ nguồn
 */
export default function SourceDoughnut({ data }) {
    const chartData = {
        labels: data.map(d => d.source),
        datasets: [
            {
                label: 'Số Leads',
                data: data.map(d => d.leads),
                backgroundColor: ['#1688eb', '#0374da', '#28a745', '#ffc107', '#6c757d', '#17a2b8'],
                borderColor: '#ffffff',
                borderWidth: 2,
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
            },
            title: {
                display: false
            }
        },
        cutout: '60%',
    };

    return (
        <div style={{ position: 'relative', height: '350px' }}>
            <Doughnut data={chartData} options={options} />
        </div>
    );
}