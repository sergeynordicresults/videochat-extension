// ==UserScript==
// @name         New Userscript
// @namespace    http://tampermonkey.net/
// @version      2025-08-08
// @description  try to take over the world!
// @author       You
// @match        https://chatruletka.com/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatruletka.com
// @run-at      document-idle
// @grant        none
// ==/UserScript==

; (function () {
  'use strict';

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timeout waiting for element ' + selector));
      }, timeout);
    });
  }

  function arrayEquals(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
    if (a.length !== b.length) return false;
    return a.every((val, i) => val === b[i]);
  }

  function createWatchedVariable(initialValue) {
    let value = initialValue;
    const listeners = new Set();

    return {
      get() {
        return value;
      },
      set(newVal) {
        if (newVal !== value) {
          value = newVal;
          listeners.forEach(fn => fn(newVal));
        }
      },
      subscribe(fn) {
        listeners.add(fn);
        // return unsubscribe function
        return () => listeners.delete(fn);
      }
    };
  }

  function subscribeDistinct(watchedVar, isEqual = (a, b) => a === b, callback) {
    let lastVal = watchedVar.get();
    return watchedVar.subscribe(newVal => {
      if (!isEqual(lastVal, newVal)) {
        lastVal = newVal;
        callback(newVal);
      }
    });
  }

  async function createChatMessagesObserver(subscriberTextOnChanged) {
    const targetNode = await waitForElement('.chat__messages')
    if (!targetNode) {
      throw new Error('Could not find .chat__messages element.');
    }

    let lastText = null;

    const observer = new MutationObserver(() => {
      const textContent = targetNode.textContent;
      console.log('new textContent', textContent)
      console.log('textContent !== lastText', textContent !== lastText)
      if (textContent !== lastText) {
        lastText = textContent;
        subscriberTextOnChanged(textContent);
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Return a function to stop observing
    return () => observer.disconnect();
  }

  // searching, found, stop
  function chatMessageToVariableState(textContent, allowedCountries) {
    console.log('chatMessageToVariableState', textContent, allowedCountries)
    if (textContent.includes('Searching')) {
      return ["searching"];
    } else if (textContent.includes('Connection established')) {
      const isAllowedCountry = allowedCountries.some(country => textContent.includes(country));
      if (!isAllowedCountry) {
        return ["found", null]
      }
      const foundCountry = allowedCountries.find(c => textContent.includes(c));
      return ["found", foundCountry];
    }

    return ["stop"]; // default state instead of throwing error
  }

  async function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function playAudio(audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(e => console.warn("Audio play failed:", e));
  }

  async function get_extpectTextResponse(url) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      return text;
    } catch (err) {
      console.error('Fetch error:', err);
    }
  }

  function createGlobalState() {
    // Global state management - now stores full array from chatMessageToVariableState
    let observerStopFunction = null;
    const state = createWatchedVariable(["stop"]); // stores array: ["searching"] | ["found", "found allowed country e.g. Russia" | null] | ["stop"]
    let allowedCountries = [];
    let onStateChangedDistinctFn = null;
    let onStateChangedFn = null;

    return {
      getState() {
        return state.get();
      },
      setAllowedCountries(newAllowedCountries) {
        allowedCountries = newAllowedCountries;
      },
      setOnStateChanged(fn) {
        if (onStateChangedFn) {
          throw new Error('onStateChangedFn already full, cannot set another');
        }
        onStateChangedFn = fn;
        const unsubscribe = state.subscribe(fn)
        return () => {
          unsubscribe()
          onStateChangedFn = null
        };
      },
      setOnStateChangedDistinct(fn) {
        if (onStateChangedDistinctFn) {
          throw new Error('onStateChangedDistinctFn already full, cannot set another');
        }
        onStateChangedDistinctFn = fn;
        const unsubscribeDistinct = subscribeDistinct(state, arrayEquals, fn)
        return () => {
          unsubscribeDistinct()
          onStateChangedDistinctFn = null
        };
      },
      startObserver: async () => {
        if (observerStopFunction) {
          throw new Error('first should stop');
        }

        observerStopFunction = await createChatMessagesObserver((textContent) => {
          console.log('Chat message changed:', textContent);
          const newStateArray = chatMessageToVariableState(textContent, allowedCountries);
          state.set(newStateArray);
        });
        console.log('Chat messages observer started');
      }
    };
  }

  function countriesTextToArray(str) {
    return str.split(',').map(c => c.trim()).filter(Boolean);
  }

  function assertIsStringAndReturn(str) {
    if (typeof str === 'string') { return str }
    throw new Error('not string')
  }

  (async () => {
    // Load React, ReactDOM
    await Promise.all([
      loadScript('https://unpkg.com/react@18/umd/react.production.min.js'),
      loadScript('https://unpkg.com/react-dom@18/umd/react-dom.production.min.js'),
    ]);

    const { createElement, useState, useEffect, useRef } = React;

    const getPort = () => localStorage.getItem('musicPlayerPort') || '3300';
    const musicPlayerServerHost = (port) => `http://localhost:${port}`;

    const audioBaseURL = `http://localhost:${getPort()}/resources/audio`;

    const audioFound = new Audio(`${audioBaseURL}/found.mp3`);
    const audioSkip = new Audio(`${audioBaseURL}/skip.mp3`);

    // Create global state instance
    const globalState = createGlobalState();

    function ControlPanel() {
      const [allowedCountriesText, setAllowedCountriesText] = useState('Russia, Ukraine');
      const [port, setPort] = useState(getPort());
      const [currentState, setCurrentState] = useState(assertIsStringAndReturn(globalState.getState()[0]));
      const [utterances, setUtterances] = useState([]);
      const sessionId = React.useMemo(() => Math.random().toString(36).slice(2), []);
      const lastFoundCountryRef = useRef('ru');
      const [sendAutoplayOnNewFoundUser, setSendAutoplayOnNewFoundUser] = useState(true);

      const refreshUtterances = async () => {
        const res = await fetch(`${musicPlayerServerHost(port)}/refresh_list`);
        const array = await res.json();
        if (!Array.isArray(array)) {
          throw new Error(`not array ${array}`)
        }
        setUtterances(array)
      };

      useEffect(() => {
        console.log('setAllowedCountries')
        globalState.setAllowedCountries(countriesTextToArray(allowedCountriesText));
        refreshUtterances()
        // start watching chat messages
        try {
          globalState.startObserver();
        } catch (err) {
          console.error(err);
        }
      }, []);

      useEffect(() => {
        function handleUnload() {
          const url = `http://localhost:${port}/autoplay_stop?sessionId=${sessionId}`;

          if (navigator.sendBeacon) {
            navigator.sendBeacon(url);
          } else {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, false); // synchronous fallback
            try {
              xhr.send();
            } catch {
              // ignore
            }
          }
        }

        window.addEventListener('unload', handleUnload);

        return () => {
          window.removeEventListener('unload', handleUnload);
        };
      }, [port, sessionId]); // re-attach if port or sessionId changes

      useEffect(() => {
        // Set up state change handler for distinct changes
        const unsubscribe = globalState.setOnStateChanged(newStateArray => {
          console.log('State changed undistinctly to:', newStateArray);
          const [stateType, foundAllowedCountry] = newStateArray;
          lastFoundCountryRef.ref = foundAllowedCountry

          if (stateType === "found") {
            if (foundAllowedCountry === null) {
              // Country not in allowed list - skip
              console.log('Playing skip audio and clicking next');
              playAudio(audioSkip);
              const nextBtn = Array.from(document.querySelectorAll('.btn.btn-main')).find(
                btn => btn.textContent.trim().toLowerCase() === 'next'
              );
              if (nextBtn) {
                nextBtn.click();
              }
            }
          }
        })

        const unsubscribeDistinct = globalState.setOnStateChangedDistinct(newStateArray => {
          console.log('State changed distinctly to:', newStateArray, 'sendAutoplayOnNewFoundUser', sendAutoplayOnNewFoundUser);

          const [stateType, foundAllowedCountry] = newStateArray;
          setCurrentState(stateType);

          if (stateType === "searching") {
            console.log('User disconnected — stopping autoplay');
            get_extpectTextResponse(`${musicPlayerServerHost(port)}/autoplay_stop?sessionId=${sessionId}`);
          } else if (stateType === "found" && foundAllowedCountry !== null && sendAutoplayOnNewFoundUser) {
            console.log(`Starting autoplay for ${foundAllowedCountry}`);
            playAudio(audioFound);
            get_extpectTextResponse(
              `${musicPlayerServerHost(port)}/autoplay_start?waitMilliseconds=2000&country=${foundAllowedCountry.toLowerCase()}&sessionId=${sessionId}`
            );
          }
        });

        return () => {
          unsubscribe();
          unsubscribeDistinct();
        }
      }, [port, sessionId, allowedCountriesText]);

      // Save port if valid (simple numeric check)
      const onPortChange = (e) => {
        const val = e.target.value.trim();
        if (/^\d{1,5}$/.test(val)) {
          localStorage.setItem('musicPlayerPort', val);
          setPort(val);
        } else {
          setPort(val); // keep input but don't save invalid port
        }
      };

      const autoplayStart = () => {
        const lastFoundCountry = lastFoundCountryRef.current;
        if (!lastFoundCountry) {
          throw new Error(`no lastFoundCountry ${lastFoundCountry}`)
        };
        get_extpectTextResponse(
          `${musicPlayerServerHost(port)}/autoplay_start?waitMilliseconds=2000&country=${lastFoundCountry.toLowerCase()}&sessionId=${sessionId}`
        );
      };

      const autoplayStop = () => {
        get_extpectTextResponse(`${musicPlayerServerHost(port)}/autoplay_stop?sessionId=${sessionId}`);
      };

      const playUtterance = async (index) => {
        get_extpectTextResponse(`${musicPlayerServerHost(port)}/choose/${encodeURIComponent(index + 1)}`);
      };

      return createElement(
        'div',
        {
          style: {
            marginTop: '10px',
            padding: '8px',
            border: '1px solid #ccc',
            background: '#fafafa',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            // maxWidth: '400px',
            flexDirection: 'column',
          }
        },
        // Status indicator
        createElement('div', {
          style: { display: 'flex', gap: '8px', width: '100%' }
        },
          createElement('div', {
            style: {
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              background: currentState === 'found' ? '#2ecc71' :
                currentState === 'searching' ? '#f39c12' :
                  currentState === 'skip' ? '#e74c3c' : '#95a5a6',
              color: 'white'
            }
          }, `Status: ${currentState.toUpperCase()}`),
          createElement('span', {
            style: {
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              background: sendAutoplayOnNewFoundUser ? '#27ae60' : '#c0392b',
              color: 'white'
            }
          }, sendAutoplayOnNewFoundUser ? 'Sending autoplay on new found user' : 'Not sending autoplay on new user'),
        ),

        // inputs
        createElement('div', {
          style: { display: 'flex', gap: '8px', width: '100%' }
        },
          createElement('input', {
            type: 'text',
            value: allowedCountriesText,
            onChange: e => setAllowedCountriesText(e.target.value),
            placeholder: 'Allow only countries',
            style: { width: '100%', padding: '4px' },
            title: 'Comma-separated list of countries to allow',
          }),
          createElement('input', {
            type: 'text',
            value: port,
            onChange: onPortChange,
            placeholder: 'Server port',
            style: { width: '70px', padding: '4px' },
            title: 'Port for the music player server (numeric only)',
          }),
        ),

        // buttons
        createElement('div', {
          style: { display: 'flex', gap: '8px', width: '100%' }
        },
          createElement(
            'button',
            {
              onClick: autoplayStart,
              style: {
                padding: '4px 12px',
                background: '#2ecc71',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                userSelect: 'none',
              }
            },
            'Autoplay Start'
          ),
          createElement(
            'button',
            {
              onClick: autoplayStop,
              style: {
                padding: '4px 12px',
                background: 'red',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                userSelect: 'none',
              }
            },
            'Autoplay Stop'
          ),
          createElement('button', {
            onClick: () => setSendAutoplayOnNewFoundUser(prev => !prev),
            style: {
              padding: '4px 12px',
              background: sendAutoplayOnNewFoundUser ? '#27ae60' : '#c0392b',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              userSelect: 'none',
            }
          }, sendAutoplayOnNewFoundUser ? 'Autoplay ON' : 'Autoplay OFF'),
        ),

        // Utterances list
        createElement('ul', {
          id: "utteranceList",
          style: { marginTop: '10px', paddingLeft: '20px', width: '100%' }
        },
          utterances.map((line, index) =>
            createElement('li', {
              key: index,
              style: { cursor: 'pointer', margin: '4px 0', fontSize: 'x-small' },
              onClick: () => playUtterance(index)
            }, `${index + 1}. ${line}`)
          )
        ),
      );
    }

    const buttonsWrapper = await waitForElement('.chat-container > .buttons > .buttons__wrapper', 30000)
    const container = document.createElement('div');
    buttonsWrapper.appendChild(container);
    ReactDOM.createRoot(container).render(React.createElement(ControlPanel));

    // Remove navbar if present
    const hpNavbar = document.getElementById('hpNavbar');
    if (hpNavbar && hpNavbar.parentElement) {
      hpNavbar.parentElement.remove();
    }

    // Apply custom styles
    const style = document.createElement('style');
    style.textContent = `
      #roulette.vertical .roulette-box .chat-container .buttons .buttons__wrapper {
        display: flex;
        flex-direction: column;
      }
      #roulette.vertical .roulette-box .chat-container .buttons .buttons__wrapper .buttons__button {
        min-height: 20px;
      }
    `;
    document.head.appendChild(style);
  })();
})();
