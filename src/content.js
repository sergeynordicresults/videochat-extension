const getPort = () => localStorage.getItem('musicPlayerPort') || '3300';
const musicPlayerServerHost = () => `http://localhost:${getPort()}`;
const myPlaySound = false

let settings = {},
  local = { ips: [] },
  stage = 0,
  search = 0,
  found = 0,
  curInfo = {},
  play = 0,
  map,
  countBeforeSaveStats = 0,
  tim,
  dc,
  faceApiLoaded = false,
  buttons = null,
  chat = null,
  resize = false,
  language = window.navigator.language.slice(0, 2),
  timeout,
  requestToStartTiming = 0,
  requestToSkip = false,
  mySkipSound = null;

if (language === "pt") language = "pt-BR";
else if (language === "zh") language = "zh-CN";

const s = document.createElement("script");
s.src = chrome.runtime.getURL("injection/ip-api.js");
s.onload = () => s.remove();
(document.head || document.documentElement).appendChild(s);

const c = document.createElement("link");
c.rel = "stylesheet";
c.href = chrome.runtime.getURL("libs/css/css-tooltip.min.css");
(document.head || document.documentElement).appendChild(c);

const cs = document.createElement("link");
cs.rel = "stylesheet";
cs.href = chrome.runtime.getURL("libs/css/tooltipster.bundle.min.css");
(document.head || document.documentElement).appendChild(cs);

const dark = document.createElement("link");
dark.rel = "stylesheet";
dark.id = "darkMode";
dark.href = chrome.runtime.getURL("resources/dark-mode.css");

const css = document.createElement("style");
css.textContent = "small {font-size: xx-small!important;}";
(document.head || document.documentElement).appendChild(css);

chrome.storage.local.get(null, function (result) {
  local = result;
});

chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (namespace === "sync")
    chrome.storage.sync.get(null, function (result) {
      settings = result;
    });
});

$(document).arrive(".ban-popup__unban_msg.tr", function (el) {
  Arrive.unbindAllArrive();
  let new_el = $(el).clone();
  new_el.css("height", "30px");
  new_el.css("line-height", "26px");
  new_el[0].innerHTML = chrome.i18n.getMessage("avoidBan");
  new_el.insertAfter(el);
});

function stopAndStart(delay) {
  requestToSkip = false;

  if (typeof delay !== "undefined") {
    document.getElementsByClassName("buttons__button stop-button")[0].click();
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      document
        .getElementsByClassName("buttons__button start-button")[0]
        .click();
    }, delay);
  } else {
    requestToStartTiming = +new Date();
    document.getElementsByClassName("buttons__button stop-button")[0].click();
  }
}

// const [textToWrite_first, ...textToWrite] = [
//   `В Википедии написано: Первым живым существом на нашей планете была случайно-появившаяся молекула-робот-саморепликатор (делает копии себя).`,
//   `Она эволюционировала из автокатализатора (катализатор + молекула которая создает катализатор).`,
//   `Если бы у вас было лекарство от старости И смерти, то вы бы поделились с людьми?`,
//   `Я желаю вам вечной жизни и бесконечного количества детей, ведь во Вселенной бесконечное количество еды, территорий и энергии. Люди могут жить вечно.`,
//   `Люди МОГУТ остановить термическую смерть вселенной. Программу умерших людей можно воскрешать по памяти друзей.`,
//   `Русские пытали моего друга Ивана.`,
// ]

// let currentTextToWrite = textToWrite.slice()

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementsByClassName("buttons__button start-button")[0]
    .addEventListener("click", (_e) => {
      if (stage === 3) settings.stats.countManSkip++;

      clearTimeout(timeout);
    });

  document
    .getElementsByClassName("buttons__button stop-button")[0]
    .addEventListener("click", (_e) => {
      clearTimeout(timeout);
    });

  // // console.log('document loaded')
  // document.addEventListener('keyup', function (e) {
  //   // console.log('keyup', e.key)
  //   switch (e.key) {
  //     case "ArrowUp":
  //       if (currentTextToWrite[0]) {
  //         writeTextToTextarea_(currentTextToWrite[0])
  //       }
  //       // remove first
  //       currentTextToWrite.shift()
  //       break;
  //   }
  // })
});

