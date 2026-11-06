const express = require('express');
const morgan = require('morgan');
const Schema = mongoose.Schema;
const { connectDb } = require('./dal/database');
const isValidId = (id) => mongoose.isObjectIdOrHexString(id);

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(morgan("dev"));

app.get('/api', async(req,resp,next) => {
    try {
        resp.status(200).json({message:`Welcome Express server`});
    } catch (error) {
        next(error);
    }
});


(async()=>{
    try {
        await connectDb();
        const server = app.listen(process.env.PORT, () => {
            console.log(`API chạy tại http://localhost:${process.env.PORT}/api`);
        });
        
    } catch (error) {
        console.error(`Không khởi động được server: `, error.message);
        process.exit(1);
    }
})()