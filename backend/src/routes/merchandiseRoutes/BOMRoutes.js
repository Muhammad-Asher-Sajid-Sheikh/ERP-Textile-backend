import express from 'express';
// const router = express.Router();
import {
  createBOM,
  getAllBOMs,
  getBOMById,
  updateBOM,
  deleteBOM,
  reviseBOM,
} from '../../controller/Merchandise/BOMController.js';

const router = express.Router();

// Import your authentication middleware so req.user is populated for AuditLog
// import { authenticate } from '../middlewares/authMiddleware.js';
// router.use(authenticate);

router.post('/', createBOM);
router.get('/', getAllBOMs);
router.get('/:id', getBOMById);
router.put('/:id', updateBOM);
router.delete('/:id', deleteBOM);
router.post('/:id/revise', reviseBOM);

export default router;