// writeTextToTextarea_(`srghma Сергей Хома.`)
// writeTextToTextarea_(`  `)
//
//
// Законы вселенной СОЗДАЮТ автокатализатор (катализатор + молекула которая создает катализатор) ЭВОЛЮЦИОНИРУЮТ В молекулу кристалл-форму ЭВОЛЮЦИОНИРУЮТ В молекулy-робот.

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeTextToTextarea_(textToWrite) {
  // console.log(textToWrite)
  const input = document.querySelector(".chat input.chat__textarea");
  input.value = textToWrite;

  // Create and dispatch the 'input' event to trigger listeners
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // Create and dispatch a 'keydown' event for the Enter key (keyCode 13)
  const enterEvent = new KeyboardEvent("keydown", {
    key: "Enter",
    keyCode: 13,
    code: "Enter",
    bubbles: true,
  });
  input.dispatchEvent(enterEvent);
}

async function writeTextToTextarea(isCancelledRef) {
  // writeTextToTextarea_(textToWrite_first)
  // if (isCancelledRef.value) { console.log('return1'); return }
  // await sleep(3000)
  // if (isCancelledRef.value) { console.log('return2'); return }
  // writeTextToTextarea_(`Первым живым существом на нашей планете была молекула - робот - саморепликатор(делает копии себя), которая эволюционировала из автокатализатора(катализатор + молекула которая создает катализатор).`)
  // if (isCancelledRef.value) { console.log('return3'); return }
  // await sleep(5000)
  // if (isCancelledRef.value) { console.log('return4'); return }
  // writeTextToTextarea_(`Если бы у вас было лекарство от старости И смерти, то вы бы поделились с людьми ? `)
  // if (isCancelledRef.value) { console.log('return5'); return }
  // await sleep(5000)
  // if (isCancelledRef.value) { console.log('return6'); return }
  // writeTextToTextarea_(`Я желаю вам вечной жизни и бесконечного количества детей, ведь во Вселенной бесконечное количество еды, территорий и энергии.Люди могут жить вечно.`)
  // await sleep(5000)
  // if (isCancelledRef.value) { console.log('return6'); return }
  // writeTextToTextarea_(`Русские пытали моего друга Ивана.`)
}

// Create a cancellation token object
function createCancellationToken() {
  return { value: false };
}

