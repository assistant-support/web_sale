import mongoose from 'mongoose';

let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    console.log(isConnected);
    console.log(process.env.MongoDB_URI);

    if (mongoose.connections[0].readyState) { isConnected = true; return }
    try {
        const db = await mongoose.connect(process.env.MongoDB_URI, {
            dbName: 'data'
        });
        isConnected = db.connections[0].readyState === 1;
    } catch (error) { throw new Error('Failed to connect to MongoDB' + error) }
};

export default connectDB;
