#!/usr/bin/env node

const port = process.env.PORT || 3300;
const serverUrl = `http://localhost:${port}`;

const commands = {
  rofi: async () => {
    const response = await fetch(`${serverUrl}/rofi`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!data) {
      throw new Error("Invalid response data");
    }
    console.log("Run rofi", data);
  },
  stop: async () => {
    const response = await fetch(`${serverUrl}/stop`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log("Stopped audio");
  },
  next: async () => {
    const response = await fetch(`${serverUrl}/next`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log("Playing next line");
  },
  prev: async () => {
    const response = await fetch(`${serverUrl}/prev`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log("Playing previous line");
  },
  autoplay_start: async () => {
    const response = await fetch(`${serverUrl}/autoplay_start`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log("Autoplay started");
  },
  autoplay_stop: async () => {
    const response = await fetch(`${serverUrl}/autoplay_stop`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log("Autoplay stopped");
  },
  choose: async (line) => {
    if (!line) {
      console.error("Please provide a line number");
      return;
    }
    const response = await fetch(`${serverUrl}/choose/${line}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log(`Playing chosen line ${line}`);
  },
};

const command = process.argv[2];
const arg = process.argv[3];

if (commands[command]) {
  commands[command](arg).catch(console.error);
} else {
  console.log(
    "Invalid command. Available commands: stop, next, prev, autoplay_start, autoplay_stop, choose <line_number>",
  );
}
