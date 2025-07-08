#!/usr/bin/env node

import express from "express";
import fs from "node:fs";
import path from "node:path";
import cors from 'cors'
import crypto from "node:crypto";
import util from "node:util";
import {
  spawn,
  exec as execCallback,
  execFile as execFileCallback,
  execSync,
} from "node:child_process";
const exec = util.promisify(execCallback);
const execFile = util.promisify(execFileCallback);
import morgan from "morgan";
import winston from "winston";
import debounce from "./debounce-async.js";
import {
  showRofiDialog,
  getElemOfNonEmptyArray,
  txtFile__loadLines,
  txtFile__doesExist,
} from "./utils.js";
import { translateLines } from "./translate-with-cache.js";
import * as CountryLanguage from "@ladjs/country-language";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const port = process.env.PORT || 3300;

function isProgramAvailable(program) {
  try {
    execSync(`command -v ${program}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const playerByPort = {
  3300: {
    program: "mplayer",
    args: (mp3File, speedUp) => [
      "-speed", speedUp ? "1.4" : "1.1",
      "-af", "scaletempo",
      "-volume", "30",
      mp3File
    ],
  },
  3301: {
    program: "mpv",
    args: (mp3File, speedUp) => [
      "--no-video",
      "--volume=30",
      `--speed=${speedUp ? "1.4" : "1.1"}`,
      mp3File
    ],
  },
  3302: {
    program: "audacious",
    args: (mp3File) => ["-2", "-q", "--headless", mp3File],
  },
  3303: {
    program: "ffplay",
    args: (mp3File, speedUp) => [
      "-nodisp", "-autoexit",
      "-volume", "30",
      "-af", `atempo=${speedUp ? "1.4" : "1.1"}`,
      mp3File
    ],
  },
};

for (const [p, config] of Object.entries(playerByPort)) {
  if (isProgramAvailable(config.program)) {
  } else {
    throw new Error(`Audio player not found for port ${p}: ${config.program}`);
  }
}

try {
  execSync(`command -v gtts-cli`, { stdio: "ignore" });
} catch {
  throw new Error(`nix profile install nixpkgs#python3Packages.gtts`);
}

const programAndOpts = playerByPort[port];
if (!programAndOpts) throw new Error(`Invalid port ${port}`);

// function main() {
//   const lines = txtFile__loadLines();
//   translateLines({ lines, languageFrom: "ru", languageTo: "en" });
// }
// main();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({
      format: "YYYY-MM-DD hh:mm:ss.SSS A",
    }),
    winston.format.align(),
    winston.format.printf((info) => {
      const reqId = info.requestId ? `[${info.requestId}] ` : "";
      return `[${info.timestamp}] ${info.level}: ${info.path} ${reqId}${info.message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

function notifySend(text) {
  return
  const u = { 3300: "normal", 3301: "low", 3302: "low" }[port];
  if (!u) throw new Error(`Invalid urgency level for port ${port}`);
  execFile("notify-send", [
    // "-u",
    // u,
    "-c",
    `chat${port - 3299}`,
    "-a",
    `chat${port - 3299}`,
    text
  ]);
}

function txtFile__getLineByIndex(index, language) {
  const lines = txtFile__loadLines(language);
  return getElemOfNonEmptyArray(lines, index);
}

let state = {
  autoplaying: false,
  lastReadLineIndex: 0,
  currentAudioProcess: null,
  stopAfter: null,
};

const generateMp3Path = (lineText) => {
  const hash = crypto.createHash("sha256").update(lineText).digest("hex");
  return path.join(process.env.HOME, "Documents/rofi-audio", `${hash}.mp3`);
};

function mplayer(reqLogger, mp3File, language) {
  if (state.currentAudioProcess) {
    reqLogger.info("Killing existing mplayer process");
    state.currentAudioProcess.kill();
  }

  return new Promise(function (resolve, reject) {
    const speedUp = language === "ru" || language === "km";

    const args = programAndOpts.args(mp3File, speedUp);
    const program = programAndOpts.program;

    const childProcess = spawn(program, args, {
      stdio: ["ignore", "ignore", "ignore"],
    });
    state.currentAudioProcess = childProcess;

    childProcess.on("error", (err) => {
      reqLogger.error(
        `${program} error: ${err}, pid: ${state.currentAudioProcess?.pid}`,
      );
      if (state.currentAudioProcess === childProcess) {
        state.currentAudioProcess = null;
      }
      reject(err);
    });

    childProcess.on("close", (code) => {
      reqLogger.info(
        `${program} close: code ${code}, pid: ${state.currentAudioProcess?.pid}`,
      );
      if (state.currentAudioProcess === childProcess) {
        state.currentAudioProcess = null;
      }
      if (code === 0 || code === null || code === 1 || code === 123) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    childProcess.on("exit", (code, signal) => {
      reqLogger.info(
        `${program} exit: code: ${code}, signal: ${signal}, pid: ${state.currentAudioProcess?.pid}`,
      );
      if (state.currentAudioProcess === childProcess) {
        state.currentAudioProcess = null;
      }
    });
  });
}

async function playAudio(reqLogger, lineIndex, language) {
  reqLogger.info(`playAudio called with lineIndex: ${lineIndex}`);
  if (!Number.isInteger(lineIndex)) {
    throw new Error(`No line index ${lineIndex}`);
  }
  const lineText = txtFile__getLineByIndex(lineIndex, language);
  if (!lineText) {
    throw new Error(`No text found for line number ${lineIndex}`);
  }

  const mp3File = generateMp3Path(lineText);

  try {
    await fs.promises.access(mp3File);
  } catch {
    reqLogger.info("MP3 file does not exist, generating...", mp3File);
    const disableCheck = language === "uz"; // bc exists but not added
    await execFile(
      "gtts-cli",
      [lineText, "-l", language, "-o", mp3File].concat(
        disableCheck ? ["--nocheck"] : [],
      ),
    );
  }

  reqLogger.info(`Playing: lineText: ${lineText}, mp3File: ${mp3File}`);
  notifySend(`${lineIndex}: ${lineText}`);

  state.lastReadLineIndex = lineIndex;

  return mplayer(reqLogger, mp3File, language);
}

const app = express();

app.use(cors()); // allows any origin

const reqIdCounters = {};
app.use((req, _res, next) => {
  const path = req.path;
  if (!reqIdCounters[path]) {
    reqIdCounters[path] = 0;
  }
  req.reqLogger = logger.child({
    path,
    requestId: reqIdCounters[path]++,
  });
  req.reqLogger.warn(`${req.path} ${JSON.stringify(req.query)}`);
  next();
});

const morganMiddleware = morgan(
  ":method :url :status :res[content-length] - :response-time ms",
  {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
  },
);

app.use(morganMiddleware);

app.get("/next", async (req, res) => {
  const { reqLogger } = req;
  res.send("Playing next line");
  await playAudio(reqLogger, state.lastReadLineIndex + 1, state.lastLanguage);
});

app.get("/prev", async (req, res) => {
  const { reqLogger } = req;
  res.send("Playing previous line");
  await playAudio(reqLogger, state.lastReadLineIndex - 1, state.lastLanguage);
});

app.get("/stop", async (_req, res) => {
  startAutoplay_debounced.stop();
  if (state.currentAudioProcess) {
    state.currentAudioProcess.kill();
  }
  state = {
    ...state,
    autoplaying: false,
    currentAudioProcess: null,
  };
  res.send("Stopped audio");
  notifySend("/stop");
});

// Example usage:
async function startAutoplay(reqLogger, language) {
  try {
    if (state.currentAudioProcess) {
      state.currentAudioProcess.kill();
    }
    state = {
      ...state,
      autoplaying: true,
      lastReadLineIndex: 0,
      lastLanguage: language,
      currentAudioProcess: null,
    };
    while (state.autoplaying) {
      reqLogger.info(
        `autoplaying_start while 1, autoplaying: ${state.autoplaying}, pid: ${state.currentAudioProcess && state.currentAudioProcess.pid}`,
      );
      if (!state.autoplaying) break; // autoplay_stop was called
      reqLogger.info(
        `autoplaying_start while 2, autoplaying: ${state.autoplaying}, pid: ${state.currentAudioProcess && state.currentAudioProcess.pid}`,
      );
      await playAudio(reqLogger, state.lastReadLineIndex, state.lastLanguage);
      reqLogger.info(
        `autoplaying_start while 3, autoplaying: ${state.autoplaying}, pid: ${state.currentAudioProcess && state.currentAudioProcess.pid}`,
      );
      while (state.currentAudioProcess) {
        reqLogger.warn(`state.currentAudioProcess, waiting`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (state.currentAudioProcess) {
          state.currentAudioProcess.kill();
        }
      }
      if (state.currentAudioProcess) {
        throw new Error("audio process still running");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      reqLogger.info(
        `autoplaying_start while 4, autoplaying: ${state.autoplaying}, pid: ${state.currentAudioProcess && state.currentAudioProcess.pid}`,
      );
      if (!state.autoplaying) break; // autoplay_stop was called
      reqLogger.info(
        `autoplaying_start while 5, autoplaying: ${state.autoplaying}, pid: ${state.currentAudioProcess && state.currentAudioProcess.pid}`,
      );
      state.lastReadLineIndex = state.lastReadLineIndex + 1;

      function stopAfter() {
        const optionsFile = path.join(__dirname, `stopAfter.txt`)
        try {
          const content = fs.readFileSync(optionsFile, "utf-8")
          return content === "" ? parseInt(content, 10) : null
        } catch (e) {
          console.error(e)
          return null
        }
      }

      if (state.lastReadLineIndex >= (stopAfter() || txtFile__loadLines(language).length)) {
        reqLogger.info("Reached end of file. Stopping autoplay.");
        state.autoplaying = false;
        break;
      }
    }
  } catch (error) {
    reqLogger.error("Error in autoplay:", error);
    state.autoplaying = false;
    throw error;
  }
}

const startAutoplay_debounced = debounce(startAutoplay, 3000);

function countryIsoToLanguageIso(country) {
  return new Promise((resolve, reject) => {
    CountryLanguage.getCountryLanguages(country, (err, languages) => {
      if (err) {
        reject(err);
      } else {
        let language = languages[0].iso639_1;
        if (language === "ky") language = "ru";
        if (language === "uz") language = "ru";
        if (language === "fa") language = "ar";
        if (language === "hy") language = "ru";
        if (language === "az") language = "ru";
        if (language === "mk") language = "en";
        resolve(language);
      }
    });
  });
}

app.get("/autoplay_start", async (req, res) => {
  const { reqLogger } = req;
  console.log(req.query);
  const { country } = req.query;
  if (state.autoplaying) {
    return res.send("Autoplay already started");
  }

  const language = await countryIsoToLanguageIso(country);

  res.send(`Autoplay started for country ${country} language ${language}`);

  if (language == "ru" || language == "en") {
    // do nothing
  } else {
    const lines = txtFile__loadLines("en");
    await translateLines({
      lines,
      languageFrom: "en",
      languageTo: language,
    });
  }

  startAutoplay_debounced(reqLogger, language)
    .then(reqLogger.debug)
    .catch(reqLogger.error);
});

app.get("/autoplay_stop", async (_req, res) => {
  startAutoplay_debounced.stop();
  if (state.currentAudioProcess) {
    state.currentAudioProcess.kill();
  }
  state = {
    ...state,
    autoplaying: false,
    lastReadLineIndex: 0,
    currentAudioProcess: null,
  };
  res.send("Autoplay stopped");
  notifySend("/autoplay_stop");
});

app.get("/choose/:line", async (req, res) => {
  const { reqLogger } = req;
  const lineNumber = parseInt(req.params.line, 10);
  await playAudio(reqLogger, lineNumber - 1, state.lastLanguage || 'ru');
  res.send(`Playing chosen line ${lineNumber}`);
});

app.get("/refresh_list", async (req, res) => {
  const { reqLogger } = req;
  const { country } = req.query;
  const language = country
    ? await countryIsoToLanguageIso(country)
    : state.lastLanguage || "ru";
  const lines = txtFile__loadLines(language);
  reqLogger.info(`Sending ${lines.length} lines`);
  res.send(lines);
});

app.get("/set_stop_after/:myint", async (req, res) => {
  state.stopAfter = req.params.myint === "" ? parseInt(req.params.myint, 10) : null
  res.send(`${state.stopAfter}`);
});

app.get("/rofi", async (req, res) => {
  const { reqLogger } = req;
  const { country } = req.query;
  const language = country
    ? await countryIsoToLanguageIso(country)
    : state.lastLanguage || "ru";
  const lineIndex = await showRofiDialog(reqLogger, language);
  if (!Number.isInteger(lineIndex)) {
    res.send(`Rofi: no selection`);
    reqLogger.error(`Rofi: no selection`);
    return;
  }
  reqLogger.info(`lineIndex ${lineIndex}`);
  if (state.currentAudioProcess) {
    state.currentAudioProcess.kill();
  }
  res.send(`Rofi: selected ${lineIndex}`);
  await playAudio(reqLogger, lineIndex, language);
});

app.listen(port, () => logger.info(`Server running on port ${port}`));

// process.on("unhandledRejection", (reason, promise) => {
//   console.error("Unhandled Promise Rejection:", reason, promise);
// });
