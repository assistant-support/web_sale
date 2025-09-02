import { customer_data } from '@/data/customers/wraperdata.db';
import { user_data, form_data, history_data as fetch_history_data } from '@/data/actions/get';
import { appointment_data_all } from '@/data/appointment_db/wraperdata.db';
import AdminDashboard from './ui/AdminDashboard';

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

function processHistoryData(history) {
    if (!history || !history.data || history.data.length === 0) {
        return {
            byType: {},
            overall: {
                total: 0,
                success: 0,
                failed: 0,
                successRate: 0
            },
            recentActivities: [],
            zaloLimits: {
                hourly: 0,
                daily: 0,
                yearly: {
                    total: 200000,
                    used: 0,
                    remaining: 200000
                }
            }
        };
    }

    const stats = {
        byType: {
            sendMessage: {
                name: 'Gửi tin nhắn',
                total: 0,
                success: 0,
                failed: 0
            },
            addFriend: {
                name: 'Kết bạn',
                total: 0,
                success: 0,
                failed: 0
            },
            findUid: {
                name: 'Tìm UID',
                total: 0,
                success: 0,
                failed: 0
            },
            checkFriend: {
                name: 'Kiểm tra bạn bè',
                total: 0,
                success: 0,
                failed: 0
            },
            tag: {
                name: 'Gắn thẻ',
                total: 0,
                success: 0,
                failed: 0
            }
        },
        overall: {
            total: 0,
            success: 0,
            failed: 0
        },
        zaloLimits: {
            hourly: history.zaloLimits?.hourly || 0,
            daily: history.zaloLimits?.daily || 0,
            yearly: {
                total: 200000,
                used: 0,
                remaining: 200000
            }
        }
    };

    // Xử lý các loại sự kiện
    history.data.forEach((log) => {
        if (stats.byType[log.type]) {
            stats.byType[log.type].total++;
            stats.overall.total++;
            if (log.status?.status) {
                stats.byType[log.type].success++;
                stats.overall.success++;
            } else {
                stats.byType[log.type].failed++;
                stats.overall.failed++;
            }
        }
    });

    // Tính toán giới hạn theo năm
    const currentYear = new Date().getFullYear();
    
    // Lọc ra số tin nhắn gửi thành công trong năm hiện tại
    const yearlyMessagesSent = history.data.filter(log => {
        // Kiểm tra loại tin và trạng thái thành công
        if (log.type === 'sendMessage' && log.status?.status) {
            // Kiểm tra năm gửi
            const logDate = new Date(log.createdAt);
            return logDate.getFullYear() === currentYear;
        }
        return false;
    }).length;
    
    // Cập nhật giới hạn năm
    stats.zaloLimits.yearly.used = yearlyMessagesSent;
    stats.zaloLimits.yearly.remaining = Math.max(0, 200000 - yearlyMessagesSent);

    // Calculate success rates
    for (const type in stats.byType) {
        const typeStats = stats.byType[type];
        typeStats.successRate = typeStats.total > 0 ? ((typeStats.success / typeStats.total) * 100).toFixed(1) : '0.0';
    }
    stats.overall.successRate = stats.overall.total > 0 ? ((stats.overall.success / stats.overall.total) * 100).toFixed(1) : '0.0';

    return {
        ...stats,
        recentActivities: history.data.slice(0, 50) // Get latest 50 activities
    };
}

export default async function AdminPage() {
    const customers = await customer_data();
    const dashboardData = processDashboardData(customers);
    const historyResult = await fetch_history_data();
    
    const historyData = processHistoryData(historyResult.success ? historyResult : { data: [] });

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h3>Dashboard</h3>
            </div>
            <AdminDashboard dashboardData={dashboardData} historyData={historyData} />
        </div>
    );
}