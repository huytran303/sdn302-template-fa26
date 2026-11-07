const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const { connectDb } = require('./dal/database');
const { Attendance, Class, Student } = require('./models');
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT'];

// Shared: validate :classId and load the class, or send 400/404 and return null
const loadClass = async (req, res) => {
    const { classId } = req.params;
    if (!isValidId(classId)) { res.status(400).json({ error: `Invalid classId: ${classId}` }); return null; }
    const cls = await Class.findById(classId).lean();
    if (!cls) { res.status(404).json({ error: `Class with id = ${classId} not found` }); return null; }
    return cls;
};

app.get('/api', (req, res) => {
    res.status(200).json({ message: `Welcome Express server` });
});

// Q1: GET /api/classes/:classId/students?status=enrolled
app.get('/api/classes/:classId/students', async (req, res) => {
    const cls = await loadClass(req, res);
    if (!cls) return;

    const { status } = req.query;
    if (!['enrolled', 'dropped'].includes(status)) return res.status(400).json({ error: `Invalid status: ${status}` });

    const ids = cls.enrollments.filter(e => e.status === status).map(e => e.studentId);
    const students = await Student.find({ _id: { $in: ids } }).lean();
    const byId = new Map(students.map(s => [String(s._id), s]));

    const result = ids.map(id => byId.get(String(id))).filter(Boolean)
        .map(s => ({ id: s._id, studentCode: s.studentCode, fullName: s.fullName, email: s.email }));
    res.status(200).json(result);
});

// Q2: GET /api/classes/:classId/attendance-summary
app.get('/api/classes/:classId/attendance-summary', async (req, res) => {
    const cls = await loadClass(req, res);
    if (!cls) return;

    const ids = cls.enrollments.filter(e => e.status === 'enrolled').map(e => e.studentId);
    const students = await Student.find({ _id: { $in: ids } }).lean();
    const attendances = await Attendance.find({ classId: cls._id }).lean();

    const result = students.map(s => {
        const mine = attendances.filter(a => String(a.studentId) === String(s._id));
        const totalSessions = mine.length;
        const present = mine.filter(a => a.status === 'PRESENT').length;
        const absent = mine.filter(a => a.status === 'ABSENT').length;
        const rate = totalSessions ? Math.round(present / totalSessions * 1000) / 10 : 0;
        return {
            studentCode: s.studentCode,
            fullName: s.fullName,
            totalSessions,
            present,
            absent,
            attendanceRate: JSON.rawJSON(rate.toFixed(1)), // keeps 90.0 as a number in the JSON output
            warning: rate < 80,
        };
    });
    res.status(200).json(result);
});

// Q3: GET /api/students/:studentId/attendances
app.get('/api/students/:studentId/attendances', async (req, res) => {
    const { studentId } = req.params;
    if (!isValidId(studentId)) return res.status(400).json({ error: `Invalid studentId: ${studentId}` });
    if (!(await Student.exists({ _id: studentId }))) return res.status(404).json({ error: `Student with id = ${studentId} not found` });

    const attendances = await Attendance.find({ studentId })
        .sort({ date: -1, _id: -1 })
        .populate({ path: 'classId', select: 'className subjectId', populate: { path: 'subjectId', select: 'name' } })
        .lean();

    const result = attendances.map(a => ({
        id: a._id,
        className: a.classId?.className ?? null,
        subjectName: a.classId?.subjectId?.name ?? null,
        date: a.date,
        status: a.status,
    }));
    res.status(200).json(result);
});

// Q4: POST /api/classes/:classId/attendances (upsert)
app.post('/api/classes/:classId/attendances', async (req, res) => {
    const cls = await loadClass(req, res);
    if (!cls) return;

    const { date, records } = req.body ?? {};
    if (!date) return res.status(400).json({ error: 'Date is required' });
    const sessionDate = new Date(date);
    if (sessionDate > new Date()) return res.status(400).json({ error: 'Date cannot be in the future' });

    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'Records are required and cannot be empty' });

    // Validate everything before writing -> nothing is saved if one record is invalid
    const enrolled = cls.enrollments.filter(e => e.status === 'enrolled').map(e => String(e.studentId));
    const submitted = records.map(r => String(r.studentId));

    const missingId = enrolled.find(id => !submitted.includes(id));
    if (missingId) {
        const s = await Student.findById(missingId).lean();
        return res.status(400).json({ error: `Missing attendance for student ${s.studentCode} (${s.fullName})` });
    }

    const notMember = submitted.find(id => !enrolled.includes(id));
    if (notMember) return res.status(400).json({ error: `Student ${notMember} does not belong to class` });

    const badStatus = records.find(r => !ATTENDANCE_STATUSES.includes(r.status));
    if (badStatus) return res.status(400).json({ error: `Invalid status: ${badStatus.status}` });

    const writeResult = await Attendance.bulkWrite(records.map(r => ({
        updateOne: {
            filter: { classId: cls._id, studentId: r.studentId, date: sessionDate },
            update: { $set: { status: r.status } },
            upsert: true,
        },
    })));

    const present = records.filter(r => r.status === 'PRESENT').length;
    const result = {
        message: 'Attendance recorded successfully',
        totalRecords: records.length,
        present,
        absent: records.length - present,
        updatedCount: writeResult.matchedCount,
    };
    res.status(201).json(result);
});

app.use((err, req, res, next) => {
    if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message });
});

(async () => {
    try {
        await connectDb();
        app.listen(process.env.PORT, () => {
            console.log(`API chạy tại http://localhost:${process.env.PORT}/api`);
        });
    } catch (error) {
        console.error(`Không khởi động được server: `, error.message);
        process.exit(1);
    }
})()
