import express from 'express';
import { 
    createPpsRecord, 
    getAllPPS, 
    getPPSById,
    updatePpsRecord,
    markPPSAsDone,

    createTimeActionPlan, 
    upsertTimeActionStages,
    updateTimeActionPlan,
    updateTimeActionStages
} from '../controller/merchandiseController.js';

const router = express.Router();

// Routes for Pre-Production Sample (PPS) management
router.post('/pps', createPpsRecord);
router.get('/pps', getAllPPS);
router.get('/pps/:id', getPPSById);
router.put('/pps/:id', updatePpsRecord);
router.patch('/pps/:id/mark-done', markPPSAsDone);

// Routes for Time Action Plan (TAP) management
router.post('/ta-plan', createTimeActionPlan);
router.post('/ta-plan/:timeActionPlanId/stages', upsertTimeActionStages);
router.put('/ta-plan/:id', updateTimeActionPlan);
router.put('/ta-plan/:timeActionPlanId/stages', updateTimeActionStages); // Batch update stages identified by timeActionPlanId and stageName


// POST route to register a new broker/agent
router.post('/brokers', createBroker);
// POST route to create a broker financial/tracking record
router.post('/broker-records', createBrokerRecord);

// --- GET Routes ---
router.get('/brokers', getAllBrokers);
router.get('/broker-records/icn/:icnNo', getBrokerRecordsByIcn);

// --- Update Routes ---
router.put('/brokers/:id', updateBroker);
router.put('/broker-records/:id', updateBrokerRecord);

// --- DELETE Routes ---
router.delete('/brokers/:id', deleteBroker);
router.delete('/broker-records/:id', deleteBrokerRecord);

export default router;