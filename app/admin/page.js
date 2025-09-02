import Box from "@mui/material/Box";
import { user_data, customer_data_all } from "@/data/actions/get";
import AdminDashboard from "./ui/AdminDashboard";

function processDashboardData(customers) {
    if (!customers || customers.length === 0) {
        return {
            totalLeads: 0,
            validLeads: { count: 0, percentage: 0 },
            missingInfoLeads: { count: 0, percentage: 0 },
            duplicateLeads: { count: 0, percentage: 0 },
            missingInfoDetails: [],
        };
    }

    const totalLeads = customers.length;
    const phoneMap = new Map();
    let duplicateCount = 0;
    const duplicates = new Set();

    customers.forEach(c => {
        if (c.phone) {
            if (phoneMap.has(c.phone)) {
                if (!duplicates.has(c.phone)) {
                    duplicateCount += (phoneMap.get(c.phone).count + 1);
                    duplicates.add(c.phone);
                }
            } else {
                phoneMap.set(c.phone, { count: 1 });
            }
        }
    });

    let missingInfoCount = 0;
    const missingInfoDetails = [];
    const requiredFields = ['name', 'phone', 'email', 'source', 'address'];

    customers.forEach(c => {
        let missingFields = [];
        let missingCount = 0;
        requiredFields.forEach(field => {
            if (!c[field]) {
                missingFields.push(field);
                missingCount++;
            }
        });

        if (missingCount > 2) {
            missingInfoCount++;
            missingInfoDetails.push({
                _id: c._id.toString(),
                name: c.name || 'N/A',
                phone: c.phone || 'N/A',
                missingFields,
            });
        }
    });

    const validCount = totalLeads - missingInfoCount - duplicateCount;

    const toPercentage = (count) => (totalLeads > 0 ? (count / totalLeads) * 100 : 0).toFixed(1);

    return {
        totalLeads,
        validLeads: { count: validCount, percentage: toPercentage(validCount) },
        missingInfoLeads: { count: missingInfoCount, percentage: toPercentage(missingInfoCount) },
        duplicateLeads: { count: duplicateCount, percentage: toPercentage(duplicateCount) },
        missingInfoDetails,
    };
}

export default async function ReportPage() {
    const [customerList, userList] = await Promise.all([
        customer_data_all(),
        user_data({}),
    ]);

    const dashboardData = processDashboardData(customerList);

    return (
        <div>
            <Box sx={{ mb: 1 }}>
                <p className="text_w_600">Báo cáo & Phân tích</p>
                <h5>Tổng quan hiệu suất kinh doanh, hiệu quả nhân viên và cài đặt hệ thống.</h5>
            </Box>
            <AdminDashboard dashboardData={dashboardData} />
        </div>
    );
}