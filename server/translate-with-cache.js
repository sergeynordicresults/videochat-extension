import translator from "open-google-translator";
// import translate from "google-translate-free";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scriptDir = __dirname;
const dbFileName = "my-translate-files-cache.sqlite";
const dbFilePath = path.join(scriptDir, dbFileName);
// const dbFilePath = path.join(process.env.XDG_CACHE_HOME || `${process.env.HOME}/.cache`, dbFileName);

let db;

export async function openDB() {
  db = await open({
    filename: dbFilePath,
    driver: sqlite3.Database,
  });

  await db.exec(`CREATE TABLE IF NOT EXISTS translations (
    language_from TEXT NOT NULL,
    language_to TEXT NOT NULL,
    original TEXT NOT NULL,
    translation TEXT NOT NULL,
    PRIMARY KEY (language_from, language_to, original)
  )`);
}

// input { from: "en", to: "km", strings: ["im in db", "im not in db"] }
// returns [{ original: "im in db", text_translation: "..." }]
export async function db__getArrayOfTranslations({
  languageFrom,
  languageTo,
  lines,
}) {
  if (lines.length <= 0) return [];

  const placeholders = Array(lines.length).fill("?").join(",");
  const params = [languageFrom, languageTo, ...lines];

  const rows = await db.all(
    `SELECT original, translation
     FROM translations
     WHERE language_from = ?
     AND language_to = ?
     AND original IN (${placeholders})`,
    params,
  );

  return rows.map(({ original, translation }) => ({
    original,
    translation,
  }));
}

// input { from: "en", to: "km", text: "im in db" }
// returns "..."
// input { from: "en", to: "km", text: "im not in db" }
// returns null
export async function db__getTranslation({ languageFrom, languageTo, text }) {
  if (!text) throw new Error("text is required");
  if (!languageFrom) throw new Error("languageFrom is required");
  if (!languageTo) throw new Error("languageTo is required");

  const rows = await db.all(
    `SELECT translation
     FROM translations
     WHERE language_from = ?
     AND language_to = ?
     AND original = ?`,
    [languageFrom, languageTo, text],
  );

  return rows.length > 0 ? rows[0].translation : null;
}

export async function db__upsertArrayOfTranslations({
  languageFrom,
  languageTo,
  translations,
}) {
  if (!translations.length) return;

  const values = translations.map(() => `(?, ?, ?, ?)`).join(",");

  const params = translations.flatMap(({ original, translation }) => [
    languageFrom,
    languageTo,
    original,
    translation,
  ]);

  await db.run(
    `INSERT OR REPLACE INTO translations (language_from, language_to, original, translation) VALUES ${values}`,
    params,
  );
}

export async function translateText({ text, languageFrom, languageTo }) {
  text = text.trim();
  if (!text) throw new Error("text is required");
  if (!languageFrom) throw new Error("languageFrom is required");
  if (!languageTo) throw new Error("languageTo is required");

  if (!db) {
    await openDB();
  }

  // Array { original: String, translation: String }
  const translationFromDB = await db__getTranslation({
    languageFrom,
    languageTo,
    text,
  });

  if (translationFromDB === text) {
    throw new Error(
      `translationFromDB is the same as the original text: ${text}`,
    );
  }

  if (translationFromDB) {
    return translationFromDB;
  }

  // Array { original: String, translation: String }
  const { text: fetchedTranslation } = await translate(text, {
    from: languageFrom,
    to: languageTo,
  });

  if (fetchedTranslation === text) {
    throw new Error(
      `fetchedTranslation is the same as the original text: ${text}`,
    );
  }

  db__upsertArrayOfTranslations({
    translations: [{ original: text, translation: fetchedTranslation }],
    languageFrom,
    languageTo,
  });

  // fs.writeFileSync(
  //   path.join(scriptDir, `rofi-audio--${languageTo}.txt`),
  //   lines
  //     .map((text) => {
  //       if (!text.trim()) return text;
  //       const found = translations.find((t) => t.original === text);
  //       return found ? found.translation : text;
  //     })
  //     .join("\n"),
  // );

  return fetchedTranslation;
}

export async function translateLines({ lines, languageFrom, languageTo }) {
  if (!db) {
    await openDB();
  }

  console.log({
    languageFrom,
    languageTo,
  });

  // Array { original: String, translation: String }
  const translationsFromDB = await db__getArrayOfTranslations({
    languageFrom,
    languageTo,
    lines,
  });

  const listOfWordsToTranslate = lines.filter(
    (text) => !translationsFromDB.find((t) => t.original === text),
  );

  if (
    listOfWordsToTranslate.length + translationsFromDB.length !==
    lines.length
  ) {
    throw new Error(
      `not all words are translated,
      listOfWordsToTranslate.length (${listOfWordsToTranslate.length}) + translationsFromDB.length (${translationsFromDB.length})
      === ${listOfWordsToTranslate.length + translationsFromDB.length}
      !== lines.length (${lines.length})`,
    );
  }

  let fetchedTranslations = [];

  if (listOfWordsToTranslate.length > 0) {
    console.log(
      `requesting google translations ${listOfWordsToTranslate.length}`,
    );
    // console.log({
    //   listOfWordsToTranslate: listOfWordsToTranslate.slice(0, 1),
    //   languageFrom,
    //   languageTo,
    // });

    if (languageFrom === languageTo) {
      throw new Error(
        `fromLanguage === toLanguage: ${fromLanguage} === ${toLanguage}`,
      );
    }

    // Array { original: String, translation: String }
    fetchedTranslations = await translator.TranslateLanguageData({
      listOfWordsToTranslate: listOfWordsToTranslate,
      fromLanguage: languageFrom,
      toLanguage: languageTo,
    });

    fetchedTranslations = fetchedTranslations.map(
      ({ original, translation }) => ({
        original: original.trim(),
        translation: translation.trim(),
      }),
    );
  }

  const invalidTranslations = fetchedTranslations.filter(
    (x) => !x.translation || x.translation === x.original,
  );

  if (invalidTranslations.length > 0) {
    throw new Error(
      `no translation for ${invalidTranslations.map((x) => x.original).join("\n | \n")}`,
    );
  }

  db__upsertArrayOfTranslations({
    translations: fetchedTranslations,
    languageFrom,
    languageTo,
  });

  // console.log({ fetchedTranslations, translationsFromDB });

  const translations = [...fetchedTranslations, ...translationsFromDB];
  const translationsInCorrectOrder = lines.map((text) => {
    const found = translations.find((t) => t.original === text);
    if (!found) throw new Error(`translation not found for ${text}`);
    return found;
  });

  fs.writeFileSync(
    path.join(scriptDir, `rofi-audio--${languageTo}.txt`),
    translationsInCorrectOrder.map((x) => x.translation).join("\n"),
  );

  console.log("translationsInCorrectOrder", translationsInCorrectOrder);
  return translationsInCorrectOrder;
}

// async function main() {
//   const lines = txtFile__loadLines();
//   let translationsBuffer = [];
//   for (const text of lines) {
//     translationsBuffer.push(
//       await translateText({ text, languageFrom: "ru", languageTo: "en" }),
//     );
//   }

//   fs.writeFileSync(
//     path.join(scriptDir, `rofi-audio--${languageTo}.txt`),
//     translationsBuffer.map((text) => text.trim()).join("\n"),
//   );
// }

// main();
