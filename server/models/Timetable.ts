import mongoose, { Schema, Document } from 'mongoose';

export type SchoolDay =
  | 'Saturday'
  | 'Sunday'
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday';

export interface ITimetable extends Document {
  classId: mongoose.Types.ObjectId;
  dayOfWeek: SchoolDay;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: string;
  teacherId?: mongoose.Types.ObjectId | null;
  room: string;
  createdAt: Date;
  updatedAt: Date;
}

const TimetableSchema = new Schema<ITimetable>(
  {
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true },
    dayOfWeek: {
      type: String,
      enum: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      required: true,
    },
    periodNumber: { type: Number, required: true, min: 1, max: 10 },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null },
    room: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

TimetableSchema.index({ classId: 1, dayOfWeek: 1, periodNumber: 1 }, { unique: true });

export const Timetable = mongoose.model<ITimetable>('Timetable', TimetableSchema);
