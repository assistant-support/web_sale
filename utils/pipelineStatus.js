/**
 * Utility functions for pipelineStatus management
 * Đảm bảo chỉ cập nhật pipelineStatus khi step mới lớn hơn step hiện tại
 */

/**
 * Lấy step number từ pipelineStatus string
 * Ví dụ: 'valid_1' -> 1, 'msg_success_2' -> 2, 'noikhoa_3' -> 3
 * @param {string} pipelineStatus - Trạng thái pipeline (ví dụ: 'valid_1', 'msg_success_2')
 * @returns {number|null} - Step number hoặc null nếu không tìm thấy
 */
export function getPipelineStep(pipelineStatus) {
    if (!pipelineStatus || typeof pipelineStatus !== 'string') {
        return null;
    }
    
    // Tìm số ở cuối string (sau dấu _)
    const match = pipelineStatus.match(/_(\d+)$/);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    
    return null;
}

/**
 * So sánh step của hai pipelineStatus
 * @param {string} currentStatus - Trạng thái hiện tại
 * @param {string} newStatus - Trạng thái mới
 * @returns {boolean} - true nếu step mới > step hiện tại, false nếu ngược lại hoặc không so sánh được
 */
export function shouldUpdatePipelineStatus(currentStatus, newStatus) {
    const currentStep = getPipelineStep(currentStatus);
    const newStep = getPipelineStep(newStatus);
    
    // Nếu không lấy được step từ một trong hai, cho phép cập nhật (fallback)
    if (currentStep === null || newStep === null) {
        return true; // Cho phép cập nhật nếu không so sánh được
    }
    
    // Chỉ cập nhật nếu step mới > step hiện tại
    return newStep > currentStep;
}

/**
 * Lấy pipelineStatus hiện tại từ customer document
 * @param {object} customer - Customer document
 * @returns {string|null} - PipelineStatus hiện tại hoặc null
 */
export function getCurrentPipelineStatus(customer) {
    if (!customer) {
        return null;
    }
    
    // Ưu tiên lấy từ pipelineStatus[0] (trạng thái chính)
    if (Array.isArray(customer.pipelineStatus) && customer.pipelineStatus[0]) {
        return customer.pipelineStatus[0];
    }
    
    // Fallback: nếu là string
    if (typeof customer.pipelineStatus === 'string') {
        return customer.pipelineStatus;
    }
    
    return null;
}

/**
 * Kiểm tra và trả về pipelineStatus mới nếu hợp lệ, hoặc trả về null nếu không nên cập nhật
 * @param {object} customer - Customer document
 * @param {string} newStatus - Trạng thái mới muốn cập nhật
 * @returns {string|null} - Trạng thái mới nếu hợp lệ, null nếu không nên cập nhật
 */
export function validatePipelineStatusUpdate(customer, newStatus) {
    if (!newStatus) {
        return null;
    }
    
    const currentStatus = getCurrentPipelineStatus(customer);
    
    // Nếu không có trạng thái hiện tại, cho phép cập nhật
    if (!currentStatus) {
        return newStatus;
    }
    
    // Kiểm tra xem có nên cập nhật không
    if (shouldUpdatePipelineStatus(currentStatus, newStatus)) {
        return newStatus;
    }
    
    // Không cập nhật nếu step mới <= step hiện tại
    return null;
}

