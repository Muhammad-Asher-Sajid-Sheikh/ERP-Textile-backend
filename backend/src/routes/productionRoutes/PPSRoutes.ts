import { Router } from "express";
import {
  createRackRetention,
  getAllRackRetentions,
  getRackRetentionById,
  updateRackRetention,
  deleteRackRetention,
} from "../../controller/production/PLController.js"; // Adjust path to match your file location

const router = Router();

// Create counter-sample rack retention for a PPS record
router.post("/", createRackRetention);

// List all rack retention records
router.get("/", getAllRackRetentions);

// Get a single rack retention record by ID
router.get("/:id", getRackRetentionById);

// Update rack location, custodian, notes, photos, or active/superseded state
router.patch("/:id", updateRackRetention);
router.put("/:id", updateRackRetention);

// Delete a rack retention record
router.delete("/:id", deleteRackRetention);

export default router;