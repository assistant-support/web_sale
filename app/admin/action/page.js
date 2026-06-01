import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import { history_data } from '@/data/actions/get';
import { assertAdminSaleRevenueOnly } from "../adminSaleAccess";
import { getAdminSaleScope } from "../saleScope.server";
import { filterHistoryLogsForSale } from "@/utils/saleScope";

export default async function AdminPage() {
    await assertAdminSaleRevenueOnly();
    const { roles, currentUserId, isSaleOnly } = await getAdminSaleScope();

    const historyResult = await history_data();
    let historyPayload = historyResult.success ? historyResult : { data: [] };

    if (isSaleOnly && Array.isArray(historyPayload.data)) {
        historyPayload = {
            ...historyPayload,
            data: filterHistoryLogsForSale(historyPayload.data, currentUserId),
        };
    }

    const historyData = processHistoryData(historyPayload);

    return (
        <>
            <Navbar roles={roles} />
            <DashboardClient initialData={historyData} />
        </>
    );
}

function createEmptyActionByType() {
    return {
        sendMessage: { name: 'Gửi tin nhắn', total: 0, success: 0, failed: 0, successRate: '0.0' },
        addFriend: { name: 'Kết bạn', total: 0, success: 0, failed: 0, successRate: '0.0' },
        findUid: { name: 'Tìm UID', total: 0, success: 0, failed: 0, successRate: '0.0' },
        checkFriend: { name: 'Kiểm tra bạn bè', total: 0, success: 0, failed: 0, successRate: '0.0' },
        tag: { name: 'Gắn thẻ', total: 0, success: 0, failed: 0, successRate: '0.0' },
    };
}

// Hỗ trợ
function processHistoryData(history) {
    const zaloFromHistory = history?.zaloLimits || {};

    if (!history || !history.data || history.data.length === 0) {
        return {
            byType: createEmptyActionByType(),
            overall: {
                total: 0,
                success: 0,
                failed: 0,
                successRate: '0.0',
            },
            recentActivities: [],
            zaloLimits: {
                hourly: zaloFromHistory.hourly || 0,
                daily: zaloFromHistory.daily || 0,
                yearly: {
                    total: 200000,
                    used: 0,
                    remaining: 200000,
                },
            },
        };
    }

    const stats = {
        byType: {
            sendMessage: { name: 'Gửi tin nhắn', total: 0, success: 0, failed: 0 },
            addFriend: { name: 'Kết bạn', total: 0, success: 0, failed: 0 },
            findUid: { name: 'Tìm UID', total: 0, success: 0, failed: 0 },
            checkFriend: { name: 'Kiểm tra bạn bè', total: 0, success: 0, failed: 0 },
            tag: { name: 'Gắn thẻ', total: 0, success: 0, failed: 0 },
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

    const currentYear = new Date().getFullYear();
    const yearlyMessagesSent = history.data.filter(log => {
        if (log.type === 'sendMessage' && log.status?.status) {
            const logDate = new Date(log.createdAt);
            return logDate.getFullYear() === currentYear;
        }
        return false;
    }).length;

    stats.zaloLimits.yearly.used = yearlyMessagesSent;
    stats.zaloLimits.yearly.remaining = Math.max(0, 200000 - yearlyMessagesSent);

    for (const type in stats.byType) {
        const typeStats = stats.byType[type];
        typeStats.successRate = typeStats.total > 0 ? ((typeStats.success / typeStats.total) * 100).toFixed(1) : '0.0';
    }
    stats.overall.successRate = stats.overall.total > 0 ? ((stats.overall.success / stats.overall.total) * 100).toFixed(1) : '0.0';

    return {
        ...stats,
        recentActivities: history.data.slice(0, 50)
    };
}
