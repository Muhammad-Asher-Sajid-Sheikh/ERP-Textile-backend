import { PrismaClient } from '../../generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

// Prisma enum values
const SAMPLE_TYPES = [
  'APPROVAL_SAMPLE',
  'PHOTO_SAMPLE',
  'PPS',
  'PACKING_SAMPLE',
];

const QC_STATUSES = ['PENDING', 'PASSED', 'FAILED'];

const CUSTOMER_STATUSES = [
  'PENDING',
  'APPROVED',
  'DISAPPROVED',
];

const FINAL_CUSTOMER_STATUSES = ['APPROVED', 'DISAPPROVED'];

const REASON_CATEGORIES = [
  'SHADE_MISMATCH',
  'MEASUREMENT_DEFECT',
  'CONSTRUCTION_ERROR',
  'FABRIC_QUALITY',
  'TRIM_PACKING_DEFECT',
  'OTHER',
];

const STAGE_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'DELAYED',
];

const DEPARTMENTS = [
  'MERCHANDISING',
  'SCM',
  'PRODUCTION',
  'QUALITY',
  'ACCOUNTS',
];

// Helper functions
const has = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isValidEnum = (value, values) =>
  values.includes(value);

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

function serverError(res, message, error) {
  console.error(message, error);

  return res.status(500).json({
    success: false,
    message,
  });
}

function parseDate(value, fieldName, { nullable = true } = {}) {
  if (value === null || value === '') {
    if (nullable) {
      return { value: null };
    }

    return {
      error: `${fieldName} is required.`,
    };
  }

  if (value === undefined) {
    return { value: undefined };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      error: `${fieldName} must be a valid date.`,
    };
  }

  return { value: date };
}

function validateDatePair(start, end, startName, endName) {
  if (start && end && end < start) {
    return `${endName} cannot be earlier than ${startName}.`;
  }

  return null;
}

function leadTimeDays(start, end) {
  return Math.ceil(
    (end.getTime() - start.getTime()) / 86400000
  );
}

// Validates and prepares stage data
function stagePayload(stage) {
  const data = {};

  const dateFields = [
    'plannedStartDate',
    'plannedEndDate',
    'actualStartDate',
    'actualEndDate',
  ];

  for (const field of dateFields) {
    if (has(stage, field)) {
      const parsed = parseDate(stage[field], field);

      if (parsed.error) {
        return { error: parsed.error };
      }

      data[field] = parsed.value;
    }
  }

  if (has(stage, 'responsibleDepartment')) {
    if (
      stage.responsibleDepartment !== null &&
      !isValidEnum(stage.responsibleDepartment, DEPARTMENTS)
    ) {
      return {
        error: 'responsibleDepartment is not a valid Department value.',
      };
    }

    data.responsibleDepartment = stage.responsibleDepartment;
  }

  if (has(stage, 'status')) {
    if (!isValidEnum(stage.status, STAGE_STATUSES)) {
      return {
        error: 'status is not a valid StageStatus value.',
      };
    }

    data.status = stage.status;
  }

  const plannedError = validateDatePair(
    data.plannedStartDate,
    data.plannedEndDate,
    'plannedStartDate',
    'plannedEndDate'
  );

  const actualError = validateDatePair(
    data.actualStartDate,
    data.actualEndDate,
    'actualStartDate',
    'actualEndDate'
  );

  if (plannedError || actualError) {
    return {
      error: plannedError || actualError,
    };
  }

  return { data };
}

// ======================================================
// 1. CREATE PPS RECORD
// POST /api/merchandise/pps
// ======================================================

export const createPpsRecord = async (req, res) => {
  try {
    const {
      icnNo,
      sampleType,
      owiId,
      owi,
      rackId,
      qcStatus,
      dispatchDate,
    } = req.body;

    if (!icnNo || !sampleType || !owiId || !rackId) {
      return badRequest(
        res,
        'Missing required fields: icnNo, sampleType, owiId, and rackId are mandatory.'
      );
    }

    if (!isValidEnum(sampleType, SAMPLE_TYPES)) {
      return badRequest(res, 'sampleType is invalid.');
    }

    if (
      qcStatus !== undefined &&
      !isValidEnum(qcStatus, QC_STATUSES)
    ) {
      return badRequest(res, 'qcStatus is invalid.');
    }

    const parsedDispatch = parseDate(
      dispatchDate,
      'dispatchDate'
    );

    if (parsedDispatch.error) {
      return badRequest(res, parsedDispatch.error);
    }

    const record = await prisma.$transaction(async (tx) => {
      const latest = await tx.preProductionSample.findFirst({
        where: { icnNo },
        orderBy: { ppsVersion: 'desc' },
        select: { ppsVersion: true },
      });

      const version = (latest?.ppsVersion ?? 0) + 1;

      return tx.preProductionSample.create({
        data: {
          icnNo,
          sampleType,
          owiId,
          owi: owi ?? null,
          rackId,
          qcStatus: qcStatus ?? 'PENDING',
          dispatchDate: parsedDispatch.value ?? null,
          ppsVersion: version,
        },
      });
    });

    return res.status(201).json({
      success: true,
      message: `PPS Record version ${record.ppsVersion} created successfully.`,
      data: record,
    });
  } catch (error) {
    return serverError(
      res,
      'Internal server error while creating PPS record.',
      error
    );
  }
};

