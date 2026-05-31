console.log('ENV loaded:', {
  bucket: process.env.S3_BUCKET_NAME,
  region: process.env.AWS_REGION,
  keyId: process.env.AWS_ACCESS_KEY_ID ? 'set' : 'MISSING',
});