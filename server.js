/**
 * Improved Real Estate Document OCR
 *
 * Enhanced version with:
 * - Better text preprocessing
 * - More flexible pattern matching
 * - Improved error handling
 * - Debug output options
 */

const fs = require("fs");
const path = require("path");
const Tesseract = require("tesseract.js");
const util = require("util");

// Configuration
const IMAGE_DIRECTORY = "./images"; // Directory containing images to process
const OUTPUT_FILE = "./extracted_data.json"; // Output file for extracted data
const DEBUG_DIR = "./debug"; // Directory to save debug text files (if enabled)
const ENABLE_DEBUG = true; // Set to true to save raw OCR text to files

// Ensure debug directory exists if debugging is enabled
if (ENABLE_DEBUG && !fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

// Helper functions
async function extractTextFromImage(imagePath) {
  try {
    console.log(`Starting OCR for ${imagePath}...`);

    // Using the Tesseract.js API with improved settings
    const result = await Tesseract.recognize(imagePath, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          process.stdout.write(
            `\rOCR Progress: ${Math.floor(m.progress * 100)}%`
          );
        }
      },
      rectangle: true, // Enable rectangle recognition (better for forms)
      tessjs_create_pdf: "0", // Disable PDF creation for faster processing
    });

    console.log("\nOCR complete.");
    return result.data.text;
  } catch (error) {
    console.error(`Error recognizing text in ${imagePath}:`, error);
    throw error;
  }
}

// Pre-process text to improve extraction accuracy
function preprocessText(text) {
  // Replace multiple spaces with a single space
  text = text.replace(/\s+/g, " ");

  // Replace common OCR errors
  text = text.replace(/[;:]/g, ":"); // Normalize colons and semicolons
  text = text.replace(/\|/g, "I"); // Fix pipe character often misrecognized as 'I'

  // Convert to lowercase for case-insensitive matching
  return text.toLowerCase();
}

// Improved extraction patterns with multiple variations for each field
const extractionPatterns = {
  buyerName: [
    /buyer(?:\s*)name(?:\s*):(?:\s*)([^\n]+)/i,
    /name(?:\s*)of(?:\s*)buyer(?:\s*):(?:\s*)([^\n]+)/i,
    /purchaser(?:\s*):(?:\s*)([^\n]+)/i,
  ],
  sellerName: [
    /seller(?:\s*)name(?:\s*):(?:\s*)([^\n]+)/i,
    /name(?:\s*)of(?:\s*)seller(?:\s*):(?:\s*)([^\n]+)/i,
    /vendor(?:\s*):(?:\s*)([^\n]+)/i,
  ],
  propertyAddress: [
    /property(?:\s*)to(?:\s*)be(?:\s*)sold(?:\s*)address(?:\s*):(?:\s*)([^\n]+)/i,
    /property(?:\s*)address(?:\s*):(?:\s*)([^\n]+)/i,
    /address(?:\s*)of(?:\s*)property(?:\s*):(?:\s*)([^\n]+)/i,
    /subject(?:\s*)property(?:\s*):(?:\s*)([^\n]+)/i,
  ],
  keyDates: [
    /key(?:\s*)dates(?:\s*):(?:\s*)([^\n]+)/i,
    /important(?:\s*)dates(?:\s*):(?:\s*)([^\n]+)/i,
    /closing(?:\s*)date(?:\s*):(?:\s*)([^\n]+)/i,
    /settlement(?:\s*)date(?:\s*):(?:\s*)([^\n]+)/i,
  ],
  offerPrice: [
    /(?:buy|offer|purchase)(?:\s*)price(?:\s*)\$?(?:\s*):(?:\s*)([^\n$]+)/i,
    /price(?:\s*):(?:\s*)\$?(?:\s*)([^\n$]+)/i,
    /amount(?:\s*):(?:\s*)\$?(?:\s*)([^\n$]+)/i,
    /\$(?:\s*)([0-9,.]+)/i,
  ],
};

// Find lines containing specific keywords for each field
function findRelevantLines(text, keywords) {
  const lines = text.split("\n");
  const relevantLines = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (keywords.some((keyword) => lowerLine.includes(keyword))) {
      relevantLines.push(line);
    }
  }

  return relevantLines;
}

// Advanced extraction function that tries multiple approaches
async function extractRealEstateData(rawText) {
  const data = {
    buyerName: "Not found",
    sellerName: "Not found",
    propertyAddress: "Not found",
    keyDates: "Not found",
    offerPrice: "Not found",
  };

  // Save raw text for debugging if enabled
  if (ENABLE_DEBUG) {
    const timestamp = Date.now();
    fs.writeFileSync(
      path.join(DEBUG_DIR, `raw_text_${timestamp}.txt`),
      rawText
    );
  }

  // Preprocess the text
  const text = preprocessText(rawText);

  // Try extraction using regular expressions
  for (const [field, patterns] of Object.entries(extractionPatterns)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        data[field] = match[1].trim();
        break; // Stop after first successful match
      }
    }
  }

  // Secondary approach: Find relevant lines and extract data
  const fieldKeywords = {
    buyerName: ["buyer", "purchaser"],
    sellerName: ["seller", "vendor"],
    propertyAddress: ["property", "address", "location"],
    keyDates: ["date", "closing", "settlement"],
    offerPrice: ["price", "amount", "offer", "$"],
  };

  for (const [field, keywords] of Object.entries(fieldKeywords)) {
    if (data[field] === "Not found") {
      const relevantLines = findRelevantLines(rawText, keywords);
      if (relevantLines.length > 0) {
        // Try to extract the value part (assume format is "Label: Value")
        for (const line of relevantLines) {
          const parts = line.split(":");
          if (parts.length > 1) {
            data[field] = parts[1].trim();
            break;
          }
        }
      }
    }
  }

  return data;
}

// Main function
async function processImages() {
  try {
    // Ensure the image directory exists
    if (!fs.existsSync(IMAGE_DIRECTORY)) {
      console.error(`Error: Directory ${IMAGE_DIRECTORY} does not exist`);
      return [];
    }

    // Get all image files in the directory
    const files = fs
      .readdirSync(IMAGE_DIRECTORY)
      .filter((file) => /\.(jpg|jpeg|png|tiff|bmp)$/i.test(file))
      .map((file) => path.join(IMAGE_DIRECTORY, file));

    if (files.length === 0) {
      console.log("No image files found in the directory");
      return [];
    }

    console.log(`Found ${files.length} image files. Processing...`);

    // Process each image
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(
        `Processing image ${i + 1}/${files.length}: ${path.basename(file)}`
      );

      try {
        const text = await extractTextFromImage(file);
        console.log(`Extracted ${text.length} characters of text`);

        const data = await extractRealEstateData(text);
        data.sourceFile = path.basename(file);
        results.push(data);

        console.log(`Extracted data from ${path.basename(file)}:`);
        console.log(util.inspect(data, { colors: true, depth: null }));
        console.log("-----------------------------------");
      } catch (error) {
        console.error(`Failed to process ${file}:`, error);
      }
    }

    // Write results to file
    if (results.length > 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
      console.log(`Processing complete. Results saved to ${OUTPUT_FILE}`);
    } else {
      console.log("No results were extracted from any images.");
    }

    return results;
  } catch (error) {
    console.error("An error occurred:", error);
    return [];
  }
}

// Execute the main function
processImages()
  .then((results) => {
    console.log(
      `Processed ${results ? results.length : 0} images successfully`
    );
  })
  .catch((err) => {
    console.error("Failed to process images:", err);
  });