// ======================================================
// 2. GET ALL PPS RECORDS
// GET /api/merchandise/pps
// ======================================================

export const getAllPPS = async (req, res) => {
  try {
    const ppsList = await prisma.preProductionSample.findMany({
      select: {
        id: true,
        icnNo: true,
        sampleType: true,
        ppsVersion: true,
        owiId: true,
        owi: true,
        rackId: true,
        qcStatus: true,
        isApproved: true,
        status: true,
        isLocked: true,
        dispatchDate: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json({
      success: true,
      count: ppsList.length,
      data: ppsList,
    });
  } catch (error) {
    return serverError(
      res,
      'Internal server error while fetching PPS list.',
      error
    );
  }
};

// ======================================================
// 3. GET PPS RECORD BY ID
// GET /api/merchandise/pps/:id
// ======================================================

export const getPPSById = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await prisma.preProductionSample.findUnique({
      where: { id },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `PPS record with ID ${id} not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    return serverError(
      res,
      'Internal server error while fetching PPS details.',
      error
    );
  }
};

// ======================================================
// 4. UPDATE PPS RECORD
// PUT /api/merchandise/pps/:id
// ======================================================

export const updatePpsRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.preProductionSample.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `PPS record with ID ${id} not found.`,
      });
    }

    if (existing.isLocked) {
      return badRequest(
        res,
        'This PPS record is locked and cannot be modified.'
      );
    }

    const data = {};

    // Only allow explicitly editable fields
    const stringFields = [
      'icnNo',
      'owiId',
      'owi',
      'rackId',
      'remarks',
    ];

    for (const field of stringFields) {
      if (has(body, field)) {
        data[field] = body[field];
      }
    }

    if (has(body, 'sampleType')) {
      if (!isValidEnum(body.sampleType, SAMPLE_TYPES)) {
        return badRequest(res, 'sampleType is invalid.');
      }

      data.sampleType = body.sampleType;
    }

    if (has(body, 'qcStatus')) {
      if (!isValidEnum(body.qcStatus, QC_STATUSES)) {
        return badRequest(res, 'qcStatus is invalid.');
      }

      data.qcStatus = body.qcStatus;
    }

    const dateFields = [
      'dispatchDate',
      'receivedDate',
    ];

    for (const field of dateFields) {
      if (has(body, field)) {
        const parsed = parseDate(body[field], field);

        if (parsed.error) {
          return badRequest(res, parsed.error);
        }

        data[field] = parsed.value;
      }
    }

    if (Object.keys(data).length === 0) {
      return badRequest(
        res,
        'No editable PPS fields were supplied.'
      );
    }

    const result = await prisma.preProductionSample.updateMany({
      where: {
        id,
        isLocked: false,
      },
      data,
    });

    if (result.count === 0) {
      return badRequest(
        res,
        'This PPS record is locked and cannot be modified.'
      );
    }

    const updated = await prisma.preProductionSample.findUnique({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'PPS record updated successfully.',
      data: updated,
    });
  } catch (error) {
    return serverError(
      res,
      'Internal server error while updating PPS record.',
      error
    );
  }
};

// ======================================================
// 5. MARK PPS AS DONE
// PATCH /api/merchandise/pps/:id/mark-done
// ======================================================

export const markPPSAsDone = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      status,
      reasonCategory,
      remarks,
      receivedDate,
    } = req.body;

    if (!isValidEnum(status, FINAL_CUSTOMER_STATUSES)) {
      return badRequest(
        res,
        'status must be APPROVED or DISAPPROVED.'
      );
    }

    if (
      status === 'DISAPPROVED' &&
      !reasonCategory
    ) {
      return badRequest(
        res,
        'reasonCategory is required when status is DISAPPROVED.'
      );
    }

    if (
      reasonCategory &&
      !isValidEnum(reasonCategory, REASON_CATEGORIES)
    ) {
      return badRequest(
        res,
        'reasonCategory is invalid.'
      );
    }

    const parsedReceived = parseDate(
      receivedDate,
      'receivedDate'
    );

    if (parsedReceived.error) {
      return badRequest(res, parsedReceived.error);
    }

    const update = await prisma.preProductionSample.updateMany({
      where: {
        id,
        isLocked: false,
      },
      data: {
        status,
        reasonCategory:
          status === 'DISAPPROVED'
            ? reasonCategory
            : null,
        remarks: remarks ?? null,
        receivedDate: parsedReceived.value ?? new Date(),
        isLocked: true,
      },
    });

    if (update.count === 0) {
      const existing = await prisma.preProductionSample.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: `PPS record with ID ${id} not found.`,
        });
      }

      return badRequest(
        res,
        'This PPS record is already locked.'
      );
    }

    const locked = await prisma.preProductionSample.findUnique({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: `PPS record marked as ${status} and locked successfully.`,
      data: locked,
    });
  } catch (error) {
    return serverError(
      res,
      'Internal server error while marking PPS as done.',
      error
    );
  }
};



// GET ALL TIME & ACTION PLANS
// GET /api/merchandise/ta-plan

export const getAllTimeActionPlans = async (req, res) => {
    try {
        const plans = await prisma.timeActionPlan.findMany({
            include: {
                stages: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return res.status(200).json({
            success: true,
            count: plans.length,
            data: plans,
        });
    } catch (error) {
        return serverError(
            res,
            "Internal server error while fetching T&A plans.",
            error
        );
    }
};

// ======================================================
// 6. CREATE TIME & ACTION PLAN
// POST /api/merchandise/ta-plan
// ======================================================

export const createTimeActionPlan = async (req, res) => {
  try {
    const {
      icnNo,
      owiId,
      owi,
      orderDate,
      shipmentDeadline,
    } = req.body;

    if (
      !icnNo ||
      !owiId ||
      !orderDate ||
      !shipmentDeadline
    ) {
      return badRequest(
        res,
        'Missing mandatory fields: icnNo, owiId, orderDate, and shipmentDeadline are required.'
      );
    }

    const startParsed = parseDate(
      orderDate,
      'orderDate',
      { nullable: false }
    );

    const endParsed = parseDate(
      shipmentDeadline,
      'shipmentDeadline',
      { nullable: false }
    );

    if (startParsed.error || endParsed.error) {
      return badRequest(
        res,
        startParsed.error || endParsed.error
      );
    }

    const dateError = validateDatePair(
      startParsed.value,
      endParsed.value,
      'orderDate',
      'shipmentDeadline'
    );

    if (dateError) {
      return badRequest(res, dateError);
    }

    const plan = await prisma.timeActionPlan.create({
      data: {
        icnNo,
        owiId,
        owi: owi ?? null,
        orderDate: startParsed.value,
        shipmentDeadline: endParsed.value,
        totalLeadTimeDays: leadTimeDays(
          startParsed.value,
          endParsed.value
        ),
      },
      include: {
        stages: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Time & Action Plan created successfully.',
      data: plan,
    });
  } catch (error) {
    return serverError(
      res,
      'Internal server error while creating T&A plan.',
      error
    );
  }
};

// ======================================================
// 7. UPSERT TIME ACTION STAGES
// POST /api/merchandise/ta-plan/:timeActionPlanId/stages
// ======================================================

export const upsertTimeActionStages = async (req, res) => {
  try {
    const { timeActionPlanId } = req.params;
    const { stages } = req.body;

    if (!Array.isArray(stages) || stages.length === 0) {
      return badRequest(
        res,
        'A non-empty stages array is required.'
      );
    }

    if (
      stages.some(
        (stage) =>
          !stage ||
          typeof stage.stageName !== 'string' ||
          !stage.stageName.trim()
      )
    ) {
      return badRequest(
        res,
        'Every stage must include a non-empty stageName.'
      );
    }

    const names = stages.map((stage) =>
      stage.stageName.trim()
    );

    if (new Set(names).size !== names.length) {
      return badRequest(
        res,
        'Duplicate stageName values are not allowed in one request.'
      );
    }

    // Validate every stage before performing database writes.
    const preparedStages = [];

    for (const stage of stages) {
      const payload = stagePayload(stage);

      if (payload.error) {
        return badRequest(res, payload.error);
      }

      preparedStages.push({
        ...stage,
        stageName: stage.stageName.trim(),
        data: payload.data,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.timeActionPlan.findUnique({
        where: { id: timeActionPlanId },
      });

      if (!plan) {
        return { error: 'NOT_FOUND' };
      }

      if (plan.isLocked) {
        return { error: 'LOCKED' };
      }

      const output = [];

      for (const stage of preparedStages) {
        if (stage.id) {
          const existing = await tx.timeActionStage.findUnique({
            where: { id: stage.id },
          });

          if (
            !existing ||
            existing.timeActionPlanId !== timeActionPlanId
          ) {
            return {
              error: `Stage ID ${stage.id} does not belong to this plan.`,
            };
          }

          const updated = await tx.timeActionStage.update({
            where: { id: stage.id },
            data: {
              stageName: stage.stageName,
              ...stage.data,
            },
          });

          output.push(updated);
        } else {
          const createdOrUpdated = await tx.timeActionStage.upsert({
            where: {
              timeActionPlanId_stageName: {
                timeActionPlanId,
                stageName: stage.stageName,
              },
            },
            update: stage.data,
            create: {
              timeActionPlanId,
              stageName: stage.stageName,
              ...stage.data,
            },
          });

          output.push(createdOrUpdated);
        }
      }

      return { data: output };
    });

    if (result.error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: `Time & Action Plan with ID ${timeActionPlanId} not found.`,
      });
    }

    if (result.error === 'LOCKED') {
      return badRequest(
        res,
        'This T&A Plan is locked. Stages cannot be modified.'
      );
    }

    if (result.error) {
      return badRequest(res, result.error);
    }

    return res.status(200).json({
      success: true,
      message: `${result.data.length} stages successfully processed.`,
      data: result.data,
    });
  } catch (error) {
    return serverError(
      res,
      'Internal server error while processing T&A stages.',
      error
    );
  }
};

// ======================================================
// 8. UPDATE TIME & ACTION PLAN
// PUT /api/merchandise/ta-plan/:id
// ======================================================

export const updateTimeActionPlan = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      orderDate,
      shipmentDeadline,
      criticalPathFlag,
      owi,
      owiId,
      icnNo,
    } = req.body;

    const existing = await prisma.timeActionPlan.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Time & Action Plan with ID ${id} not found.`,
      });
    }

    if (existing.isLocked) {
      return badRequest(
        res,
        'This T&A Plan is locked and cannot be edited.'
      );
    }

    const startParsed = has(req.body, 'orderDate')
      ? parseDate(orderDate, 'orderDate', { nullable: false })
      : { value: existing.orderDate };

    const endParsed = has(req.body, 'shipmentDeadline')
      ? parseDate(shipmentDeadline, 'shipmentDeadline', {
          nullable: false,
        })
      : { value: existing.shipmentDeadline };

    if (startParsed.error || endParsed.error) {
      return badRequest(
        res,
        startParsed.error || endParsed.error
      );
    }

    const dateError = validateDatePair(
      startParsed.value,
      endParsed.value,
      'orderDate',
      'shipmentDeadline'
    );

    if (dateError) {
      return badRequest(res, dateError);
    }

    const data = {
      orderDate: startParsed.value,
      shipmentDeadline: endParsed.value,
      totalLeadTimeDays: leadTimeDays(
        startParsed.value,
        endParsed.value
      ),
      taVersion: {
        increment: 1,
      },
    };

    if (has(req.body, 'criticalPathFlag')) {
      if (typeof criticalPathFlag !== 'boolean') {
        return badRequest(
          res,
          'criticalPathFlag must be a boolean.'
        );
      }

      data.criticalPathFlag = criticalPathFlag;
    }

    if (has(req.body, 'owi')) {
      data.owi = owi;
    }

    if (has(req.body, 'owiId')) {
      data.owiId = owiId;
    }

    if (has(req.body, 'icnNo')) {
      data.icnNo = icnNo;
    }

    const update = await prisma.timeActionPlan.updateMany({
      where: {
        id,
        isLocked: false,
      },
      data,
    });

    if (update.count === 0) {
      return badRequest(
        res,
        'This T&A Plan is locked and cannot be edited.'
      );
    }

    const updated = await prisma.timeActionPlan.findUnique({
      where: { id },
      include: {
        stages: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: `T&A Plan updated successfully. Version incremented to v${updated.taVersion}.`,
      data: updated,
    });
  } catch (error) {
    return serverError(
      res,
      'Internal server error while updating T&A plan.',
      error
    );
  }
};

// ======================================================
// 9. UPDATE TIME ACTION STAGES
// PUT /api/merchandise/ta-plan/:timeActionPlanId/stages
// ======================================================

export const updateTimeActionStages = async (req, res) => {
  try {
    const { timeActionPlanId } = req.params;
    const { stages } = req.body;

    if (!Array.isArray(stages) || stages.length === 0) {
      return badRequest(
        res,
        'A non-empty stages array is required.'
      );
    }

    if (
      stages.some(
        (stage) =>
          !stage ||
          typeof stage.stageName !== 'string' ||
          !stage.stageName.trim()
      )
    ) {
      return badRequest(
        res,
        'Every stage update must include a non-empty stageName.'
      );
    }

    const names = stages.map((stage) =>
      stage.stageName.trim()
    );

    if (new Set(names).size !== names.length) {
      return badRequest(
        res,
        'Duplicate stageName values are not allowed in one request.'
      );
    }

    // Validate all stage updates before the transaction.
    const preparedStages = [];

    for (const stage of stages) {
      const payload = stagePayload(stage);

      if (payload.error) {
        return badRequest(res, payload.error);
      }

      preparedStages.push({
        stageName: stage.stageName.trim(),
        data: payload.data,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.timeActionPlan.findUnique({
        where: { id: timeActionPlanId },
      });

      if (!plan) {
        return { error: 'NOT_FOUND' };
      }

      if (plan.isLocked) {
        return { error: 'LOCKED' };
      }

      const output = [];

      for (const stage of preparedStages) {
        const updated = await tx.timeActionStage.updateMany({
          where: {
            timeActionPlanId,
            stageName: stage.stageName,
          },
          data: stage.data,
        });

        if (updated.count === 0) {
          return {
            error: `Stage '${stage.stageName}' was not found in this plan.`,
          };
        }

        const row = await tx.timeActionStage.findUnique({
          where: {
            timeActionPlanId_stageName: {
              timeActionPlanId,
              stageName: stage.stageName,
            },
          },
        });

        output.push(row);
      }

      return { data: output };
    });

    if (result.error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: `Time & Action Plan with ID ${timeActionPlanId} not found.`,
      });
    }

    if (result.error === 'LOCKED') {
      return badRequest(
        res,
        'This T&A Plan is locked. Stages cannot be modified.'
      );
    }

    if (result.error) {
      return badRequest(res, result.error);
    }

    return res.status(200).json({
      success: true,
      message: `${result.data.length} stages updated successfully.`,
      data: result.data,
    });
  } catch (error) {
    return serverError(
      res,
      'Internal server error while updating T&A stages.',
      error
    );
  }
};