// Modify the debounce function to support async cancellation
function debounce(func, wait) {
  let timeout;
  let currentCancellationToken = null;
  let currentPromise = null;

  return function (...args) {
    // Cancel any ongoing operation
    if (currentCancellationToken) {
      currentCancellationToken.value = true;
    }

    // Create a new cancellation token
    const cancellationToken = createCancellationToken();
    currentCancellationToken = cancellationToken;

    const later = function () {
      timeout = null;
      // Execute the function with the new cancellation token
      currentPromise = func(cancellationToken, ...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    // Return a promise that can be awaited
    return currentPromise;
  };
}

const writeTextToTextarea__debounced = debounce(writeTextToTextarea, 3000);

const sessionId = crypto.randomUUID(); // or generateRandomId()

let searchInterval = null;
const onUpdateIP = function (mutations) {
  if (remoteIP.innerText === "-" || remoteIP.innerText === "") return;
  console.dir("IP CHANGE DETECTED");
  requestToSkip = false;
  if (local.ips.includes(remoteIP.innerText)) {
    settings.stats.countDup++;
    console.dir("old ip");
    if (settings.skipSound) ban.play();
    stopAndStart();
  } else {
    settings.stats.countNew++;
    console.dir("new ip");
    const ip = remoteIP.innerText.replace("[", "").replace("]", "");

    if (searchInterval) {
      clearInterval(searchInterval);
    }
    searchInterval = setInterval(() => {
      const countryElement = document
        .getElementsByClassName("chat__messages")[0]
        ?.getElementsByClassName("tr-country")[0];

      if (countryElement) {
        const country = countryElement.dataset.tr;
        console.log("country", country);

        if (country !== "RU") {
          stopAndStart();
          console.log("not ru, skip", country);
        } else {
          if (myPlaySound) {
            targetSound.play();
          }
          $.getJSON(`${musicPlayerServerHost()}/autoplay_start?waitMilliseconds=2000&country=${country.toLowerCase()}&sessionId=${sessionId}`);
          // writeTextToTextarea__debounced();
        }

        clearInterval(searchInterval);
      }
    }, 100);

    return;

    // $.getJSON(`https://ipinfo.io/${ip}`, {
    //     token: "TODO"
    //     // $.getJSON("http://ip-api.com/json/" + , {
    //     // lang: language,
    //     // fields: "status,message,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query"
    // })
    //     .done(function (json) {
    //         // if (ip !== json.query) {
    //         //     return
    //         // }
    //         curInfo = json
    //         startDate = +new Date() / 1000
    //         let strings = []
    //
    //         if (settings.showMore && (json.mobile || json.proxy || json.hosting)) {
    //             if (json.mobile)
    //                 strings.push("<small>MOBILE</small>")
    //             if (json.proxy)
    //                 strings.push("<small>PROXY</small>")
    //             if (json.hosting)
    //                 strings.push("<small>HOSTING</small>")
    //         }
    //
    //         const remoteInfo = document.getElementById("remoteInfo")
    //         if (settings.hideMobileLocation && json.mobile) {
    //             remoteInfo.innerHTML = chrome.i18n.getMessage("apiCountry") + json.country + " [" + json.countryCode + "] </br></br><b>TZ: </b><sup id='remoteTZ'>" + json.timezone + "</sup> (<sup id = 'remoteTime'>" + new Date().toLocaleTimeString("ru", { timeZone: json.timezone }).slice(0, -3) + "</sup>) </br><b>TM: </b><sup id='remoteTM'>" + secondsToHms(+new Date() / 1000 - startDate) + "</sup>"
    //
    //         } else {
    //             remoteInfo.innerHTML = chrome.i18n.getMessage("apiCountry") + json.country + " [" + json.countryCode + "] </br></br>" +
    //                 chrome.i18n.getMessage("apiCity") + json.city + " (" + json.region + ") </br>" +
    //                 chrome.i18n.getMessage("apiRegion") + json.region + "</br>" +
    //                 "<b>TZ: </b><sup id='remoteTZ'>" + json.timezone + "</sup> (<sup id = 'remoteTime'>" + new Date().toLocaleTimeString("ru", { timeZone: json.timezone }).slice(0, -3) + "</sup>)</br>" +
    //                 "<b>TM: </b><sup id='remoteTM'>" + secondsToHms(+new Date() / 1000 - startDate) + "</sup>"
    //         }
    //
    //         if (strings.length > 0)
    //             remoteInfo.innerHTML += "</br>" + strings.join('<small> || </small>')
    //
    //         console.log(json)
    //         if (json.country !== "RU") {
    //             stopAndStart()
    //             console.log('not ru, skip', json.country)
    //             return
    //         }
    //         targetSound.play()
    //
    //         // if (settings.enableTargetCity || settings.enableTargetRegion) {
    //         //     if (settings.skipMobileTarget && json.mobile) {
    //         //         stopAndStart()
    //         //         return
    //         //     } else {
    //         //         if (settings.enableTargetCity) {
    //         //             if (json.city !== settings.targetCity) {
    //         //                 stopAndStart()
    //         //                 return
    //         //             } else {
    //         //                 if (settings.targetSound) {
    //         //                     targetSound.play()
    //         //                     console.dir(`FOUND TARGET CITY: ${settings.targetCity}`)
    //         //                 }
    //         //             }
    //         //         }
    //         //         if (settings.enableTargetRegion) {
    //         //             if (json.region !== settings.targetRegion) {
    //         //                 stopAndStart()
    //         //                 return
    //         //             } else {
    //         //                 if (settings.targetSound) {
    //         //                     targetSound.play()
    //         //                     console.dir(`FOUND TARGET REGION: ${settings.targetRegion}`)
    //         //                 }
    //         //             }
    //         //         }
    //         //     }
    //         // }
    //
    //         if (typeof marker !== 'undefined')
    //             map.removeLayer(marker)
    //
    //         if (typeof circle !== 'undefined')
    //             map.removeLayer(circle)
    //
    //         if (settings.hideMobileLocation && json.mobile) {
    //             circle = L.circle([json.lat, json.lon], 300000, {
    //                 color: 'red',
    //                 fillColor: '#f03',
    //                 fillOpacity: 0.2
    //             })
    //
    //             map.setView(new L.LatLng(json.lat, json.lon), 5);
    //             marker = new L.Marker([json.lat, json.lon]);
    //         } else {
    //             circle = L.circle([json.lat, json.lon], 30000, {
    //                 color: 'blue',
    //                 fillColor: '#808080',
    //                 fillOpacity: 0.1
    //             })
    //
    //             map.setView(new L.LatLng(json.lat, json.lon), 13);
    //             marker = new L.Marker([json.lat, json.lon]);
    //         }
    //
    //         map.addLayer(circle)
    //         map.addLayer(marker)
    //     })
    //     .fail(function (jqxhr, textStatus, error) {
    //         const remoteInfo = document.getElementById("remoteInfo")
    //         remoteInfo.innerHTML = "<b>HTTP ERROR " + jqxhr.status + "</b>"
    //         if (settings.enableTargetCity || settings.enableTargetRegion) {
    //             if (jqxhr.status === 429) {
    //                 stopAndStart(5000)
    //             }
    //         }
    //     });
  }
};

const onChangeStage = function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.attributeName === "class") {
      if (stage === 3) {
        settings.stats.time += parseInt((Date.now() - play) / 1000);
      }

      // currentTextToWrite = textToWrite.slice()

      const attributeValue = $(mutation.target).prop(mutation.attributeName);
      if (attributeValue.includes("s-search")) {
        if (remoteIP.innerText !== "") remoteIP.innerText = "-";
        console.dir("СТАДИЯ ПОИСКА");
        stage = 1;
        // offline.play()
        $.getJSON(`${musicPlayerServerHost()}/autoplay_stop?sessionId=${sessionId}`);

        clearInterval(tim);
        localStage.innerText = 1;
        // remoteFace.innerHTML = ''
        if (play < search) {
          // console.log("Dialog ended before even started")
        }

        search = Date.now();
        if (myPlaySound) {
          mySkipSound.play();
        }
      } else if (attributeValue.includes("s-found")) {
        console.dir("СТАДИЯ НАШЕЛ");

        // remoteFace.innerHTML = ''
        stage = 2;
        localStage.innerText = 2;

        found = Date.now();
        if (requestToSkip) stopAndStart();
      } else if (attributeValue.includes("s-play")) {
        // online.play()
        console.dir("СТАДИЯ ВОСПРОИЗВЕДЕНИЯ");

        stage = 3;
        localStage.innerText = 3;

        clearInterval(tim);
        tim = setTimeout(detectGender, 0);

        play = Date.now();
        console.log(
          "Loading took: ",
          parseFloat((play - found) / 1000).toFixed(2),
          "sec",
        );

        if (requestToSkip || remoteIP.innerText === "-") {
          requestToStartTiming = +new Date();
          document
            .getElementsByClassName("buttons__button stop-button")[0]
            .click();
        } else settings.stats.countAll++;
      } else if (attributeValue.includes("s-stop")) {
        // offline.play()
        clearInterval(tim);
        console.dir("СТАДИЯ СТОП");

        if (remoteIP.innerText !== "") remoteIP.innerText = "-";
        remoteFace.innerHTML = "";

        nsfwInfo.style.display = "none";

        stage = 0;
        localStage.innerText = 0;

        if (
          requestToStartTiming !== 0 &&
          +new Date() - requestToStartTiming < 1000
        ) {
          requestToStartTiming = 0;
          document
            .getElementsByClassName("buttons__button start-button")[0]
            .click();
        }
      }

      updStats(false);
    }
  });
};

