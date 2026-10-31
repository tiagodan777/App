(() => {
    'use strict';

    const base = window.MargotHalloweenHunt;

    if (
        !base?.create ||
        base.create.motionVersion === 20
    ) return;

    function motion(object) {
        let seed = parseInt(
            (object.objectId || object.roundId).slice(0, 8),
            16
        ) >>> 0;

        const random = (a, b) => {
            seed = (
                Math.imul(1664525, seed) + 1013904223
            ) >>> 0;

            return a + (
                seed / 4294967296
            ) * (b - a);
        };

        const roll = random(0, 100);

        const tier = Number.isInteger(object.difficulty)
            ? object.difficulty
            : roll < 15
                ? 0
                : roll < 40
                    ? 1
                    : roll < 65
                        ? 2
                        : 3;

        const duration = random(
            [8000, 7600, 6900, 6100][tier],
            [9000, 8700, 8200, 7700][tier]
        );

        if (object.kind === 'pumpkin') {
            const hops = Math.floor(
                random(
                    [6, 9, 12, 16][tier],
                    [9, 12, 16, 20][tier]
                )
            );

            const points = [0];

            for (let i = 1; i < hops; i++) {
                const center =
                    .5 + .12 * Math.sin(i * 1.7);

                const swing = random(
                    [.03, .09, .17, .26][tier],
                    [.08, .17, .27, .36][tier]
                );

                points.push(
                    Math.max(
                        .10,
                        Math.min(
                            .90,
                            center + (
                                i % 2 ? -swing : swing
                            )
                        )
                    )
                );
            }

            points.push(1);

            const jumps = Array.from(
                { length: hops },
                () => {
                    const r = random(0, 1);

                    return r < .35
                        ? random(12, 25)
                        : r < .80
                            ? random(28, 49)
                            : random(52, 78);
                }
            );

            return {
                ...object,
                duration,
                hops,
                points,
                jumps
            };
        }

        const width = Math.max(
            280,
            Math.min(innerWidth, 900)
        );

        return {
            ...object,
            duration,

            flaps: random(4.8, 6.2),

            turns: random(
                [1, 2, 3, 4.8][tier],
                [1.8, 3, 4.2, 5.8][tier]
            ),

            loops: random(
                [.8, 1.5, 2.6, 4][tier],
                [1.4, 2.4, 3.6, 5][tier]
            ),

            loopRadius: Math.min(
                width * .23,
                random(
                    [15, 35, 65, 95][tier],
                    [30, 55, 90, 115][tier]
                )
            ),

            weave: random(
                [8, 15, 28, 45][tier],
                [16, 26, 42, 58][tier]
            ),

            wave: random(
                [12, 20, 30, 48][tier],
                [22, 30, 45, 62][tier]
            ),

            bend: random(-65, 65),
            phase: random(0, Math.PI * 2)
        };
    }

    function create(options) {
        const onObject = options.onObject;

        return base.create({
            ...options,
            onObject: object => onObject(
                motion(object)
            )
        });
    }

    create.motionVersion = 20;

    window.MargotHalloweenHunt = Object.freeze({
        ...base,
        create
    });
})();