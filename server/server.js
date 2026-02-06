#!/usr/bin/env node

import express from "express";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import crypto from "node:crypto";
import util from "node:util";
import {
  spawn,
  execFile as execFileCallback,
  execSync,
} from "node:child_process";
const execFile = util.promisify(execFileCallback);
import morgan from "morgan";
import winston from "winston";
import debounce from "./debounce-async.js";
import {
  showRofiDialog,
  getElemOfNonEmptyArray,
  txtFile__loadLines,
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
      "-speed",
      speedUp ? "1.4" : "1.1",
      "-af",
      "scaletempo",
      "-volume",
      "30",
      mp3File,
    ],
  },
  3301: {
    program: "mpv",
    args: (mp3File, speedUp) => [
      "--no-video",
      "--volume=30",
      `--speed=${speedUp ? "1.4" : "1.1"}`,
      mp3File,
    ],
  },
  3302: {
    program: "audacious",
    args: (mp3File) => ["-2", "-q", "--headless", mp3File],
  },
  3303: {
    program: "ffplay",
    args: (mp3File, speedUp) => [
      "-nodisp",
      "-autoexit",
      "-volume",
      "30",
      "-af",
      `atempo=${speedUp ? "1.3" : "1.1"}`,
      mp3File,
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
  const u = { 3300: "normal", 3301: "low", 3302: "low", 3303: "low" }[port];
  if (!u) throw new Error(`Invalid urgency level for port ${port}`);
  if (globalState.notifySend) {
    execFile("notify-send", [
      // "-u",
      // u,
      "-c",
      `chat${port - 3299}`,
      "-a",
      `chat${port - 3299}`,
      text,
    ]);
  }
}

function txtFile__getLineByIndex(index, language) {
  const lines = txtFile__loadLines(language);
  return getElemOfNonEmptyArray(lines, index);
}

const globalState = {
  autoplaying: false,
  lastReadLineIndex: 0,
  currentAudioProcess: null,
  stopAfter: null,
  notifySend: true,
};

const generateMp3Path = (lineText) => {
  const hash = crypto.createHash("sha256").update(lineText).digest("hex");
  return path.join(process.env.HOME, "Documents/rofi-audio", `${hash}.mp3`);
};

// Helper: wait for process exit
const waitForExit = (reqLogger, proc) =>
  new Promise((res) => {
    if (!proc) return res();
    proc.once("exit", (code, signal) => {
      reqLogger.info(
        `${proc.spawnfile || "process"} exit: code=${code}, signal=${signal}, pid=${proc.pid}`,
      );
      if (globalState.currentAudioProcess === proc) {
        globalState.currentAudioProcess = null;
      }
      res();
    });
  });

function mplayer(reqLogger, mp3File, language) {
  return new Promise(async (resolve, reject) => {
    // If there's a running player, kill & wait
    if (globalState.currentAudioProcess) {
      reqLogger.info(
        `Killing existing ${globalState.currentAudioProcess.spawnfile || "process"} pid=${globalState.currentAudioProcess.pid}`,
      );
      const oldProc = globalState.currentAudioProcess;
      oldProc.kill();
      await waitForExit(reqLogger, oldProc);
    }

    const speedUp = language === "ru" || language === "km";
    const args = programAndOpts.args(mp3File, speedUp);
    const program = programAndOpts.program;

    const childProcess = spawn(program, args, {
      stdio: ["ignore", "ignore", "ignore"],
    });
    globalState.currentAudioProcess = childProcess;

    const cleanup = () => {
      if (globalState.currentAudioProcess === childProcess) {
        globalState.currentAudioProcess = null;
      }
    };

    childProcess.once("error", (err) => {
      reqLogger.error(`${program} error: ${err}, pid: ${childProcess.pid}`);
      cleanup();
      reject(err);
    });

    childProcess.once("close", (code) => {
      reqLogger.info(`${program} close: code=${code}, pid=${childProcess.pid}`);
      notifySend(`audio stop`);
      cleanup();
      if (
        code === 0 ||
        code === null ||
        code === 1 ||
        code === 123 ||
        code === 4 // mpv
      ) {
        resolve();
      } else {
        reject(new Error(`Process exited with unknown code ${code}`));
      }
    });

    childProcess.once("exit", (code, signal) => {
      reqLogger.info(
        `${program} exit: code=${code}, signal=${signal}, pid=${childProcess.pid}`,
      );
      cleanup();
    });
  });
}

async function playAudio(reqLogger, lineIndex, language) {
  if (!reqLogger) {
    throw new Error(`empty arg reqLogger ${reqLogger}`);
  }
  if (!Number.isInteger(lineIndex)) {
    throw new Error(`empty arg lineIndex ${lineIndex}`);
  }
  if (!language) {
    throw new Error(`empty arg ${language} language`);
  }

  reqLogger.info(`playAudio called with lineIndex: ${lineIndex}`);
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

  globalState.lastReadLineIndex = lineIndex;

  return mplayer(reqLogger, mp3File, language);
}

const app = express();

app.use(cors()); // allows any origin
const resourcesDir =
  "/home/srghma/projects/videochatru-extension/public/resources";
app.use("/resources", express.static(resourcesDir));

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
  playAudio(
    reqLogger,
    globalState.lastReadLineIndex + 1,
    globalState.lastLanguage,
  );
});

