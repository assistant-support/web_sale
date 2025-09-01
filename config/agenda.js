// config/initAgenda.js

import Agenda from 'agenda';
import connectDB from './connectDB';
import mongoose from 'mongoose';
import CustomerWorkflow from '@/models/workflow.model'

let agendaInstance = null;

const initAgenda = async () => {
    if (agendaInstance) return agendaInstance;

    await connectDB();

    agendaInstance = new Agenda({
        mongo: mongoose.connection.getClient(),
        collection: 'agendaJobs',
        defaultConcurrency: 5,
        maxConcurrency: 20,
        defaultLockLimit: 0,
        processEvery: '1 minute',
        lockLifetime: 10000,
    });

    // Job message
    agendaInstance.define('message', { priority: 'high', concurrency: 10 }, async (job) => {
        const { customerId, params, cwId } = job.attrs.data;
        try {
            // sendMessage(customerId, params.message); // Giả định hàm gửi tin Zalo
            await updateStepStatus(cwId, 'message', 'completed');
        } catch (error) {
            await handleJobFailure(job, error, cwId, 'message');
        }
    });

    // Job friendRequest
    agendaInstance.define('friendRequest', async (job) => {
        const { customerId, params, cwId } = job.attrs.data;
        try {
            // sendFriendRequest(customerId);
            await updateStepStatus(cwId, 'friendRequest', 'completed');
        } catch (error) {
            await handleJobFailure(job, error, cwId, 'friendRequest');
        }
    });

    // Job checkFriend
    agendaInstance.define('checkFriend', async (job) => {
        const { customerId, params, cwId } = job.attrs.data;
        try {
            // const status = checkFriendStatus(customerId);
            // Nếu not friend, có thể trigger friendRequest
            await updateStepStatus(cwId, 'checkFriend', 'completed');
        } catch (error) {
            await handleJobFailure(job, error, cwId, 'checkFriend');
        }
    });

    // Job tag (gắn tag hoặc đổi tên Zalo)
    agendaInstance.define('tag', async (job) => {
        const { customerId, params, cwId } = job.attrs.data;
        try {
            // changeZaloName(customerId, params.message); // Hoặc gắn tag CRM
            await updateStepStatus(cwId, 'tag', 'completed');
        } catch (error) {
            await handleJobFailure(job, error, cwId, 'tag');
        }
    });

    // Failure handler
    agendaInstance.on('fail', (err, job) => {
        console.error(`Công việc ${job.attrs.name} thất bại:`, err);
    });

    await agendaInstance.start();
    return agendaInstance;
};

// Helper update status step
async function updateStepStatus(cwId, action, status) {
    const cw = await CustomerWorkflow.findById(cwId);
    const step = cw.steps.find(s => s.action === action && s.status === 'pending');
    if (step) {
        step.status = status;
        cw.nextStepTime = cw.steps.find(s => s.status === 'pending')?.scheduledTime || null;
        if (cw.steps.every(s => s.status === 'completed')) cw.status = 'completed';
        await cw.save();
    }
}

// Handle failure with retry
async function handleJobFailure(job, error, cwId, action) {
    const cw = await CustomerWorkflow.findById(cwId);
    const step = cw.steps.find(s => s.action === action);
    if (step) {
        step.retryCount += 1;
        if (step.retryCount < 3) {
            // Retry sau 5 min
            job.schedule(new Date(Date.now() + 300000));
            await job.save();
        } else {
            step.status = 'failed';
            await updateStepStatus(cwId, action, 'failed');
        }
        await cw.save();
    }
    console.error(`Error in ${action}:`, error);
}

export default initAgenda;