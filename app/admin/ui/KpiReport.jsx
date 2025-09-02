'use client'

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid"; // Đảm bảo bạn đang import Grid từ đây
import Typography from "@mui/material/Typography";
import ConversionFunnel from "./charts/ConversionFunnel";
import SourceDoughnut from "./charts/SourceDoughnut";

const KpiCard = ({ title, value, unit }) => (
    <Card sx={{ height: '100%', boxShadow: 'var(--boxshaw)' }}>
        <CardContent>
            <Typography variant="h6" color="var(--text-secondary)" gutterBottom>{title}</Typography>
            <Typography variant="h4" component="div" fontWeight="bold">
                {/* Sử dụng Number.isNaN để kiểm tra an toàn hơn */}
                {typeof value === 'number' && !Number.isNaN(value) ? value.toLocaleString() : value}
                <Typography variant="h6" component="span" sx={{ ml: 0.5 }}>{unit}</Typography>
            </Typography>
        </CardContent>
    </Card>
);

export default function KpiReport({ data }) {
    if (!data) {
        return <Typography>Đang tải dữ liệu báo cáo...</Typography>;
    }

    const {
        totalLeads = 0,
        conversionRate = 0,
        totalRevenue = 0,
        avgDealSize = 0,
        conversionFunnel = [],
        sourcePerformance = []
    } = data;

    return (
        // `Grid container` vẫn được giữ nguyên
        <Grid container spacing={3}>
            {/* Hàng 1: Các chỉ số KPI chính */}

            {/* Các Grid con đã được loại bỏ prop "item" */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <KpiCard title="Tổng số Leads" value={totalLeads} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <KpiCard title="Tỷ lệ chuyển đổi" value={conversionRate} unit="%" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <KpiCard title="Tổng doanh số" value={totalRevenue / 1000000} unit="triệu" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <KpiCard title="Doanh số trung bình" value={avgDealSize / 1000000} unit="triệu" />
            </Grid>

            {/* Hàng 2: Biểu đồ */}

            <Grid size={{ xs: 12, lg: 8 }}>
                <Card sx={{ boxShadow: 'var(--boxshaw)', p: 2, height: '100%' }}>
                    <h5 style={{ marginBottom: '1rem' }}>Báo cáo tỷ lệ chuyển đổi qua các giai đoạn</h5>
                    <ConversionFunnel data={conversionFunnel} />
                </Card>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
                <Card sx={{ boxShadow: 'var(--boxshaw)', p: 2, height: '100%' }}>
                    <h5 style={{ marginBottom: '1rem' }}>Phân tích hiệu quả chiến dịch (Theo nguồn)</h5>
                    <SourceDoughnut data={sourcePerformance} />
                </Card>
            </Grid>
        </Grid>
    )
}