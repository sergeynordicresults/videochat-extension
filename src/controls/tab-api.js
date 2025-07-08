function createTabApi() {
    const getPort = () => localStorage.getItem('musicPlayerPort') || '3300';
    const musicPlayerServerHost = () => `http://localhost:${getPort()}`;

    const inputPort = createElement('input', {
        id: "musicPort",
        type: "text",
        value: getPort(),
        placeholder: "Enter port",
        oninput: (e) => {
            const newPort = e.target.value;
            localStorage.setItem('musicPlayerPort', newPort);
        },
        style: "margin-bottom: 10px; width: 80px;"
    });

    const btn = (text, onclick) =>
        createElement('button', {
            onclick,
            style: "margin: 5px;"
        }, [text]);

    const listContainer = createElement('ul', {
        id: "utteranceList",
        style: "margin-top: 10px; padding-left: 20px;"
    });

    const refreshUtterances = () => {
        $.getJSON(`${musicPlayerServerHost()}/refresh_list`, (data) => {
            listContainer.innerHTML = '';
            data.forEach((line, index) => {
                const li = createElement('li', {
                    style: "cursor: pointer; margin: 4px 0;",
                    onclick: () => {
                        $.getJSON(`${musicPlayerServerHost()}/choose/${encodeURIComponent(index + 1)}`);
                    }
                }, [`${index + 1}. ${line}`]);
                listContainer.appendChild(li);
            });
        });
    };

    const country = 'ru'

    const controls = [
        inputPort,
        btn("Start", () => {
            $.getJSON(`${musicPlayerServerHost()}/autoplay_start?waitMilliseconds=2000&country=${country.toLowerCase()}&sessionId=${sessionId}`);
        }),
        btn("Stop", () => {
            $.getJSON(`${musicPlayerServerHost()}/autoplay_stop?sessionId=${sessionId}`);
        }),
        btn("Refresh", refreshUtterances),
        btn("Rofi", () => {
            $.getJSON(`${musicPlayerServerHost()}/rofi`);
        }),
        listContainer
    ];

    return createElement('div', {
        className: "tabs__content active row",
        id: "apiInfoContent",
        style: "height:100%; padding: 10px;"
    }, [
        createElement('div', { id: "remoteFace" }),
        createElement('div', { id: "streamerStatus" }),
        createElement('div', { id: "nsfwInfo", style: "display: none;" }),
        createElement('div', { id: "remoteInfo", style: "overflow-y: auto; margin-top: 3px" }, controls),
    ]);
}
