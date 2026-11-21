const express = require('express');
const router = express.Router();
const {
  createBOM,
  getAllBOMs,
  getBOMById,
  updateBOM,
  deleteBOM,
  reviseBOM,
} = require('../../controller/Merchandise/BOMController');

// Import your authentication middleware so req.user is populated for AuditLog
// const { authenticate } = require('../middlewares/authMiddleware');
// router.use(authenticate);

router.post('/', createBOM);
router.get('/', getAllBOMs);
router.get('/:id', getBOMById);
router.put('/:id', updateBOM);
router.delete('/:id', deleteBOM);
router.post('/:id/revise', reviseBOM);

module.exports = router;