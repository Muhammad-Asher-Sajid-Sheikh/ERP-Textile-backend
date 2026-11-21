import mongoose from 'mongoose';

const StageEntrySchema = new mongoose.Schema(
  {
    stageCode: {
      type: String,
      required: true,
      trim: true,
    },
    stageName: {
      type: String,
      required: true,
      trim: true,
    },
    sequence: {
      type: Number,
      required: true,
    },
    executionMode: {
      type: String,
      enum: ['IN_HOUSE', 'OUTSOURCED'],
      default: 'IN_HOUSE',
    },
    processorId: {
      type: String,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    qa: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const OwiStageSpecSchema = new mongoose.Schema(
  {
    postgresOwiId: {
      type: String,
      required: true,
    },
    icnNo: {
      type: String,
      required: true,
      index: true,
    },
    atxScIon: {
      type: String,
      default: null,
      index: true,
    },
    skuId: {
      type: String,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    stages: {
      type: [StageEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'owi_stage_specs',
  }
);

OwiStageSpecSchema.index({ postgresOwiId: 1, version: 1 }, { unique: true });

export default mongoose.model('OwiStageSpec', OwiStageSpecSchema);