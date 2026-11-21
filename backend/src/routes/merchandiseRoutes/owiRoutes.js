import express from 'express';
const router = express.Router();
import {
  createOWI,
  getAllOWIs,
  readById,
  updateOWI,
  deleteOWI,
} from '../../controller/Merchandise/OWIController';

import {
  createOWIStages,
  getAllOWIStages,
  getOWIStageById,
  updateOWIStages,
  deleteOWIStages,
} from '../../controller/Merchandise/OWIStageController';

// Import your authentication middleware so req.user is populated for AuditLog
// const { authenticate } = require('../middlewares/authMiddleware');
// router.use(authenticate);

router.post('/', createOWI);
router.get('/', getAllOWIs);
router.get('/:id', readById);
router.put('/:id', updateOWI);
router.delete('/:id', deleteOWI);

router.post('/stages', createOWIStages);
router.get('/stages', getAllOWIStages);
router.get('/stages/:id', getOWIStageById);
router.put('/stages/:id', updateOWIStages);
router.delete('/stages/:id', deleteOWIStages);

export default router;