import express from 'express';
const router = express.Router();
import {
  createBOMItem,
  getAllBOMItems,
  getBOMItemsByOrderBomId,
  updateBOMItem,
  deleteBOMItem,
} from '../../controller/Merchandise/BOMItemController';

// Import your authentication middleware so req.user is populated for AuditLog
// const { authenticate } = require('../middlewares/authMiddleware');
// router.use(authenticate);

router.post('/', createBOMItem);
router.get('/', getAllBOMItems);
router.get('/bom/:orderBomId', getBOMItemsByOrderBomId);
router.put('/:id', updateBOMItem);
router.delete('/:id', deleteBOMItem);

export default router;