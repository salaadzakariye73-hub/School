import mongoose, { Schema, Document } from 'mongoose';

export interface ITeacher extends Document {
  teacherId: string;
  fullName: string;
  phone: string;
  email: string;
  assignedSubjects: string[];
  assignedClasses: mongoose.Types.ObjectId[];
  status: 'Active' | 'Inactive';
  photoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherSchema = new Schema<ITeacher>(
  {
    teacherId: { type: String, required: true, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    assignedSubjects: { type: [String], default: [] },
    assignedClasses: [{ type: Schema.Types.ObjectId, ref: 'Classroom' }],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    photoUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Teacher = mongoose.model<ITeacher>('Teacher', TeacherSchema);
