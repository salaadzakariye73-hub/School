import mongoose, { Schema, Document } from 'mongoose';

export type ExaminationStatus = 'Upcoming' | 'Ongoing' | 'Completed';

export interface IExamination extends Document {
  name: string;
  academicYear: string;
  term: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  description: string;
  status: ExaminationStatus;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ExaminationSchema = new Schema<IExamination>(
  {
    name: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true },
    term: { type: String, required: true, trim: true },
    startDate: { type: String, required: true, trim: true },
    endDate: { type: String, required: true, trim: true },
    totalDays: { type: Number, required: true, min: 1 },
    description: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['Upcoming', 'Ongoing', 'Completed'],
      default: 'Upcoming',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

ExaminationSchema.index({ name: 1, academicYear: 1, term: 1 }, { unique: true });
ExaminationSchema.index({ status: 1, startDate: 1 });

export const Examination = mongoose.model<IExamination>('Examination', ExaminationSchema);
