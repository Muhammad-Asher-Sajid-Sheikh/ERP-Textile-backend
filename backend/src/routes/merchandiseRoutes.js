import express from 'express';
import { 
    createPpsRecord, 
    getAllPPS, 
    getPPSById,
    updatePpsRecord,
    markPPSAsDone
} from '../controller/merchandiseController.js';

const router = express.Router();

// Routes for Pre-Production Sample (PPS) management
router.post('/pps', createPpsRecord);
router.get('/pps', getAllPPS);
router.get('/pps/:id', getPPSById);
router.put('/pps/:id', updatePpsRecord);
router.patch('/pps/:id/mark-done', markPPSAsDone);

export default router;