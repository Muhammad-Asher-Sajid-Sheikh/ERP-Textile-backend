import express from 'express';
import {
    createBroker,
    createBrokerRecord,
    getAllBrokers,
    getBrokerRecordsByIcn,
    updateBroker,
    updateBrokerRecord,
    deleteBroker,
    deleteBrokerRecord
} from '../../controller/production/BrokerController.js';

const router = express.Router();

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