/**
 * Create a new Broker / Third-Party profile.
 */
export const createBroker = async (req, res) => {
  try {
    const { brokerName, contactPerson, email, phone } = req.body;

    if (!brokerName) {
      return res.status(400).json({
        success: false,
        message: 'Broker name is mandatory.'
      });
    }

    const newBroker = await prisma.broker.create({
      data: {
        brokerName,
        contactPerson,
        email,
        phone
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Broker created successfully.',
      data: newBroker
    });
  } catch (error) {
    console.error('Error creating broker:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating broker.',
      error: error.message
    });
  }
};

/**
 * Create a Broker / Third-Party tracking record linked to an ICN and Broker.
 * Defaults isApproved to false (pending management sign-off).
 */
export const createBrokerRecord = async (req, res) => {
  try {
    const { 
      icnNo, 
      brokerId, 
      stage, 
      priceCost, 
      dateToSent, 
      dateToReceive 
    } = req.body;

    // Validate mandatory fields
    if (!icnNo || !brokerId || !stage || priceCost === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing mandatory fields: icnNo, brokerId, stage, and priceCost are required.'
      });
    }

    // Verify broker exists
    const brokerExists = await prisma.broker.findUnique({
      where: { id: brokerId }
    });

    if (!brokerExists) {
      return res.status(404).json({
        success: false,
        message: `Broker with ID ${brokerId} not found.`
      });
    }

    const newRecord = await prisma.brokerThirdPartyRecord.create({
      data: {
        icnNo,
        brokerId,
        stage,
        priceCost: parseFloat(priceCost),
        dateToSent: dateToSent ? new Date(dateToSent) : null,
        dateToReceive: dateToReceive ? new Date(dateToReceive) : null,
        isApproved: false // Requires management sign-off
      },
      include: {
        broker: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Broker tracking record created successfully.',
      data: newRecord
    });
  } catch (error) {
    console.error('Error creating broker tracking record:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while creating broker record.',
      error: error.message
    });
  }
};

