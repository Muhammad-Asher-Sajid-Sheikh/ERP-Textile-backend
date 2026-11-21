import express from 'express';
const router = express.Router();
import {
  createBOM,
  getAllBOMs,
  getBOMById,
  updateBOM,
  deleteBOM,
  reviseBOM,
} from '../../controller/Merchandise/BOMController';

// Import your authentication middleware so req.user is populated for AuditLog
// const { authenticate } = require('../middlewares/authMiddleware');
// router.use(authenticate);

router.post('/', createBOM);
router.get('/', getAllBOMs);
router.get('/:id', getBOMById);
router.put('/:id', updateBOM);
router.delete('/:id', deleteBOM);
router.post('/:id/revise', reviseBOM);

export default router;