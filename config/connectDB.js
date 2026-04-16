import mongoose from 'mongoose';

let isConnected = false;
/** true sau khi seed chạy xong không lỗi (kể cả khi không cần insert). */
let labelCallSeedFinished = false;
/** chống re-entry khi nhiều request đồng thời gọi connectDB lúc app vừa khởi động */
let labelCallSeedInProgress = false;

async function ensureLabelCallAfterConnect() {
    if (labelCallSeedFinished || labelCallSeedInProgress) return;
    labelCallSeedInProgress = true;
    try {
        const { ensureLabelCallDefaults } = await import('../lib/ensureLabelCallDefaults.js');
        // LUU Y: ham seed nay KHONG duoc goi connectDB ben trong de tranh de quy vo han.
        await ensureLabelCallDefaults();
        labelCallSeedFinished = true;
    } catch (e) {
        console.error('[connectDB] ensure labelCall defaults:', e?.message || e);
    } finally {
        labelCallSeedInProgress = false;
    }
}

const connectDB = async () => {
    if (isConnected) {
        if (!labelCallSeedFinished) await ensureLabelCallAfterConnect();
        return;
    }

    if (mongoose.connections[0].readyState) {
        isConnected = true;
        await ensureLabelCallAfterConnect();
        return;
    }

    const uri = process.env.MongoDB_URI || process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Missing MongoDB_URI or MONGODB_URI in environment');
    }

    try {
        const db = await mongoose.connect(uri);
        isConnected = db.connections[0].readyState === 1;
        await ensureLabelCallAfterConnect();
    } catch (error) {
        throw new Error('Failed to connect to MongoDB' + error);
    }
};

export default connectDB;
