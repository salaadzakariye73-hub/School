import mongoose, { Schema, Document } from 'mongoose';

export interface IExamSchedule extends Document {
  examinationId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  subject: string;
  examDate: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  invigilatorId: mongoose.Types.ObjectId;
  room: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExamScheduleSchema = new Schema<IExamSchedule>(
  {
    examinationId: { type: Schema.Types.ObjectId, ref: 'Examination', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true },
    subject: { type: String, required: true, trim: true },
    examDate: { type: String, required: true, trim: true },
    dayOfWeek: { type: String, required: true, trim: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    invigilatorId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
    room: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

ExamScheduleSchema.index({ examinationId: 1, examDate: 1, startTime: 1 });
ExamScheduleSchema.index({ examinationId: 1, classId: 1, subject: 1 }, { unique: true });
ExamScheduleSchema.index({ classId: 1, examDate: 1 });
ExamScheduleSchema.index({ invigilatorId: 1, examDate: 1 });

export const ExamSchedule = mongoose.model<IExamSchedule>('ExamSchedule', ExamScheduleSchema);
