import mongoose, { Schema, Document } from 'mongoose';

export type StudentStatus = 'Active' | 'Inactive' | 'Graduated' | 'Transferred';

export interface IPromotionRecord {
  fromYear: string;
  fromClassName: string;
  toYear: string;
  toClassName: string;
  promotedAt: string;
}

export interface IStudent extends Document {
  studentId: string;
  fullName: string;
  gender: 'Male' | 'Female';
  dateOfBirth: string;
  parentName: string;
  parentPhone: string;
  address?: string;
  classId: mongoose.Types.ObjectId;
  academicYear: string;
  admissionDate: string;
  status: StudentStatus;
  customFeeOverride?: number | null;
  photoUrl?: string;
  promotionHistory: IPromotionRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const PromotionRecordSchema = new Schema<IPromotionRecord>(
  {
    fromYear: { type: String, required: true },
    fromClassName: { type: String, required: true },
    toYear: { type: String, required: true },
    toClassName: { type: String, required: true },
    promotedAt: { type: String, required: true },
  },
  { _id: false }
);

const StudentSchema = new Schema<IStudent>(
  {
    studentId: { type: String, required: true, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['Male', 'Female'], required: true },
    dateOfBirth: { type: String, required: true, trim: true },
    parentName: { type: String, required: true, trim: true },
    parentPhone: { type: String, required: true, trim: true },
    address: { type: String, default: '', trim: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true },
    academicYear: { type: String, required: true, trim: true },
    admissionDate: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Graduated', 'Transferred'],
      default: 'Active',
    },
    customFeeOverride: { type: Number, min: 0, default: null },
    photoUrl: { type: String, default: '' },
    promotionHistory: { type: [PromotionRecordSchema], default: [] },
  },
  { timestamps: true }
);

StudentSchema.index({ classId: 1, status: 1 });
StudentSchema.index({ fullName: 1 });

export const Student = mongoose.model<IStudent>('Student', StudentSchema);
