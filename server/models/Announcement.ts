import mongoose, { Schema, Document } from 'mongoose';

export type AnnouncementTarget = 'all' | 'student' | 'teacher' | 'parent' | 'accountant' | 'class';
export type AnnouncementCategory = 'Notice' | 'Holiday' | 'Exam' | 'Update';

export interface IAnnouncement extends Document {
  title: string;
  content: string;
  category: AnnouncementCategory;
  targetRole: AnnouncementTarget;
  targetClassId?: mongoose.Types.ObjectId | null;
  eventDate?: string;
  authorName: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Notice', 'Holiday', 'Exam', 'Update'],
      default: 'Notice',
    },
    targetRole: {
      type: String,
      enum: ['all', 'student', 'teacher', 'parent', 'accountant', 'class'],
      default: 'all',
    },
    targetClassId: { type: Schema.Types.ObjectId, ref: 'Classroom', default: null },
    eventDate: { type: String, trim: true, default: '' },
    authorName: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

AnnouncementSchema.index({ createdAt: -1 });

export const Announcement = mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
