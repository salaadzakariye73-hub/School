import mongoose, { Schema, Document } from 'mongoose';

export interface IStudentMark {
  studentId: mongoose.Types.ObjectId;
  score: number;
}

export interface IExamResult extends Document {
  examName: string;
  academicYear: string;
  classId: mongoose.Types.ObjectId;
  subject: string;
  maxMarks: number;
  marks: IStudentMark[];
  recordedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentMarkSchema = new Schema<IStudentMark>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    score: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ExamResultSchema = new Schema<IExamResult>(
  {
    examName: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true },
    subject: { type: String, required: true, trim: true },
    maxMarks: { type: Number, required: true, min: 1, default: 100 },
    marks: { type: [StudentMarkSchema], default: [] },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ExamResultSchema.index({ examName: 1, classId: 1, subject: 1 }, { unique: true });

export const ExamResult = mongoose.model<IExamResult>('ExamResult', ExamResultSchema);