function syncBlackList() {
  if (settings.dontBanMobile) {
    if (!curInfo.mobile) {
      local.ips.push(remoteIP.innerText);
      chrome.storage.local.set({ ips: local.ips });

      if (settings.skipSound) male.play();
    }
  } else {
    local.ips.push(remoteIP.innerText);
    chrome.storage.local.set({ ips: local.ips });

    if (settings.skipSound) male.play();
  }
}

async function detectGender() {
  if (!settings.skipMale && !settings.skipFemale && !settings.enableFaceApi)
    return;
  let stop = false;
  let skip_m = false;
  let skip_f = false;
  let text = "";
  if (stage === 3) {
    console.time("faceapi: detectAllFaces()");

    clearInterval(tim);

    array = await faceapi
      .detectAllFaces(
        document.getElementById("remote-video"),
        new faceapi.TinyFaceDetectorOptions(),
      )
      .withAgeAndGender();

    for (let i = 0; i < array.length; i++) {
      text += `<b>* ${array[i].gender} (${(array[i].genderProbability * 100).toFixed(0) + "%"}), ${array[i].age.toFixed(0)}</b></br>`;
      if (
        array[i].gender === "male" &&
        (array[i].genderProbability * 100).toFixed(0) > 90
      ) {
        skip_m = true;
        stop = true;
        settings.stats.countMales++;
      }
      if (
        array[i].gender === "female" &&
        (array[i].genderProbability * 100).toFixed(0) > 90
      ) {
        skip_f = true;
        stop = true;
        settings.stats.countFemales++;
      }
    }

    if (skip_m && settings.skipMale) {
      text += `<b>male skipping...</b></br>`;
      document
        .getElementsByClassName("buttons__button start-button")[0]
        .click();
      console.log("MALE SKIPPED");
      settings.stats.countMaleSkip++;
      settings.stats.countManSkip--;

      if (settings.autoBan) {
        syncBlackList();
      }
    }

    if (skip_f && settings.skipFemale) {
      text += `<b>female skipping...</b></br>`;
      document
        .getElementsByClassName("buttons__button start-button")[0]
        .click();
      console.log("FEMALE SKIPPED");
      settings.stats.countFemaleSkip++;
      settings.stats.countManSkip--;

      if (settings.autoBan) {
        syncBlackList();
      }
    }

    if (text !== "") remoteFace.innerHTML = text;

    console.timeEnd("faceapi: detectAllFaces()");
  }
  if (!stop) tim = setTimeout(detectGender, 500);
}

