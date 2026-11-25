import mongoose, { Schema, Document } from 'mongoose';

export type HomeworkStatus = 'Assigned' | 'Completed' | 'Reviewed';

export interface IHomework extends Document {
  classId: mongoose.Types.ObjectId;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  status: HomeworkStatus;
  assignedBy: mongoose.Types.ObjectId;
  assignedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const HomeworkSchema = new Schema<IHomework>(
  {
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true },
    subject: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    dueDate: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Assigned', 'Completed', 'Reviewed'],
      default: 'Assigned',
    },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedByName: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

HomeworkSchema.index({ classId: 1, dueDate: -1 });

export const Homework = mongoose.model<IHomework>('Homework', HomeworkSchema);
