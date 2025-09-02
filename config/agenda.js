// config/initAgenda.js

import Agenda from 'agenda';
import connectDB from './connectDB';
import mongoose from 'mongoose';
import { CustomerWorkflow } from '@/models/workflow.model';
import Customer from '@/models/customer.model';
import Zalo from '@/models/zalo.model';
import Logs from '@/models/logs.model';
import { actionZalo } from '@/actions/zalo.action'; // Giả định đường dẫn đến hàm actionZalo

let agendaInstance = null;

const actionMap = {
    'message': 'sendMessage',
    'friendRequest': 'addFriend',
    'checkFriend': 'checkFriend',
    'tag': 'tag',
    'findUid': 'findUid',
};

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
            const customer = await Customer.findById(customerId);
            if (!customer) throw new Error('Customer not found');
            const phone = customer.phone;
            let uidPerson = customer.uid && customer.uid.length > 0 ? customer.uid[0].uid : '';
            const zalo = await Zalo.findOne(); // Giả định lấy Zalo mặc định
            if (!zalo) throw new Error('No Zalo account found');
            const uid = zalo.uid;
            const zaloId = zalo._id;
            const actionType = actionMap[job.attrs.name];
            const message = params?.message || '';
            const response = await actionZalo({ phone, uidPerson, actionType, message, uid });
            await Logs.create({
                status: {
                    status: response.status,
                    message: message || 'Không có tin nhắn gửi đi',
                    data: {
                        error_code: response.content?.error_code,
                        error_message: response.content?.error_message,
                    },
                },
                type: actionType,
                createBy: '68b0af5cf58b8340827174e0',
                customer: customerId,
                zalo: zaloId,
            });
            if (!response.status) throw new Error(response.message || 'Action failed');
            // Cập nhật thêm nếu cần cho action cụ thể
            await updateStepStatus(cwId, job.attrs.name, 'completed');
        } catch (error) {
            await handleJobFailure(job, error, cwId, job.attrs.name);
        }
    });

    // Job friendRequest
    agendaInstance.define('friendRequest', async (job) => {
        const { customerId, params, cwId } = job.attrs.data;
        try {
            const customer = await Customer.findById(customerId);
            if (!customer) throw new Error('Customer not found');
            const phone = customer.phone;
            let uidPerson = customer.uid && customer.uid.length > 0 ? customer.uid[0].uid : '';
            const zalo = await Zalo.findOne(); // Giả định lấy Zalo mặc định
            if (!zalo) throw new Error('No Zalo account found');
            const uid = zalo.uid;
            const zaloId = zalo._id;
            const actionType = actionMap[job.attrs.name];
            const message = params?.message || '';
            const response = await actionZalo({ phone, uidPerson, actionType, message, uid });
            await Logs.create({
                status: {
                    status: response.status,
                    message: message || 'Không có tin nhắn gửi đi',
                    data: {
                        error_code: response.content?.error_code,
                        error_message: response.content?.error_message,
                    },
                },
                type: actionType,
                createBy: '68b0af5cf58b8340827174e0',
                customer: customerId,
                zalo: zaloId,
            });
            if (!response.status) throw new Error(response.message || 'Action failed');
            // Cập nhật isReques nếu thành công
            if (customer.uid.length > 0) {
                customer.uid[0].isReques = 1;
                await customer.save();
            }
            await updateStepStatus(cwId, job.attrs.name, 'completed');
        } catch (error) {
            await handleJobFailure(job, error, cwId, job.attrs.name);
        }
    });

    // Job checkFriend
    agendaInstance.define('checkFriend', async (job) => {
        const { customerId, params, cwId } = job.attrs.data;
        try {
            const customer = await Customer.findById(customerId);
            if (!customer) throw new Error('Customer not found');
            const phone = customer.phone;
            let uidPerson = customer.uid && customer.uid.length > 0 ? customer.uid[0].uid : '';
            const zalo = await Zalo.findOne(); // Giả định lấy Zalo mặc định
            if (!zalo) throw new Error('No Zalo account found');
            const uid = zalo.uid;
            const zaloId = zalo._id;
            const actionType = actionMap[job.attrs.name];
            const message = params?.message || '';
            const response = await actionZalo({ phone, uidPerson, actionType, message, uid });
            await Logs.create({
                status: {
                    status: response.status,
                    message: message || 'Không có tin nhắn gửi đi',
                    data: {
                        error_code: response.content?.error_code,
                        error_message: response.content?.error_message,
                    },
                },
                type: actionType,
                createBy: '68b0af5cf58b8340827174e0',
                customer: customerId,
                zalo: zaloId,
            });
            if (!response.status) throw new Error(response.message || 'Action failed');
            // Cập nhật isFriend dựa trên response (giả định response.content.isFriend)
            const isFriend = response.content?.isFriend || 0;
            if (customer.uid.length > 0) {
                customer.uid[0].isFriend = isFriend ? 1 : 0;
                await customer.save();
            }
            await updateStepStatus(cwId, job.attrs.name, 'completed');
        } catch (error) {
            await handleJobFailure(job, error, cwId, job.attrs.name);
        }
    });

    // Job tag (gắn tag hoặc đổi tên Zalo)
    agendaInstance.define('tag', async (job) => {
        const { customerId, params, cwId } = job.attrs.data;
        try {
            const customer = await Customer.findById(customerId);
            if (!customer) throw new Error('Customer not found');
            const phone = customer.phone;
            let uidPerson = customer.uid && customer.uid.length > 0 ? customer.uid[0].uid : '';
            const zalo = await Zalo.findOne(); // Giả định lấy Zalo mặc định
            if (!zalo) throw new Error('No Zalo account found');
            const uid = zalo.uid;
            const zaloId = zalo._id;
            const actionType = actionMap[job.attrs.name];
            const message = params?.message || '';
            const response = await actionZalo({ phone, uidPerson, actionType, message, uid });
            await Logs.create({
                status: {
                    status: response.status,
                    message: message || 'Không có tin nhắn gửi đi',
                    data: {
                        error_code: response.content?.error_code,
                        error_message: response.content?.error_message,
                    },
                },
                type: actionType,
                createBy: '68b0af5cf58b8340827174e0',
                customer: customerId,
                zalo: zaloId,
            });
            if (!response.status) throw new Error(response.message || 'Action failed');
            // Cập nhật zaloname nếu cần (giả định message là tên)
            if (message) {
                customer.zaloname = message;
                await customer.save();
            }
            await updateStepStatus(cwId, job.attrs.name, 'completed');
        } catch (error) {
            await handleJobFailure(job, error, cwId, job.attrs.name);
        }
    });

    // Job findUid
    agendaInstance.define('findUid', async (job) => {
        const { customerId, params, cwId } = job.attrs.data;
        try {
            const customer = await Customer.findById(customerId);
            if (!customer) throw new Error('Customer not found');
            const phone = customer.phone;
            let uidPerson = customer.uid && customer.uid.length > 0 ? customer.uid[0].uid : '';
            const zalo = await Zalo.findOne();
            if (!zalo) throw new Error('No Zalo account found');
            const uid = zalo.uid;
            const zaloId = zalo._id;
            const actionType = actionMap[job.attrs.name];
            const message = params?.message || '';
            const response = await actionZalo({ phone, uidPerson, actionType, message, uid });
            await Logs.create({
                status: {
                    status: response.status,
                    message: message || 'Không có tin nhắn gửi đi',
                    data: {
                        error_code: response.content?.error_code,
                        error_message: response.content?.error_message,
                    },
                },
                type: actionType,
                createBy: '68b0af5cf58b8340827174e0',
                customer: customerId,
                zalo: zaloId,
            });
            if (!response.status) throw new Error(response.message || 'Action failed');
            // Cập nhật uid nếu tìm thấy (giả định response.content.data.user_id_by_app)
            const foundUid = response.content?.data?.user_id_by_app || response.content?.uid;
            if (foundUid) {
                customer.uid = [{ zalo: zaloId, uid: foundUid, isFriend: 0, isReques: 0 }];
                await customer.save();
            }
            await updateStepStatus(cwId, job.attrs.name, 'completed');
        } catch (error) {
            await handleJobFailure(job, error, cwId, job.attrs.name);
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