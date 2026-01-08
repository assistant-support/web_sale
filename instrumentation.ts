export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Chỉ chạy trên server-side
        console.log('[instrumentation] 🚀 Khởi tạo Agenda job scheduler...');
        
        try {
            const { default: initAgenda } = await import('./config/agenda.js');
            await initAgenda();
            console.log('[instrumentation] ✅ Agenda đã được khởi tạo thành công.');
        } catch (error) {
            console.error('[instrumentation] ❌ Lỗi khi khởi tạo Agenda:', error);
        }
        
        // Khởi tạo scheduler cho Zalo actions
        try {
            console.log('[instrumentation] 🚀 Khởi tạo Zalo Action Scheduler...');
            startZaloActionScheduler();
            console.log('[instrumentation] ✅ Zalo Action Scheduler đã được khởi tạo thành công.');
        } catch (error) {
            console.error('[instrumentation] ❌ Lỗi khi khởi tạo Zalo Action Scheduler:', error);
        }
    }
}

/**
 * Khởi tạo scheduler để xử lý các task Zalo đến hạn
 * Gọi mỗi 30 giây để đảm bảo các task được xử lý kịp thời
 */
function startZaloActionScheduler() {
    // Gọi ngay lần đầu để xử lý các task đã đến hạn
    triggerScheduler();
    
    // Sau đó gọi mỗi 30 giây
    setInterval(() => {
        triggerScheduler();
    }, 30000); // 30 giây
}

/**
 * Gọi trực tiếp hàm xử lý scheduler (không qua HTTP)
 */
async function triggerScheduler() {
    try {
        // Import và gọi trực tiếp hàm xử lý
        const { processScheduledTasks } = await import('./app/api/(zalo)/action/route.js');
        if (processScheduledTasks) {
            await processScheduledTasks();
        }
    } catch (error) {
        // Bỏ qua lỗi để không làm crash server
        console.error('[Scheduler] Lỗi khi trigger scheduler:', error.message);
    }
}

