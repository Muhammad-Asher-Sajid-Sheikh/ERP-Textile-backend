import { Router } from "express";
import {
  createMasterLot,
  getAllMasterLots,
  getMasterLotById,
  updateMasterLot,
  deleteMasterLot,

  createStageWiseLot,
  getAllStageWiseLots,
  getStageWiseLotById,
  updateStageWiseLot,
  deleteStageWiseLot,

  transitionMasterLotToGateA,
  transitionMasterLotToGateB,
  transitionMasterLotToGateC,
} from "../../controller/production/PLController.js"; // Adjust path to match your file location

const router = Router();


// lot master table
router.post("/", createMasterLot);
router.get("/", getAllMasterLots);
router.get("/:id", getMasterLotById);
router.put("/:id", updateMasterLot);
router.patch("/:id", updateMasterLot);
router.delete("/:id", deleteMasterLot);



// stage-wise lot table
router.post("/stage-wise", createStageWiseLot);
router.get("/stage-wise", getAllStageWiseLots);
router.get("/stage-wise/:id", getStageWiseLotById);
router.put("/stage-wise/:id", updateStageWiseLot);
router.patch("/stage-wise/:id", updateStageWiseLot);
router.delete("/stage-wise/:id", deleteStageWiseLot);


// Gate transition routes
router.patch("/:id/transition/gate-a", transitionMasterLotToGateA);
router.patch("/:id/transition/gate-b", transitionMasterLotToGateB);
router.patch("/:id/transition/gate-c", transitionMasterLotToGateC);

export default router;