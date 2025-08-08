(async () => {
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

  // Load React, ReactDOM
  await loadScript('https://unpkg.com/react@18/umd/react.development.js');
  await loadScript('https://unpkg.com/react-dom@18/umd/react-dom.development.js');

  const { createElement, useState, useEffect } = React;
  const { createRoot } = ReactDOM;

  const getPort = () => localStorage.getItem('musicPlayerPort') || '3300';
  const musicPlayerServerHost = (port) => `http://localhost:${port}`;

  const audioBaseURL = `http://localhost:${getPort()}/resources/audio`;

  const audioFound = new Audio(`${audioBaseURL}/found.mp3`);
  const audioSkip = new Audio(`${audioBaseURL}/skip.mp3`);

  function playAudio(audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(e => console.warn("Audio play failed:", e));
  }

  let observer = null;
  let state_isTaking = true

  async function get_extpectTextResponse(url) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`Response from ${url}:`, text);
      return text;
    } catch (err) {
      console.error('Fetch error:', err);
    }
  }

  function startObserver(allowedCountries, port, sessionId) {
    const targetNode = document.querySelector('.chat__messages');
    if (!targetNode) {
      console.warn('Could not find .chat__messages element.');
      return;
    }

    let skipPlayed = false;

    observer = new MutationObserver(() => {
      const textContent = targetNode.textContent;

      if (textContent.includes('Searching')) {
        console.log('User disconnected — stopping autoplay');
        get_extpectTextResponse(`${musicPlayerServerHost(port)}/autoplay_stop?sessionId=${sessionId}`);
        return;
      }

      if (!textContent.includes('Connection established')) {
        return;
      }

      console.log('got new text', textContent);
      const matches = allowedCountries.some(country => textContent.includes(country));

      if (matches) {
        skipPlayed = false;  // reset skip flag on found country
        const foundCountry = allowedCountries.find(c => textContent.includes(c));
        console.log(`Starting autoplay for ${foundCountry}`);
        playAudio(audioFound);
        get_extpectTextResponse(
          `${musicPlayerServerHost(port)}/autoplay_start?waitMilliseconds=2000&country=${foundCountry.toLowerCase()}&sessionId=${sessionId}`
        );
      } else {
        const nextBtn = Array.from(document.querySelectorAll('.btn.btn-main')).find(
          btn => btn.textContent.trim().toLowerCase() === 'next'
        );
        if (nextBtn) {
          if (!skipPlayed) {
            console.log('clicking next on', textContent);
            playAudio(audioSkip);
            skipPlayed = true;  // mark skip played so no repeat until reset
          } else {
            // Skip audio already played for current skip state, do nothing here
          }
          nextBtn.click();
        } else {
          skipPlayed = false;  // reset if no next button found (optional)
        }
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    console.log('MutationObserver is now watching .chat__messages');
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
      console.log('MutationObserver stopped');
    }
  }

  function ControlPanel() {
    const [countries, setCountries] = useState('Russia, Ukraine');
    const [running, setRunning] = useState(false);
    const [port, setPort] = useState(getPort());
    const sessionId = React.useMemo(() => Math.random().toString(36).slice(2), []);

    useEffect(() => {
      // Start by default
      const allowed = countries.split(',').map(c => c.trim()).filter(Boolean);
      startObserver(allowed, port, sessionId);
      setRunning(true);
      return () => stopObserver();
    }, []);

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

    const toggle = () => {
      if (!running) {
        const allowed = countries.split(',').map(c => c.trim()).filter(Boolean);
        startObserver(allowed, port, sessionId);
        if (allowed.length === 0) return;
        const country = allowed[0];
        get_extpectTextResponse(
          `${musicPlayerServerHost(port)}/autoplay_start?waitMilliseconds=2000&country=${country.toLowerCase()}&sessionId=${sessionId}`
        );
      } else {
        stopObserver();
      }
      setRunning(!running);
    };

    const playNow = () => {
      const allowed = countries.split(',').map(c => c.trim()).filter(Boolean);
      if (allowed.length === 0) return;
      const country = allowed[0];
      get_extpectTextResponse(
        `${musicPlayerServerHost(port)}/autoplay_start?waitMilliseconds=2000&country=${country.toLowerCase()}&sessionId=${sessionId}`
      );
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
          maxWidth: '400px',
          flexDirection: 'column',
        }
      },
      createElement('input', {
        type: 'text',
        value: countries,
        onChange: e => setCountries(e.target.value),
        placeholder: 'Allow only countries',
        style: { flexGrow: 1, padding: '4px' },
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
      createElement(
        'button',
        {
          onClick: toggle,
          style: {
            padding: '4px 12px',
            background: running ? '#e74c3c' : '#2ecc71',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            userSelect: 'none',
          }
        },
        running ? 'Stop' : 'Start'
      ),
      createElement(
        'button',
        {
          onClick: playNow,
          style: {
            padding: '8px 12px',
            background: '#3498db',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            userSelect: 'none',
            width: '100%',
            maxWidth: '160px',
          }
        },
        'Play'
      )
    );
  }

  const buttonsWrapper = document.querySelector('.chat-container > .buttons > .buttons__wrapper');
  if (buttonsWrapper) {
    const container = document.createElement('div');
    buttonsWrapper.appendChild(container);
    createRoot(container).render(createElement(ControlPanel));
  } else {
    console.warn('Could not find .chat-container > .buttons > .buttons__wrapper');
  }

  const hpNavbar = document.getElementById('hpNavbar');
  if (hpNavbar && hpNavbar.parentElement) {
    hpNavbar.parentElement.remove();
  }
})();
