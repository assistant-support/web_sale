'use client'

import { Bar } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

Chart.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/**
 * @param {object} props
 * @param {Array<{stage: string, count: number}>} props.data Dữ liệu cho biểu đồ phễu
 */
export default function ConversionFunnel({ data }) {
    const chartData = {
        labels: data.map(d => d.stage),
        datasets: [
            {
                label: 'Số lượng khách hàng',
                data: data.map(d => d.count),
                backgroundColor: [
                    '#1688eb',
                    '#2196f3',
                    '#4caf50',
                    '#ffc107',
                    '#4caf50', // Chốt đơn màu xanh lá
                    '#dc3545', // Từ chối màu đỏ
                ],
                borderColor: 'rgba(255,255,255,0.7)',
                borderWidth: 1,
            },
        ],
    };

    const options = {
        indexAxis: 'y',
        responsive: true,
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: false,
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        if (context.parsed.x !== null) label += context.parsed.x.toLocaleString();

                        const firstStageCount = chartData.datasets[0].data[0];
                        const currentStageCount = context.parsed.x;
                        if (firstStageCount > 0 && context.dataIndex > 0) {
                            const conversionRate = ((currentStageCount / firstStageCount) * 100).toFixed(1);
                            label += ` (${conversionRate}%)`;
                        }

                        return label;
                    }
                }
            }
        },
        scales: {
            x: { beginAtZero: true, grid: { color: 'rgba(200, 200, 200, 0.2)' } },
            y: { grid: { display: false } }
        }
    };

    return <Bar options={options} data={chartData} />;
}