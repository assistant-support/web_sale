import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import ReportDashboard from "./ui/ReportDashboard";
import { customer_data } from "@/data/customers/wraperdata.db";
import { user_data } from "@/data/actions/get";
import { form_data } from "@/data/form_database/wraperdata.db";
import { appointment_data_all } from "@/data/appointment_db/wraperdata.db";

function processKpiData(customers, forms) {
    if (!customers || customers.length === 0) {
        // Trả về giá trị mặc định nếu không có dữ liệu
        return {
            totalLeads: 0,
            conversionRate: 0,
            totalRevenue: 0,
            avgDealSize: 0,
            conversionFunnel: [],
            sourcePerformance: []
        };
    }

    const totalLeads = customers.length;

    // Giả định: Các customer có status = 3 sẽ có trường `revenue`.
    // Nếu không có, totalRevenue sẽ luôn = 0.
    const closedDeals = customers.filter(c => c.status === 3);
    const totalRevenue = closedDeals.reduce((sum, deal) => sum + (deal.revenue || 0), 0);
    const closedDealsCount = closedDeals.length;

    const conversionRate = totalLeads > 0 ? (closedDealsCount / totalLeads) * 100 : 0;
    const avgDealSize = closedDealsCount > 0 ? totalRevenue / closedDealsCount : 0;

    // 1. Tính toán dữ liệu cho Phễu chuyển đổi (Conversion Funnel)
    const stageNames = { 0: 'Mới', 1: 'Tiềm năng', 2: 'Đã liên hệ', 3: 'Chốt đơn', 4: 'Từ chối' };
    const funnelCounts = customers.reduce((acc, customer) => {
        const status = customer.status;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    const conversionFunnel = Object.entries(stageNames).map(([stageKey, stageName]) => ({
        stage: stageName,
        count: funnelCounts[stageKey] || 0
    }));

    // 2. Phân tích hiệu quả theo Nguồn (Source Performance)
    const sourceMap = new Map(forms.map(form => [form._id.toString(), form.name]));
    const sourceCounts = customers.reduce((acc, customer) => {
        // Lấy sourceId, có thể là string hoặc object
        const sourceId = customer.source?._id?.toString() || (typeof customer.source === 'string' ? customer.source : null);

        const sourceName = sourceId ? sourceMap.get(sourceId) : "Không có nguồn";

        if (!acc[sourceName]) {
            acc[sourceName] = { leads: 0, closed: 0 };
        }
        acc[sourceName].leads += 1;
        if (customer.status === 3) {
            acc[sourceName].closed += 1;
        }
        return acc;
    }, {});

    const sourcePerformance = Object.entries(sourceCounts).map(([sourceName, data]) => ({
        source: sourceName,
        leads: data.leads,
        conversion: data.leads > 0 ? (data.closed / data.leads) * 100 : 0
    }));


    return {
        totalLeads,
        conversionRate: conversionRate.toFixed(1),
        totalRevenue,
        avgDealSize,
        conversionFunnel,
        sourcePerformance
    };
}

/**
 * Hàm tính toán hiệu suất nhân viên.
 * @param {Array} customers - Mảng dữ liệu khách hàng.
 * @param {Array} users - Mảng dữ liệu nhân viên.
 * @param {Array} appointments - Mảng dữ liệu lịch hẹn.
 * @returns {Array} - Mảng dữ liệu hiệu suất của mỗi nhân viên.
 */
function processEmployeePerformance(customers, users, appointments = []) { // Thêm appointments làm tham số
    if (!users || users.length === 0) return [];

    const performanceMap = new Map(users.map(user => [user._id.toString(), {
        id: user._id,
        name: user.name,
        avt: user.avt || '/default-avt.png',
        leads: 0,
        calls: 0,
        appointments: 0, // Giá trị khởi tạo
        closeRate: 0,
        closedCount: 0,
        revenue: 0,
        commission: 0
    }]));

    // Tính toán số lead và số cuộc gọi từ dữ liệu khách hàng
    customers.forEach(customer => {
        customer.roles?.forEach(role => {
            const userId = typeof role === 'object' ? role._id?.toString() : role?.toString();
            if (userId && performanceMap.has(userId)) {
                const employee = performanceMap.get(userId);
                employee.leads += 1;
                if (customer.status === 3) {
                    employee.closedCount += 1;
                    employee.revenue += customer.revenue || 0;
                }
            }
        });

        customer.care?.forEach(log => {
            const createById = log.createBy?._id?.toString() || log.createBy?.toString();
            if (createById && performanceMap.has(createById)) {
                performanceMap.get(createById).calls += 1;
            }
        });
    });

    // **[MỚI] Tính toán số lịch hẹn từ dữ liệu appointment**
    appointments.forEach(appointment => {
        // Lấy ID của người tạo lịch hẹn
        const creatorId = appointment.createdBy?.toString();

        // Nếu người tạo có trong danh sách nhân viên, tăng số lịch hẹn lên 1
        if (creatorId && performanceMap.has(creatorId)) {
            performanceMap.get(creatorId).appointments += 1;
        }
    });

    // Tính toán các chỉ số cuối cùng
    performanceMap.forEach(employee => {
        employee.closeRate = employee.leads > 0 ? ((employee.closedCount / employee.leads) * 100).toFixed(1) : 0;
        employee.commission = employee.revenue * 0.1;
    });

    return Array.from(performanceMap.values());
}


export default async function ReportPage() {
    // 1. Fetch dữ liệu thô từ các actions
    // Đổi tên biến appointment thành appointmentList cho rõ nghĩa
    const [customerList, userList, formList, appointmentList] = await Promise.all([
        customer_data(),
        user_data({}),
        form_data(),
        appointment_data_all() // Lấy tất cả lịch hẹn (giả sử action hỗ trợ)
    ]);

    // 2. Xử lý dữ liệu thô để tính toán các chỉ số
    const kpiData = processKpiData(customerList, formList);
    // [CẬP NHẬT] Truyền appointmentList vào hàm xử lý
    const employeeData = processEmployeePerformance(customerList, userList, appointmentList);
    console.log(customerList);
    
    return (
        <div>
            <Box sx={{ mb: 1 }}>
                <p className="text_w_600">Báo cáo & Phân tích</p>
                <h5>Tổng quan hiệu suất kinh doanh, hiệu quả nhân viên và cài đặt hệ thống.</h5>
            </Box>
            <ReportDashboard kpiData={kpiData} employeeData={employeeData} />
        </div>
    );
}