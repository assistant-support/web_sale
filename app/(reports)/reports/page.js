export default function ReportsPage() {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Báo cáo</h1>
            <p className="text-muted-foreground">Trang báo cáo tổng hợp các thông tin và số liệu quan trọng của hệ thống.</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Báo cáo tổng quan</h3>
                    <p className="text-sm text-muted-foreground">Xem tổng quan các chỉ số và thống kê chính của hệ thống</p>
                </div>
                <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Báo cáo doanh thu</h3>
                    <p className="text-sm text-muted-foreground">Theo dõi doanh thu và các chỉ số tài chính liên quan</p>
                </div>
                <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Báo cáo marketing</h3>
                    <p className="text-sm text-muted-foreground">Phân tích hiệu quả các chiến dịch marketing</p>
                </div>
                <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-2">Báo cáo tài chính</h3>
                    <p className="text-sm text-muted-foreground">Báo cáo chi tiết về tình hình tài chính</p>
                </div>
            </div>
        </div>
    );
}

