import mongoose, { Schema, Document } from 'mongoose';

export interface IClassroom extends Document {
  name: string;
  academicYear: string;
  classTeacherId?: mongoose.Types.ObjectId | null;
  subjects: string[];
  tuitionFee: number;
  createdAt: Date;
  updatedAt: Date;
}

const ClassroomSchema = new Schema<IClassroom>(
  {
    name: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true },
    classTeacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null },
    subjects: { type: [String], default: [] },
    tuitionFee: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

ClassroomSchema.index({ name: 1, academicYear: 1 }, { unique: true });

export const Classroom = mongoose.model<IClassroom>('Classroom', ClassroomSchema);
