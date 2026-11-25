import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent' | 'accountant';

export interface IUser extends Document {
  name: string;
  username?: string;
  email?: string;
  passwordHash: string;
  role: UserRole;
  teacherRef?: mongoose.Types.ObjectId | null;
  studentRef?: mongoose.Types.ObjectId | null;
  childrenRefs?: mongoose.Types.ObjectId[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'student', 'parent', 'accountant'],
      required: true,
    },
    teacherRef: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null },
    studentRef: { type: Schema.Types.ObjectId, ref: 'Student', default: null },
    childrenRefs: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
