const mongoose = require("mongoose");

const connectDb = async(uri = process.env.MONGO_URI) => {
    if(!uri)
        throw new Error("Thiếu biến môi trường MONGO_URI (xem .env file)");
    await mongoose.connect(uri);
    console.log(`Đã kết nối CSDL: `, mongoose.connection.name);
    return mongoose.connection;
}

const disconnectDb = async () => {
    await mongoose.disconnect();
}

module.exports = {connectDb, disconnectDb};