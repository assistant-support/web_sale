/**
 * Normalize service detail data (cũ hoặc mới) về format chuẩn
 * @param {Object} sd - Service detail từ database
 * @returns {Object} NormalizedServiceDetail
 */
function normalizeServiceDetail(sd) {
    // ===== DATA MỚI =====
    if (
        Array.isArray(sd.sessionsUsed) &&
        sd.selectedCourse?.totalSessions
    ) {
        return {
            serviceName: typeof sd.selectedService === 'string' 
                ? sd.selectedService 
                : (sd.selectedService?.name || 'Không rõ dịch vụ'),
            totalSessions: sd.selectedCourse.totalSessions,
            usedSessions: sd.sessionsUsed.map(s => ({
                doneAt: s.doneAt || sd.closedAt || sd.createdAt,
                sourceId: s.serviceDetailId || sd._id,
                courseName: sd.selectedCourse?.name || ''
            }))
        };
    }

    // ===== DATA CŨ =====
    // Lấy service name
    let serviceName = 'Không rõ dịch vụ';
    if (typeof sd.selectedService === 'string') {
        serviceName = sd.selectedService;
    } else if (sd.selectedService?.name) {
        serviceName = sd.selectedService.name;
    }

    return {
        serviceName,
        totalSessions: 1, // Mỗi record = 1 buổi
        usedSessions: [
            {
                doneAt: sd.closedAt || sd.createdAt,
                sourceId: sd._id,
                courseName: sd.selectedCourse?.name || ''
            }
        ]
    };
}

module.exports = normalizeServiceDetail;

