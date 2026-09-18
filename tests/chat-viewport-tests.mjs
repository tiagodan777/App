import fs from 'node:fs';
import assert from 'node:assert/strict';

export async function testChatViewport(JSDOM, root) {
    let checks = 0;

    const equal = (a, b, label) => {
        assert.deepEqual(a, b, label);
        checks++;
    };

    for (const platform of ['ios', 'android', 'web']) {
        const dom = new JSDOM(
            '<main><section><div></div></section></main>',
            {
                runScripts: 'outside-only',
                pretendToBeVisual: true
            }
        );

        const w = dom.window;
        const page = w.document.querySelector('main');
        const list = page.querySelector('section');
        const content = list.firstChild;

        let removed = 0;
        let callbacks = {};
        let resizeObservers = [];

        Object.defineProperty(w, 'innerHeight', {
            value: 800,
            writable: true
        });

        w.visualViewport = new w.EventTarget();
        w.visualViewport.height = 800;
        w.visualViewport.offsetTop = 0;
        w.matchMedia = () => ({ matches: true });

        w.ResizeObserver = class {
            constructor(callback) {
                resizeObservers.push(callback);
            }

            observe() {}

            disconnect() {}
        };

        w.HTMLElement.prototype.scrollTo = function ({ top }) {
            this.scrollTop = top;
        };

        Object.defineProperty(list, 'scrollHeight', {
            value: 1200,
            configurable: true
        });

        Object.defineProperty(list, 'clientHeight', {
            value: 600
        });

        w.Capacitor = {
            isNativePlatform: () => platform !== 'web',
            getPlatform: () => platform,
            Plugins: {
                Keyboard: {
                    setAccessoryBarVisible: async () => {},
                    addListener: async (name, callback) => {
                        callbacks[name] = callback;

                        return {
                            remove() {
                                removed++;
                            }
                        };
                    }
                }
            }
        };

        w.eval(
            fs.readFileSync(root + '/public/js/chat-viewport.js', 'utf8')
        );

        const viewport = w.MargotChatViewport(page, list, content);

        equal(page.style.height, '800px', platform + ' initial height');

        if (platform !== 'web') {
            await Promise.resolve();
            callbacks.keyboardWillShow({ keyboardHeight: 300 });

            equal(
                page.style.height,
                '500px',
                platform + ' native keyboard overlap removed'
            );

            if (platform === 'android') {
                w.innerHeight = 500;
                w.visualViewport.height = 500;
                w.visualViewport.dispatchEvent(new w.Event('resize'));

                equal(
                    page.style.height,
                    '500px',
                    'Android resize does not subtract keyboard twice'
                );
            }

            w.innerHeight = 800;
            w.visualViewport.height = 800;
            callbacks.keyboardWillHide({});

            equal(
                page.style.height,
                '800px',
                platform + ' closing keyboard restores height'
            );
        } else {
            w.visualViewport.height = 480;
            w.visualViewport.dispatchEvent(new w.Event('resize'));

            equal(
                page.style.height,
                '480px',
                'Web follows visible viewport'
            );
        }

        list.scrollTop = 0;
        list.dispatchEvent(new w.Event('touchmove'));
        viewport.insert(w.document.createElement('article'), false);

        equal(
            list.scrollTop,
            0,
            platform + ' received message does not interrupt older reading'
        );

        viewport.insert(w.document.createElement('article'), true);

        equal(
            list.scrollTop,
            1200,
            platform + ' sent message follows bottom'
        );

        Object.defineProperty(list, 'scrollHeight', {
            value: 1500,
            configurable: true
        });

        content.dispatchEvent(
            new w.Event('loadedmetadata', { bubbles: true })
        );

        equal(
            list.scrollTop,
            1500,
            platform + ' delayed video follows latest message'
        );

        viewport.destroy();
        await new Promise(resolve => setTimeout(resolve, 0));

        equal(
            removed,
            platform === 'web' ? 0 : 2,
            platform + ' native listeners removed'
        );

        dom.window.close();
    }

    // Gestos continuam hápticos mesmo quando as notificações estão silenciadas.
    const dom = new JSDOM('', { runScripts: 'outside-only' });
    const w = dom.window;
    let pulses = 0;

    w.disableNotifications = true;
    w.Capacitor = {
        Plugins: {
            MargotHaptics: {
                play: async () => {
                    pulses++;
                }
            }
        }
    };

    w.eval(
        fs.readFileSync(root + '/public/js/hey-vibracao.js', 'utf8')
    );

    w.MargotHaptics.play('messageReceived');
    equal(pulses, 0, 'Notifications honor mute');

    w.MargotHaptics.feedback();
    equal(pulses, 1, 'Interaction haptic independent of notification mute');

    dom.window.close();

    return checks;
}