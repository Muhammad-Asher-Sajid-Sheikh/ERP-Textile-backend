import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function testTextileErpMongo() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB_NAME || 'TextileERP';

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    console.log(`Connecting to ${uri}...`);
    await client.connect();

    const db = client.db(dbName);

    // 1. Verify server health
    await db.command({ ping: 1 });
    console.log(`✅ Connected to database: "${db.databaseName}"`);

    // 2. Insert a test document
    const collection = db.collection('system_logs');
    const insertResult = await collection.insertOne({
      event: 'CONNECTION_TEST',
      module: 'FabricSync_Core',
      status: 'ACTIVE',
      metadata: {
        environment: process.env.NODE_ENV || 'development',
        testedBy: 'setup-script',
      },
      createdAt: new Date(),
    });

    console.log('✅ Document inserted with _id:', insertResult.insertedId);

    // 3. Read the document back
    const savedDoc = await collection.findOne({ _id: insertResult.insertedId });
    console.log('📄 Retrieved document:', savedDoc);
  } catch (error) {
    console.error('❌ MongoDB connection/insert failed:');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

testTextileErpMongo();