/**
 * Get all registered brokers and third-party partners.
 */
export const getAllBrokers = async (req, res) => {
  try {
    const brokers = await prisma.broker.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: brokers.length,
      data: brokers
    });
  } catch (error) {
    console.error('Error fetching brokers:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching brokers.',
      error: error.message
    });
  }
};

/**
 * Get all broker tracking records associated with a specific ICN number.
 * Includes the related broker profile details.
 */
export const getBrokerRecordsByIcn = async (req, res) => {
  try {
    const { icnNo } = req.params;

    if (!icnNo) {
      return res.status(400).json({
        success: false,
        message: 'ICN number parameter is required.'
      });
    }

    const records = await prisma.brokerThirdPartyRecord.findMany({
      where: { icnNo },
      include: {
        broker: true // Pulls in broker profile details
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      icnNo,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('Error fetching broker records by ICN:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching broker records for this ICN.',
      error: error.message
    });
  }
};

/**
 * Update an existing Broker profile.
 */
export const updateBroker = async (req, res) => {
  try {
    const { id } = req.params;
    const { brokerName, contactPerson, email, phone } = req.body;

    const existingBroker = await prisma.broker.findUnique({
      where: { id }
    });

    if (!existingBroker) {
      return res.status(404).json({
        success: false,
        message: `Broker with ID ${id} not found.`
      });
    }

    const updatedBroker = await prisma.broker.update({
      where: { id },
      data: {
        ...(brokerName && { brokerName }),
        ...(contactPerson !== undefined && { contactPerson }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone })
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Broker profile updated successfully.',
      data: updatedBroker
    });
  } catch (error) {
    console.error('Error updating broker:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating broker.',
      error: error.message
    });
  }
};

/**
 * Update an existing Broker/Third-Party tracking record.
 * Allows updating financial/stage details and management approval (`isApproved`).
 */
export const updateBrokerRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      stage, 
      priceCost, 
      dateToSent, 
      dateToReceive, 
      isApproved 
    } = req.body;

    const existingRecord = await prisma.brokerThirdPartyRecord.findUnique({
      where: { id }
    });

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: `Broker tracking record with ID ${id} not found.`
      });
    }

    const updatedRecord = await prisma.brokerThirdPartyRecord.update({
      where: { id },
      data: {
        ...(stage && { stage }),
        ...(priceCost !== undefined && { priceCost: parseFloat(priceCost) }),
        ...(dateToSent !== undefined && { dateToSent: dateToSent ? new Date(dateToSent) : null }),
        ...(dateToReceive !== undefined && { dateToReceive: dateToReceive ? new Date(dateToReceive) : null }),
        ...(isApproved !== undefined && { isApproved })
      },
      include: {
        broker: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Broker tracking record updated successfully.',
      data: updatedRecord
    });
  } catch (error) {
    console.error('Error updating broker tracking record:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating broker record.',
      error: error.message
    });
  }
};

/**
 * Delete a Broker profile.
 * Fails gracefully if the broker has existing tracking records attached.
 */
export const deleteBroker = async (req, res) => {
  try {
    const { id } = req.params;

    const existingBroker = await prisma.broker.findUnique({
      where: { id },
      include: {
        _count: {
          select: { trackingRecords: true }
        }
      }
    });

    if (!existingBroker) {
      return res.status(404).json({
        success: false,
        message: `Broker with ID ${id} not found.`
      });
    }

    // Prevent deletion if linked tracking records exist to preserve data integrity
    if (existingBroker._count.trackingRecords > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete broker. ${existingBroker._count.trackingRecords} active tracking record(s) are linked to this broker.`
      });
    }

    await prisma.broker.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Broker profile deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting broker:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while deleting broker.',
      error: error.message
    });
  }
};

/**
 * Delete a specific Broker/Third-Party tracking record.
 */
export const deleteBrokerRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const existingRecord = await prisma.brokerThirdPartyRecord.findUnique({
      where: { id }
    });

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: `Broker tracking record with ID ${id} not found.`
      });
    }

    await prisma.brokerThirdPartyRecord.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Broker tracking record deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting broker tracking record:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while deleting broker record.',
      error: error.message
    });
  }
};