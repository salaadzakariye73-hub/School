import mongoose, { Schema, Document } from 'mongoose';
import type { PaymentMethod } from './FeePayment.js';

export type ExpenseCategory =
  | 'Salaries'
  | 'Utilities'
  | 'Supplies'
  | 'Maintenance'
  | 'Rent'
  | 'Other';

export interface IExpense extends Document {
  title: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  notes: string;
  recordedBy: mongoose.Types.ObjectId;
  recordedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Salaries', 'Utilities', 'Supplies', 'Maintenance', 'Rent', 'Other'],
      default: 'Other',
    },
    amount: { type: Number, required: true, min: 0.01 },
    expenseDate: { type: String, required: true, trim: true },
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

ExpenseSchema.index({ expenseDate: -1 });

export const Expense = mongoose.model<IExpense>('Expense', ExpenseSchema);
