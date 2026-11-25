import mongoose, { Schema, Document } from 'mongoose';

export interface ITerm {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface IAcademicYear extends Document {
  name: string;
  isCurrent: boolean;
  status: 'Active' | 'Archived';
  terms: ITerm[];
  createdAt: Date;
  updatedAt: Date;
}

const TermSchema = new Schema<ITerm>(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true, trim: true },
    endDate: { type: String, required: true, trim: true },
    isCurrent: { type: Boolean, default: false },
  },
  { _id: false }
);

const AcademicYearSchema = new Schema<IAcademicYear>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isCurrent: { type: Boolean, default: false },
    status: { type: String, enum: ['Active', 'Archived'], default: 'Active' },
    terms: { type: [TermSchema], default: [] },
  },
  { timestamps: true }
);

export const AcademicYear = mongoose.model<IAcademicYear>('AcademicYear', AcademicYearSchema);