app.get("/prev", async (req, res) => {
  const { reqLogger } = req;
  res.send("Playing previous line");
  playAudio(
    reqLogger,
    globalState.lastReadLineIndex - 1,
    globalState.lastLanguage,
  );
});

app.get("/stop", async (_req, res) => {
  startAutoplay_debounced.stop();
  if (globalState.currentAudioProcess) {
    globalState.currentAudioProcess.kill();
  }
  globalState.autoplaying = false;
  globalState.currentAudioProcess = null;
  res.send("Stopped audio");
  notifySend("/stop");
});

// Example usage:
function stopAfter() {
  const optionsFile = path.join(__dirname, `stopAfter.txt`);
  try {
    const content = fs.readFileSync(optionsFile, "utf-8");
    return content === "" ? parseInt(content, 10) : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function startAutoplay(reqLogger, language) {
  try {
    if (globalState.currentAudioProcess) {
      globalState.currentAudioProcess.kill();
    }
    globalState.autoplaying = true;
    globalState.lastReadLineIndex = 0;
    globalState.lastLanguage = language;
    globalState.currentAudioProcess = null;
    while (globalState.autoplaying) {
      reqLogger.info(
        `autoplaying_start while 1, autoplaying: ${globalState.autoplaying}, pid: ${globalState.currentAudioProcess && globalState.currentAudioProcess.pid}`,
      );
      if (!globalState.autoplaying) break; // autoplay_stop was called
      reqLogger.info(
        `autoplaying_start while 2, autoplaying: ${globalState.autoplaying}, pid: ${globalState.currentAudioProcess && globalState.currentAudioProcess.pid}`,
      );
      await playAudio(
        reqLogger,
        globalState.lastReadLineIndex,
        globalState.lastLanguage,
      );
      reqLogger.info(
        `autoplaying_start while 3, autoplaying: ${globalState.autoplaying}, pid: ${globalState.currentAudioProcess && globalState.currentAudioProcess.pid}`,
      );
      while (globalState.currentAudioProcess) {
        reqLogger.warn(`state.currentAudioProcess, waiting`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (globalState.currentAudioProcess) {
          globalState.currentAudioProcess.kill();
        }
      }
      if (globalState.currentAudioProcess) {
        throw new Error("audio process still running");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      reqLogger.info(
        `autoplaying_start while 4, autoplaying: ${globalState.autoplaying}, pid: ${globalState.currentAudioProcess && globalState.currentAudioProcess.pid}`,
      );
      if (!globalState.autoplaying) break; // autoplay_stop was called
      reqLogger.info(
        `autoplaying_start while 5, autoplaying: ${globalState.autoplaying}, pid: ${globalState.currentAudioProcess && globalState.currentAudioProcess.pid}`,
      );
      globalState.lastReadLineIndex = globalState.lastReadLineIndex + 1;

      if (
        globalState.lastReadLineIndex >=
        (stopAfter() || txtFile__loadLines(language).length)
      ) {
        reqLogger.info("Reached end of file. Stopping autoplay.");
        globalState.autoplaying = false;
        break;
      }
    }
  } catch (error) {
    reqLogger.error("Error in autoplay:", error);
    globalState.autoplaying = false;
    throw error;
  }
}

const startAutoplay_debounced = debounce(startAutoplay, 3000);

function memoizeAsync(fn) {
  const cache = new Map();

  return async function (arg) {
    if (cache.has(arg)) {
      return cache.get(arg);
    }
    const result = await fn(arg);
    cache.set(arg, result);
    return result;
  };
}

const countries = CountryLanguage.getCountries();

// Russia -> ru
// russia -> ru
// Ukraine -> ...

// countryFullNameToCountryIso is async now
async function countryFullNameToCountryIso(country) {
  if (!country) return null;

  const lower = country.toLowerCase();

  if (/^[a-z]{2}$/.test(lower)) {
    return lower;
  }

  const foundKnown = {
    russia: "ru",
    ukraine: "ua",
  };

  if (foundKnown[lower]) {
    return foundKnown[lower];
  }

  // Full exact match
  const found = countries.find((c) => c.name.toLowerCase() === lower);
  if (found && found.iso2) {
    return found.iso2.toLowerCase();
  }

  // Partial match
  const partial = countries.find((c) => c.name.toLowerCase().includes(lower));
  if (partial && partial.iso2) {
    return partial.iso2.toLowerCase();
  }

  return null;
}

// Async wrapper for CountryLanguage.getCountryLanguages
async function fetchCountryLanguages(country) {
  return new Promise((resolve, reject) => {
    console.log("CountryLanguage.getCountryLanguages resp");
    CountryLanguage.getCountryLanguages(country.toLowerCase(), (err, langs) => {
      console.log("CountryLanguage.getCountryLanguages resp", err, countries);
      if (err) reject(err);
      else resolve(langs);
    });
  });
}

const memoizedGetCountryLanguages = memoizeAsync(fetchCountryLanguages);

async function countryIsoToLanguageIso(country) {
  if (!country) return null;

  const languages = await memoizedGetCountryLanguages(country);
  let language = languages[0]?.iso639_1;

  // Override some language codes as per your logic
  if (language === "ky") language = "ru";
  if (language === "uz") language = "ru";
  if (language === "fa") language = "ar";
  if (language === "hy") language = "ru";
  if (language === "az") language = "ru";
  if (language === "mk") language = "en";

  return language;
}

function logAndSend(res, status, logger, loggerFnName, text) {
  if (typeof logger[loggerFnName] === "function") {
    logger[loggerFnName](text);
  } else {
    // fallback if function name not found
    console.log(text);
  }
  res.status(status).send(text);
}

app.get("/autoplay_start", async (req, res) => {
  const { reqLogger } = req;
  reqLogger.error(
    `Incoming /autoplay_start query params: ${JSON.stringify(req.query)}`,
  );
  const { country } = req.query;

  if (globalState.autoplaying) {
    logAndSend(res, 409, reqLogger, "error", "Autoplay already started");
    return;
  }

  if (!country) {
    logAndSend(res, 400, reqLogger, "error", "Country parameter missing");
    return;
  }

  let countryIso;
  try {
    countryIso = await countryFullNameToCountryIso(country);
  } catch (e) {
    logAndSend(res, 500, reqLogger, "error", "Failed to get country ISO");
    return;
  }

  reqLogger.error(`country ${countryIso}`);

  if (!countryIso) {
    logAndSend(res, 400, reqLogger, "error", `Unknown country: ${country}`);
    return;
  }

  let language;
  try {
    language = await countryIsoToLanguageIso(countryIso);
  } catch (e) {
    logAndSend(
      res,
      500,
      reqLogger,
      "error",
      "Failed to get language for country",
    );
    return;
  }
  reqLogger.error(`country ${language}`);

  res.send(
    `Autoplay started for country ${country} (ISO: ${countryIso}) language ${language}`,
  );

  if (language !== "ru" && language !== "en") {
    const lines = txtFile__loadLines("en");
    await translateLines({
      lines,
      languageFrom: "en",
      languageTo: language,
    });
  }

  startAutoplay_debounced(reqLogger, language)
    .then(reqLogger.debug.bind(reqLogger))
    .catch(reqLogger.error.bind(reqLogger));
});

app.get("/autoplay_stop", async (req, res) => {
  const { reqLogger } = req;
  console.log("/autoplay_stop", reqLogger, globalState.currentAudioProcess);
  startAutoplay_debounced.stop();
  if (globalState.currentAudioProcess) {
    globalState.currentAudioProcess.kill();
  }
  globalState.autoplaying = false;
  globalState.lastReadLineIndex = 0;
  globalState.currentAudioProcess = null;
  res.send("Autoplay stopped");
  notifySend("/autoplay_stop");
});

app.get("/choose/:line", async (req, res) => {
  const { reqLogger } = req;
  const lineNumber = parseInt(req.params.line, 10);
  await playAudio(reqLogger, lineNumber - 1, globalState.lastLanguage || "ru");
  res.send(`Playing chosen line ${lineNumber}`);
});

app.get("/refresh_list", async (req, res) => {
  const { reqLogger } = req;
  const { country } = req.query;
  const language = country
    ? await countryIsoToLanguageIso(country)
    : globalState.lastLanguage || "ru";
  const lines = txtFile__loadLines(language);
  reqLogger.info(`Sending ${lines.length} lines`);
  res.send(lines);
});

app.get("/notify_send", async (req, res) => {
  const { reqLogger } = req;
  reqLogger.info(
    `/notify_send sending ${JSON.stringify(globalState.notifySend)}`,
  );
  res.json(globalState.notifySend);
});

app.post("/notify_send", express.json(), async (req, res) => {
  const { value } = req.body;
  if (typeof value !== "boolean") {
    return res.status(400).json({ error: "value must be boolean" });
  }

  globalState.notifySend = value;
  req.reqLogger.info(`notifySend updated to ${JSON.stringify(value)}`);
  res.json({ success: true, value });
});

app.get("/set_stop_after/:myint", async (req, res) => {
  globalState.stopAfter =
    req.params.myint === "" ? parseInt(req.params.myint, 10) : null;
  res.send(`${globalState.stopAfter}`);
});

app.get("/rofi", async (req, res) => {
  const { reqLogger } = req;
  const { country } = req.query;
  const language = country
    ? await countryIsoToLanguageIso(country)
    : globalState.lastLanguage || "ru";
  const lineIndex = await showRofiDialog(reqLogger, language);
  if (!Number.isInteger(lineIndex)) {
    res.send(`Rofi: no selection`);
    reqLogger.error(`Rofi: no selection`);
    return;
  }
  reqLogger.info(`lineIndex ${lineIndex}`);
  if (globalState.currentAudioProcess) {
    globalState.currentAudioProcess.kill();
  }
  res.send(`Rofi: selected ${lineIndex}`);
  playAudio(reqLogger, lineIndex, language);
});

app.listen(port, () => logger.info(`Server running on port ${port}`));

// process.on("unhandledRejection", (reason, promise) => {
//   console.error("Unhandled Promise Rejection:", reason, promise);
// });
