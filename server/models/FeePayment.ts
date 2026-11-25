import mongoose, { Schema, Document } from 'mongoose';

export type PaymentMethod = 'Cash' | 'EVC Plus' | 'Zaad' | 'Sahal' | 'Bank Transfer';

export interface IFeePayment extends Document {
  receiptNumber: string;
  studentId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  academicYear: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes: string;
  recordedBy: mongoose.Types.ObjectId;
  recordedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeePaymentSchema = new Schema<IFeePayment>(
  {
    receiptNumber: { type: String, required: true, unique: true, trim: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Classroom', required: true },
    academicYear: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentDate: { type: String, required: true, trim: true },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'EVC Plus', 'Zaad', 'Sahal', 'Bank Transfer'],
      default: 'Cash',
    },
    notes: { type: String, trim: true, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedByName: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

FeePaymentSchema.index({ studentId: 1, paymentDate: -1 });

export const FeePayment = mongoose.model<IFeePayment>('FeePayment', FeePaymentSchema);
