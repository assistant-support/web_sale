'use client';

import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ShoppingCart, UserCheck, Percent, History } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// --- Sub Components (Không thay đổi) ---

const StatCard = ({ title, value, icon: Icon, description, color }) => (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 border-l-4" style={{ borderLeftColor: color }}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-5 w-5 text-muted-foreground" style={{ color }} />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
    </Card>
);

const RevenueChart = ({ chartData }) => {
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: 'Doanh thu theo Tháng', font: { size: 16 } },
        },
        scales: {
            y: {
                ticks: {
                    callback: function (value) {
                        return (value / 1000000) + 'tr';
                    }
                }
            }
        }
    };
    return <Bar options={options} data={chartData} />;
};

const RecentDealsTable = ({ deals }) => (
    <Card className="shadow-lg col-span-1 lg:col-span-2">
        <CardHeader>
            <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5" />Dịch vụ chốt gần đây</CardTitle>
            <CardDescription>Danh sách các khách hàng đã chốt dịch vụ gần nhất.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="max-h-[400px] overflow-y-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary">
                        <TableRow>
                            <TableHead>Khách hàng</TableHead>
                            <TableHead>Doanh thu</TableHead>
                            <TableHead className="hidden md:table-cell">Trạng thái</TableHead>
                            <TableHead className="text-right">Ngày chốt</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {deals.map(deal => (
                            <TableRow key={deal._id}>
                                <TableCell className="font-medium">{deal.name}</TableCell>
                                <TableCell className="font-semibold text-green-600">
                                    {deal.serviceDetails.revenue.toLocaleString('vi-VN')} đ
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                    {deal.serviceDetails.status === 'completed' ?
                                        <Badge>Hoàn thành</Badge> :
                                        <Badge variant="secondary">Còn liệu trình</Badge>
                                    }
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                    {new Date(deal.serviceDetails.closedAt).toLocaleDateString('vi-VN')}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
    </Card>
);

// --- Main Client Component ---
export default function RevenueStatsClient({ initialData }) {

    const { stats, chartData, recentDeals } = useMemo(() => {
        // ✅ SỬA LỖI: Lọc ra những khách hàng có dữ liệu 'serviceDetails' hợp lệ ngay từ đầu
        const validDeals = initialData.filter(deal => deal && deal.serviceDetails);

        const totalDeals = validDeals.length;
        if (totalDeals === 0) {
            return { stats: { totalDeals: 0, totalRevenue: '0 đ', avgRevenue: '0 đ', upsellRate: '0%' }, chartData: { labels: [], datasets: [] }, recentDeals: [] };
        }

        // Tất cả các phép tính sau đây đều dựa trên mảng 'validDeals' đã được lọc
        const totalRevenue = validDeals.reduce((sum, deal) => sum + deal.serviceDetails.revenue, 0);
        const avgRevenue = totalRevenue / totalDeals;
        const upsellCount = validDeals.filter(deal =>
            deal.serviceDetails.customTags?.some(tag => ['upsell', 'cross-sell'].includes(tag.toLowerCase()))
        ).length;
        const upsellRate = (upsellCount / totalDeals) * 100;

        const monthlyRevenue = {};
        validDeals.forEach(deal => {
            const month = new Date(deal.serviceDetails.closedAt).toLocaleString('vi-VN', { month: 'long', year: 'numeric' });
            if (!monthlyRevenue[month]) {
                monthlyRevenue[month] = 0;
            }
            monthlyRevenue[month] += deal.serviceDetails.revenue;
        });

        const sortedMonths = Object.keys(monthlyRevenue).sort((a, b) => {
            const [monthA, yearA] = a.replace('Tháng ', '').split(' năm ');
            const [monthB, yearB] = b.replace('Tháng ', '').split(' năm ');
            return new Date(yearA, monthA - 1) - new Date(yearB, monthB - 1);
        });

        const chartLabels = sortedMonths;
        const chartValues = sortedMonths.map(month => monthlyRevenue[month]);

        return {
            stats: {
                totalDeals: totalDeals,
                totalRevenue: `${totalRevenue.toLocaleString('vi-VN')} đ`,
                avgRevenue: `${avgRevenue.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} đ`,
                upsellRate: `${upsellRate.toFixed(1)}%`
            },
            chartData: {
                labels: chartLabels,
                datasets: [{
                    label: 'Doanh thu',
                    data: chartValues,
                    backgroundColor: 'rgba(22, 163, 74, 0.7)',
                    borderColor: 'rgba(21, 128, 61, 1)',
                    borderWidth: 1,
                }]
            },
            recentDeals: [...validDeals].sort((a, b) => new Date(b.serviceDetails.closedAt) - new Date(a.serviceDetails.closedAt))
        };
    }, [initialData]);

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 bg-gray-50 min-h-screen">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Tổng Dịch vụ Chốt" value={stats.totalDeals} icon={ShoppingCart} description="Số khách hàng đã chốt dịch vụ" color="#16a34a" />
                <StatCard title="Tổng Doanh thu" value={stats.totalRevenue} icon={DollarSign} description="Tổng doanh thu từ các dịch vụ" color="#16a34a" />
                <StatCard title="Doanh thu TB/DV" value={stats.avgRevenue} icon={UserCheck} description="Doanh thu trung bình trên mỗi dịch vụ" color="#16a34a" />
                <StatCard title="Tỷ lệ Upsell" value={stats.upsellRate} icon={Percent} description="Tỷ lệ dịch vụ có upsell/cross-sell" color="#f97316" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle>Biểu đồ Doanh thu</CardTitle>
                        <CardDescription>Tổng doanh thu theo từng tháng.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px] relative">
                        <RevenueChart chartData={chartData} />
                    </CardContent>
                </Card>
                <RecentDealsTable deals={recentDeals} />
            </div>
        </div>
    );
}