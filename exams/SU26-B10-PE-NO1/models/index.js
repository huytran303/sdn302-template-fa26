const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const enrollmentSubSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "Student" },
  status: String,
}, { _id: false });

const attendanceSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: "Student" },
  classId: { type: Schema.Types.ObjectId, ref: "Class" },
  date: Date,
  status: String,
});

const classSchema = new Schema({
  className: String,
  subjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
  lecturerName: String,
  status: String,
  enrollments: [enrollmentSubSchema],
});

const studentSchema = new Schema({
  studentCode: String,
  fullName: String,
  email: String,
});

const subjectSchema = new Schema({
  code: String,
  name: String,
  credits: Number,
  status: String,
});

const Attendance = mongoose.model("Attendance", attendanceSchema, "attendances");
const Class = mongoose.model("Class", classSchema, "classes");
const Student = mongoose.model("Student", studentSchema, "students");
const Subject = mongoose.model("Subject", subjectSchema, "subjects");

module.exports = { Attendance, Class, Student, Subject };
