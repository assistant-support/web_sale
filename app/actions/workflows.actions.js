'use server';
import initAgenda from '@/config/agenda';
import { CustomerWorkflow, WorkflowTemplate } from '@/models/workflows.model';
import connectDB from '@/config/connectDB';

export async function createWorkflowForCustomer(formData) {
    try {
        await connectDB();
        const customerId = formData.get('customerId');
        const templateId = formData.get('templateId');
        
        if (!customerId) {
            return { success: false, error: 'Thiếu customerId' };
        }
        
        if (!templateId) {
            return { success: false, error: 'Thiếu templateId' };
        }
        
        const agenda = await initAgenda(); // Init nếu chưa

        // Chạy action mặc định ngay
        await agenda.now('findUIDAndAddCustomer', { customerData: { id: customerId } });

        // Tạo CustomerWorkflow instance
        const template = await WorkflowTemplate.findById(templateId);
        if (!template) {
            return { success: false, error: 'Không tìm thấy workflow template' };
        }
        
        const startTime = Date.now();
        const steps = template.steps.map(step => ({
            action: step.action,
            scheduledTime: new Date(startTime + step.delay),
            status: 'pending',
            params: step.params,
            retryCount: 0
        }));

        // Schedule jobs cho từng step
        for (const step of steps) {
            await agenda.schedule(step.scheduledTime, step.action, { customerId, params: step.params, cwId: null });
        }

        // Lưu instance với đầy đủ các field required
        const workflow = new CustomerWorkflow({ 
            customerId, 
            templateId,
            startTime: new Date(startTime),
            steps, 
            nextStepTime: steps[0]?.scheduledTime || new Date(),
            status: 'active'
        });
        await workflow.save();
        
        return { success: true, workflowId: workflow._id };
    } catch (error) {
        console.error('[createWorkflowForCustomer] Lỗi:', error);
        return { success: false, error: error.message || 'Lỗi không xác định' };
    }
}