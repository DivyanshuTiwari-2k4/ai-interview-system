import axios from "axios";
import logger from "../config/logger.js";
import { downloadFile } from "./storageService.js";

const DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen";

/**
 * Transcribe a merged audio file stored in S3 via Deepgram
 */
const transcribeFromS3Key = async (s3Key) => {
  logger.info(`Starting transcription for: ${s3Key}`);

  try {
    // Download the merged file buffer from S3
    const audioBuffer = await downloadFile(s3Key);

    // Send to Deepgram
    const response = await axios.post(
      `${DEEPGRAM_API_URL}?model=nova-2&smart_format=true&punctuate=true&diarize=false&language=en`,
      audioBuffer,
      {
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "audio/wav",
        },
        timeout: 120000, // 2 minute timeout
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const result = response.data?.results?.channels?.[0]?.alternatives?.[0];

    if (!result) {
      throw new Error("No transcription result from Deepgram");
    }

    const transcript = result.transcript || "";
    const confidence = result.confidence || 0;

    logger.info(`Transcription complete. Confidence: ${confidence}. Length: ${transcript.length} chars`);

    return {
      transcript,
      confidence,
      words: result.words || [],
      duration: response.data?.metadata?.duration,
    };
  } catch (err) {
    if (err.response) {
      logger.error(`Deepgram API error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    } else {
      logger.error(`Transcription failed: ${err.message}`);
    }
    throw err;
  }
};

/**
 * Transcribe directly from a Buffer (for smaller chunks)
 */
const transcribeBuffer = async (buffer, mimeType = "audio/wav") => {
  try {
    const response = await axios.post(
      `${DEEPGRAM_API_URL}?model=nova-2&smart_format=true&punctuate=true`,
      buffer,
      {
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": mimeType,
        },
        timeout: 60000,
      }
    );

    const result = response.data?.results?.channels?.[0]?.alternatives?.[0];
    return {
      transcript: result?.transcript || "",
      confidence: result?.confidence || 0,
    };
  } catch (err) {
    logger.error(`Buffer transcription failed: ${err.message}`);
    throw err;
  }
};

export { transcribeFromS3Key, transcribeBuffer };