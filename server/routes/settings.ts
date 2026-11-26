import { Router } from 'express';
import { getOrCreateSettings, type IGradeRule } from '../models/SchoolSettings.js';
import { requireDb } from '../db.js';
import { authenticateJWT, requireRoles } from '../middleware/auth.js';
import { asNumber, asString } from '../utils/sanitize.js';

const router = Router();
router.use(requireDb, authenticateJWT);

router.get('/', async (_req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load school settings.';
    res.status(500).json({ error: message });
  }
});

router.put('/', requireRoles('admin'), async (req, res) => {
  try {
    const settings = await getOrCreateSettings();

    const schoolName = asString(req.body?.schoolName);
    const schoolAddress = asString(req.body?.schoolAddress);
    const schoolPhone = asString(req.body?.schoolPhone);
    const academicYear = asString(req.body?.academicYear);
    const currencyCode = asString(req.body?.currencyCode).toUpperCase();
    const currencySymbol = asString(req.body?.currencySymbol);

    if (schoolName) settings.schoolName = schoolName;
    if (req.body?.schoolAddress !== undefined) settings.schoolAddress = schoolAddress;
    if (req.body?.schoolPhone !== undefined) settings.schoolPhone = schoolPhone;
    if (req.body?.schoolLogoUrl !== undefined) {
      const rawLogo = asString(req.body.schoolLogoUrl);
      settings.schoolLogoUrl =
        rawLogo.startsWith('data:image/') || rawLogo.startsWith('https://') ? rawLogo : '';
    }
    if (academicYear) settings.academicYear = academicYear;
    if (currencyCode) settings.currencyCode = currencyCode;
    if (currencySymbol) settings.currencySymbol = currencySymbol;

    if (Array.isArray(req.body?.gradingScale) && req.body.gradingScale.length > 0) {
      const cleanedScale: IGradeRule[] = [];
      for (const item of req.body.gradingScale) {
        const grade = asString(item?.grade);
        const minPercent = asNumber(item?.minPercent, -1);
        const remarkEn = asString(item?.remarkEn, grade);
        const remarkSo = asString(item?.remarkSo, remarkEn);
        if (grade && minPercent >= 0 && minPercent <= 100) {
          cleanedScale.push({ grade, minPercent, remarkEn, remarkSo });
        }
      }
      if (cleanedScale.length > 0) {
        cleanedScale.sort((a, b) => b.minPercent - a.minPercent);
        settings.gradingScale = cleanedScale;
      }
    }

    await settings.save();
    res.json(settings);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update settings.';
    res.status(500).json({ error: message });
  }
});

export default router;
