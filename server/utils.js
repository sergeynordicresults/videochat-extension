import { execFileSync } from "node:child_process";
import fs from "node:fs";

import path from "node:path";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function txtFile__getPath(language) {
  return path.join(__dirname, `rofi-audio--${language}.txt`)
}

export function txtFile__doesExist(language) {
  return fs.existsSync(txtFile__getPath(language))
}

export function txtFile__loadLines(language) {
  const optionsFile = txtFile__getPath(language);
  console.log("optionsFile", optionsFile);

  const lines = fs
    .readFileSync(optionsFile, "utf-8")
    .split("\n")
    .map((line) => line.split(" -- ")[0].trim()) // Remove comments
    .filter((line) => line.length > 0); // Remove empty lines

  if (!lines.length) throw Error("no lines loaded");

  return lines;
}

// clapIndex(0, 0); // 0
// clapIndex(0, 1); // 0
// clapIndex(0, 2); // 0
//
// clapIndex(1, 0); // 0
// clapIndex(1, 1); // 1
// clapIndex(1, 2); // 1
// clapIndex(1, 3); // 1
//
// clapIndex(2, 0); // 0
// clapIndex(2, 1); // 1
// clapIndex(2, 2); // 2
// clapIndex(2, 3); // 2
// clapIndex(2, 4); // 2
export function clapIndex(maxIndex, index) {
  if (index < 0) throw new Error("index must be positive");
  if (maxIndex < 0) throw new Error("maxIndex must be positive");
  return min(index, maxIndex);
}

// rotateIndex(0, 0); // 0
// rotateIndex(0, 1); // 0
// rotateIndex(0, 2); // 0
//
// rotateIndex(1, 0); // 0
// rotateIndex(1, 1); // 1
// rotateIndex(1, 2); // 0
// rotateIndex(1, 3); // 1
//
// rotateIndex(2, 0); // 0
// rotateIndex(2, 1); // 1
// rotateIndex(2, 2); // 2
// rotateIndex(2, 3); // 0
// rotateIndex(2, 4); // 1
// rotateIndex(2, 4); // 2
export function rotateIndex(maxIndex, index) {
  if (index < 0) throw new Error("index must be positive");
  if (maxIndex < 0) throw new Error("maxIndex must be positive");
  return index % (maxIndex + 1);
}

// from 1 to inf, if more then lenght - use %
// getElemOfNonEmptyArray([], 0); // throw error
// getElemOfNonEmptyArray([1, 2, 3], 0); // 1
// getElemOfNonEmptyArray([1, 2, 3], 1); // 2
// getElemOfNonEmptyArray([1, 2, 3], 2); // 3
// getElemOfNonEmptyArray([1, 2, 3], 3); // 3
// getElemOfNonEmptyArray([1, "foo", 3], 4); // "foo"
export function getElemOfNonEmptyArray(array, index) {
  if (index < 0) throw new Error("index must be positive");
  const { length } = array;
  if (length === 0) throw new Error("array must not be empty");
  return array[rotateIndex(length - 1, index)];
}

async function showRofiDialog_(reqLogger, language) {
  try {
    const inputText = txtFile__loadLines(language)
      .map((line, index) => `${index + 1}: ${line}`)
      .join("\n");
    return execFileSync("rofi", ["-dmenu", "-p", "Play"], {
      input: inputText,
      encoding: "utf-8",
    });
  } catch (err) {
    if (err.status === 1) {
      reqLogger.info("No selection made: code 1");
      return null;
    }
    throw err;
  }
}

export async function showRofiDialog(reqLogger, language) {
  const stdout = await showRofiDialog_(reqLogger, language);
  // console.log('stdout', stdout)
  if (!stdout) {
    return null;
  }
  const chosen = stdout.trim();
  // console.log('chosen', chosen)
  if (!chosen) {
    return null;
  }
  // console.log('chosen.split(":")', chosen.split(":"))
  const lineIndexString = chosen.split(":")[0].trim();
  // console.log('lineIndexString', lineIndexString)
  const lineIndex = parseInt(lineIndexString, 10) - 1;
  // console.log('lineIndex', lineIndex)
  return lineIndex
}
