import mongoose, { Schema, Document } from 'mongoose';

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused';

export interface IAttendanceRecord {
  studentId: mongoose.Types.ObjectId;
  status: AttendanceStatus;
  note?: string;
}

export interface IAttendance extends Document {
  classId: mongoose.Types.ObjectId;
  date: string;
  records: IAttendanceRecord[];
  recordedBy: mongoose.Types.ObjectId;
  lockedForTeacher?: boolean;
  submittedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    status: { type: String, enum: ['Present', 'Absent', 'Late', 'Excused'], required: true },
    note: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const AttendanceSchema = new Schema<IAttendance>(
  {
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true },
    date: { type: String, required: true, trim: true },
    records: { type: [AttendanceRecordSchema], default: [] },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lockedForTeacher: { type: Boolean, default: false },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AttendanceSchema.index({ classId: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model<IAttendance>('Attendance', AttendanceSchema);
