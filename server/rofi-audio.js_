#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

// Define paths and files
const scriptDir = "/home/srghma/.dotfiles/bin";
const optionsFile = path.join(scriptDir, "rofi-audio.txt");
const lastPlayedFile = "/tmp/rofi-audio-last-line";

const lines = fs
  .readFileSync(optionsFile, "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => !!line);

const getLineText = (lineNumber) => lines[lineNumber - 1];

const generateMp3Path = (lineText) => {
  const hash = crypto.createHash("sha256").update(lineText).digest("hex");
  return path.join(process.env.HOME, "Documents/rofi-audio", `${hash}.mp3`);
};

const playAudio = (lineNumber) => {
  const lineText = getLineText(lineNumber);

  if (!lineText) {
    console.log(`No text found for line number ${lineNumber}`);
    return;
  }

  const mp3File = generateMp3Path(lineText);

  if (!fs.existsSync(mp3File)) {
    execSync(`gtts-cli "${lineText}" -l ru -o "${mp3File}"`);
  }

  execSync(`notify-send "${lineNumber}: ${lineText}"`);
  execSync(`audacious "${mp3File}"`);
  fs.writeFileSync(lastPlayedFile, lineNumber.toString());
};

const getLastPlayedLine = () => {
  if (fs.existsSync(lastPlayedFile)) {
    return parseInt(fs.readFileSync(lastPlayedFile, "utf-8"), 10);
  }
  return 0;
};

if (process.argv[2] === "stop") {
  execSync("audacious --stop");
  process.exit(0);
}

if (process.argv[2] === "next") {
  const nextLine = getLastPlayedLine() + 1;
  playAudio(nextLine);
  process.exit(0);
}

if (process.argv[2] === "prev") {
  const nextLine = getLastPlayedLine() - 1;
  playAudio(nextLine);
  process.exit(0);
}

if (process.argv[2] === "choose" && process.argv[3]) {
  const lineNumber = parseInt(process.argv[3], 10);
  playAudio(lineNumber);
  process.exit(0);
}

if (process.argv[2] === "rofi") {
  try {
    const stdout = execSync('rofi -dmenu -p "Play"', {
      input: lines.map((line, index) => `${index + 1}: ${line}`).join("\n"),
      encoding: "utf-8",
    });

    const chosen = stdout.trim();
    if (!chosen) {
      process.exit(0);
    }

    const lineNumberString = chosen.split(":")[0].trim();
    const lineNumber = parseInt(lineNumberString, 10);

    // console.log({
    //   lineNumberString,
    //   chosen,
    //   lineNumber,
    // });
    playAudio(lineNumber);
    process.exit(0);
  } catch (error) {
    if (error.status === 1) {
      process.exit(0);
    }
    throw error;
  }
}
console.log(
  "Invalid command. Use 'stop', 'next', 'choose <line_number>', or 'rofi'.",
);
process.exit(1);
