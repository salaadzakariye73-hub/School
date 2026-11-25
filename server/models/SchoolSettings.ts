import mongoose, { Schema, Document } from 'mongoose';

export interface IGradeRule {
  grade: string;
  minPercent: number;
  remarkEn: string;
  remarkSo: string;
}

export interface ISchoolSettings extends Document {
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolLogoUrl?: string;
  academicYear: string;
  currencyCode: string;
  currencySymbol: string;
  gradingScale: IGradeRule[];
  updatedAt: Date;
}

export const DEFAULT_GRADING_SCALE: IGradeRule[] = [
  { grade: 'A', minPercent: 90, remarkEn: 'Excellent', remarkSo: 'Aad u Wanaagsan' },
  { grade: 'B', minPercent: 80, remarkEn: 'Very Good', remarkSo: 'Wanaagsan' },
  { grade: 'C', minPercent: 70, remarkEn: 'Good', remarkSo: 'Fiican' },
  { grade: 'D', minPercent: 50, remarkEn: 'Pass', remarkSo: 'Baas' },
  { grade: 'F', minPercent: 0, remarkEn: 'Fail', remarkSo: 'Dhacay' },
];

const GradeRuleSchema = new Schema<IGradeRule>(
  {
    grade: { type: String, required: true, trim: true },
    minPercent: { type: Number, required: true, min: 0, max: 100 },
    remarkEn: { type: String, required: true, trim: true },
    remarkSo: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const SchoolSettingsSchema = new Schema<ISchoolSettings>(
  {
    schoolName: { type: String, required: true, trim: true, default: 'Al-Najax School' },
    schoolAddress: { type: String, trim: true, default: 'Mogadishu, Somalia' },
    schoolPhone: { type: String, trim: true, default: '+252 61 000 0000' },
    schoolLogoUrl: { type: String, default: '' },
    academicYear: { type: String, required: true, trim: true, default: '2026-2027' },
    currencyCode: { type: String, required: true, trim: true, default: 'USD' },
    currencySymbol: { type: String, required: true, trim: true, default: '$' },
    gradingScale: { type: [GradeRuleSchema], default: DEFAULT_GRADING_SCALE },
  },
  { timestamps: true }
);

export const SchoolSettings = mongoose.model<ISchoolSettings>('SchoolSettings', SchoolSettingsSchema);

export async function getOrCreateSettings(): Promise<ISchoolSettings> {
  let settings = await SchoolSettings.findOne();
  if (!settings) {
    settings = await SchoolSettings.create({
      schoolName: 'Al-Najax School',
      schoolAddress: 'Mogadishu, Somalia',
      schoolPhone: '+252 61 000 0000',
      schoolLogoUrl: '',
      academicYear: '2026-2027',
      currencyCode: 'USD',
      currencySymbol: '$',
      gradingScale: DEFAULT_GRADING_SCALE,
    });
  }
  return settings;
}
