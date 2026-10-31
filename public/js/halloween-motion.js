(() => {
    'use strict';

    const hunt = window.MargotHalloweenHunt;

    if (!hunt?.create || hunt.create.motionVersion === 16) return;

    const create = hunt.create;
    const random = (min, max) =>
        min + Math.random() * (max - min);

    function motion(object) {
        const difficult = Math.random() >= .20;
        const width = Math.max(280, Math.min(innerWidth, 900));

        const duration = difficult
            ? random(6800, 8400)
            : random(7200, 8600);

        if (object.kind === 'pumpkin') {
            const hops = difficult
                ? Math.floor(random(13, 18))
                : Math.floor(random(9, 12));

            const points = [0];

            for (let i = 1; i < hops; i++) {
                const center = .5 + .12 * Math.sin(i * 1.7);

                const swing = difficult
                    ? random(.18, .31)
                    : random(.09, .17);

                points.push(
                    Math.max(
                        .10,
                        Math.min(
                            .90,
                            center + (i % 2 ? -swing : swing)
                        )
                    )
                );
            }

            points.push(1);

            const jumps = Array.from({ length: hops }, () => {
                const n = Math.random();

                return n < .35
                    ? random(12, 25)
                    : n < .80
                        ? random(28, 49)
                        : random(52, 78);
            });

            return {
                ...object,
                duration,
                hops,
                points,
                jumps
            };
        }

        return {
            ...object,
            duration,
            flaps: random(4.8, 6.2),
            turns: difficult
                ? random(3.4, 4.8)
                : random(1.8, 2.8),
            loops: difficult
                ? random(3, 4.2)
                : random(1.5, 2.3),
            loopRadius: Math.min(
                width * .23,
                difficult
                    ? random(80, 105)
                    : random(35, 55)
            ),
            weave: difficult
                ? random(30, 48)
                : random(15, 25),
            wave: difficult
                ? random(32, 52)
                : random(18, 30),
            bend: random(-65, 65),
            phase: random(0, Math.PI * 2)
        };
    }

    function createWithMotion(options) {
        if (typeof options?.onObject !== 'function') {
            return create.call(hunt, options);
        }

        const onObject = options.onObject;

        return create.call(hunt, {
            ...options,

            onObject(object) {
                return onObject.call(options, motion(object));
            }
        });
    }

    createWithMotion.motionVersion = 16;
    hunt.create = createWithMotion;
})();