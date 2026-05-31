

import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";

// Temporary debug - remove after fixing
console.log('AWS CONFIG:', {
  bucket: process.env.S3_BUCKET_NAME,
  region: process.env.AWS_REGION,
  keyId: process.env.AWS_ACCESS_KEY_ID ? 'set' : 'MISSING',
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || "ap-southeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export { s3Client, sqsClient };