let startInterval = null;
chrome.storage.sync.get(null, function (result) {
  settings = result;

  document.addEventListener("DOMContentLoaded", () => {
    buttons = $(".buttons")[0];
    chat = $(".chat")[0];

    injectInterface();

    if (settings.hideLogo) {
      document.getElementById("logo-link").style.display = "none";
    }

    if (settings.hideWatermark) {
      document.getElementsByClassName(
        "remote-video__watermark",
      )[0].style.opacity = 0.0;
    }

    if (settings.hideBanner) {
      document.getElementsByClassName(
        "caption remote-video__info",
      )[0].style.opacity = 0.0;
    }

    if (settings.doNotReflect) {
      $("#local-video").removeClass("video-container-local-video");
    }

    if (settings.hideCamera) {
      $("#local-video-wrapper")[0].style.display = "none";
    }

    if (startInterval) {
      clearInterval(startInterval);
    }
    startInterval = setInterval(() => {
      if (settings.skipFourSec) {
        try {
          if (stage === 2 && found + 4000 < Date.now()) {
            console.dir("Skipping due to loading time limit");
            document
              .getElementsByClassName("buttons__button start-button")[0]
              .click();
            settings.stats.countManSkip--;
          }
        } catch (e) {
          //console.dir(e)
        }
      }
    }, 100);

    if (settings.autoResume) {
      document.getElementById("overlay").style.background = "none";
      // document.getElementById('overlay').style.position = "unset"

      document.getElementById("local-video-warning-popup").style.filter =
        "opacity(0)";
      new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.attributeName === "class") {
            if (mutation.target.className.includes("disabled")) {
              $(".ok").removeClass("disabled");
              document
                .getElementsByClassName("video-warning__btn")[0]
                .firstElementChild.click();
            }
          }
        });
      }).observe($(".ok")[0], { attributes: true });
    }

    if (!settings.ipApiLocalisation) language = "en";

    if (settings.hotkeys) {
      document.removeEventListener("keyup", hotkeys);
      document.addEventListener("keyup", hotkeys);
    }

    if (settings.skipMale || settings.skipFemale || settings.enableFaceApi) {
      setTimeout(async () => {
        console.time("faceapi: loading models");
        await faceapi.nets.tinyFaceDetector.loadFromUri(
          chrome.runtime.getURL("resources/models"),
        );
        await faceapi.nets.ageGenderNet.loadFromUri(
          chrome.runtime.getURL("resources/models"),
        );
        console.timeEnd("faceapi: loading models");

        console.time("faceapi: initial facedetect");
        remoteFace.innerHTML = chrome.i18n.getMessage("initialFaceDetect");
        let tempImage = document.createElement("img");
        tempImage.src =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXY/j//z8ABf4C/qc1gYQAAAAASUVORK5CYII=";
        await faceapi
          .detectAllFaces(tempImage, new faceapi.TinyFaceDetectorOptions())
          .withAgeAndGender();
        console.timeEnd("faceapi: initial facedetect");
        remoteFace.innerHTML = "";

        faceApiLoaded = true;

        tim = setTimeout(detectGender, 200);
      }, 0);
    }

    if (settings.risky) {
      if (settings.mirror || settings.mirrorAlt || settings.prikol) {
        if (settings.prikol) {
          const prikolV = document.createElement("video");
          prikolV.id = "prikol";
          prikolV.loop = "loop";
          prikolV.autoplay = "autoplay";
          prikolV.muted = true;
          prikolV.src = chrome.runtime.getURL("resources/prikol.mp4");
          prikolV.width = 0;
          prikolV.onload = () => s1.remove();

          header.appendChild(prikolV);
        }

        const s1 = document.createElement("script");
        s1.src = chrome.runtime.getURL("injection/camera-hijack.js");
        s1.onload = () => s1.remove();
        (document.head || document.documentElement).appendChild(s1);
      }

      if (settings.ws) {
        if (settings.wsconfig.theyskipsound) {
          skip = document.createElement("AUDIO");
          skip.id = "skip";
          skip.src = chrome.runtime.getURL("resources/audio/skip.mp3");
          document.body.appendChild(skip);
          skip.volume = 0.3;
        }

        const wss = document.createElement("script");
        wss.src = chrome.runtime.getURL("injection/ws.js");
        wss.onload = () => wss.remove();
        (document.head || document.documentElement).appendChild(wss);
      }
    }

    if (settings.streamer) {
      if (settings.blurReport)
        document.getElementById("report-screen").style.filter = "blur(10px)";

      if (settings.cover || settings.coverPreview || settings.coverNoise) {
        $(
          createElement("img", {
            src: settings.coverSrc,
            id: "cover",
            style: "height:100%; position: absolute;",
          }),
        ).insertBefore("#remote-video");

        $(
          createElement("img", {
            src: settings.coverSrc,
            id: "cover2",
            style: "height:100%; position: absolute; transform: scaleX(-1)",
          }),
        ).insertBefore("#local-video");

        if (settings.coverPreview)
          $(".remote-video__preview")[0].style.display = "none";

        if (settings.coverNoise) {
        }
        $(".remote-video__noise")[0].style.display = "none";
      }

      const nsfwjs = document.createElement("script");
      nsfwjs.src = chrome.runtime.getURL("libs/js/nsfwjs.min.js");
      nsfwjs.onload = () => {
        nsfwjs.remove();
        const nsfw = document.createElement("script");
        nsfw.src = chrome.runtime.getURL("injection/streamer-mode.js");
        nsfw.onload = () => nsfw.remove();
        (document.head || document.documentElement).appendChild(nsfw);
      };
      (document.head || document.documentElement).appendChild(nsfwjs);
    }

    if (settings.darkMode)
      (document.body || document.documentElement).appendChild(dark);

    new ResizeObserver(outputsize).observe(
      document.getElementsByClassName("chat-container")[0],
    );

    const observer = new MutationObserver(onUpdateIP);
    observer.observe(document.getElementById("remoteIP"), {
      attributes: true,
      childList: true,
      characterData: true,
    });

    var observer2 = new MutationObserver(onChangeStage);
    observer2.observe(document.getElementById("remote-video-wrapper"), {
      attributes: true,
    });
  });

  // $.getJSON("https://ipinfo.io/${ip}", {
  //     token: "TODO"
  //     // $.getJSON("http://ip-api.com/json/", {
  //     //     fields: "status,message,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query"
  // }).done(function (_json) {
  //     const remoteInfo = document.getElementById("remoteInfo")
  //     remoteInfo.innerHTML = chrome.i18n.getMessage("api_working")
  // }).fail(function (_jqxhr, textStatus, error) {
  //     const remoteInfo = document.getElementById("remoteInfo")
  //     if (error === "") {
  //         remoteInfo.innerHTML = chrome.i18n.getMessage("api_insecure")
  //     } else {
  //         const err = textStatus + ", " + error;
  //         remoteInfo.innerHTML = "<b>" + err + "</b>"
  //         console.error("Request Failed: " + err);
  //     }
  // });
});
