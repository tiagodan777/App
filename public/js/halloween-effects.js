(function () {
    'use strict';

    window.MargotHalloweenEffects?.destroy();

    const map = document.getElementById('gridCanvas');
    const page = document.querySelector(
        '#gridCanvas,#mensagens-pagina,#chat-pagina,#perfil'
    );
    if (!page) return;

    const script = document.currentScript;
    const assets = script?.getAttribute('data-assets');
    if (!assets) return;

    const assetRoot = new URL(assets, document.baseURI);
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const canvas = document.createElement('canvas');

    canvas.id = 'margot-halloween-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
        'position:fixed;pointer-events:none;z-index:20';

    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        canvas.remove();
        return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    const frames = {
        pumpkin: [
            [24,30,608,570],
            [648,33,553,568],
            [27,644,588,572],
            [663,641,567,570]
        ],
        bat: [
            [10,241,790,304],
            [829,241,413,316],
            [14,717,771,315],
            [798,717,441,315]
        ]
    };

    const pictures = {};
    const failures = [];
    let batLayers = null;

    let W = 1, H = 1, left = 0, top = 0;
    let nodes = [], strands = [], actors = [], stains = [];
    let raf = 0, timer = 0, last = 0;
    let restoreAt = 0, webActiveUntil = 0;
    let running = false, disposed = false, ready = false;
    let nextKind = 'pumpkin';
    let pumpkinDirection = 1, batDirection = -1;
    let finger = null, swallowed = null, swallowUntil = 0;
    let observer;
    let lastHaptic = -1000, hapticBusy = false, hapticPlugin;
    let lastPhysics = 0, previousFloor = .7, previousCenter = .5;
    let lastGroup = -2, passages = 0;

    const WEB_TOP = 76;
    const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
    const ease = x => x*x*(3-2*x);
    const random = (a,b) => a+Math.random()*(b-a);

    function different(previous,a,b,gap) {
        const x = random(a,b);
        return Math.abs(x-previous)>=gap
            ? x
            : previous<(a+b)/2 ? b : a;
    }

    function visible(el) {
        for (
            let n=el;
            n instanceof Element;
            n=n.parentElement
        ) {
            if (
                n.hidden ||
                n.getAttribute('aria-hidden')==='true' ||
                n.matches('dialog:not([open])')
            ) return false;

            const css=getComputedStyle(n);

            if (
                css.display==='none' ||
                css.visibility==='hidden' ||
                css.visibility==='collapse'
            ) return false;
        }
        return true;
    }

    function blocked() {
        if (
            !visible(page) ||
            document.body.classList.contains('hoje-editor-aberto') ||
            document.body.classList.contains('margot-mini-menu-aberto')
        ) return true;

        return [...document.querySelectorAll(
            'dialog[open],[role="dialog"][aria-modal="true"],.mini-menu,'+
            'input:focus,textarea:focus,select:focus,'+
            '[contenteditable="true"]:focus'
        )].some(visible);
    }

    function eligible() {
        return (
            !disposed &&
            page.isConnected &&
            dark.matches &&
            !reduce.matches &&
            !document.hidden &&
            !(
                window.visualViewport &&
                visualViewport.height<innerHeight*.8
            ) &&
            !blocked()
        );
    }

    function request() {
        if (running&&!raf) raf=requestAnimationFrame(draw);
    }

    function makeWeb() {
        nodes=[];
        strands=[];
        if (!map) return;

        function web(cx,cy,radius,rays,rings,start,sweep,flat,seed) {
            const base=nodes.length;

            for (let ray=0;ray<rays;ray++) {
                const angle=
                    start+sweep*ray/(rays-1)+
                    Math.sin(ray*2.4+seed)*.025;

                for (let ring=0;ring<rings.length;ring++) {
                    const r=
                        radius*rings[ring]*
                        (1+Math.sin(ray*1.8+ring+seed)*.045);

                    const x=cx+Math.cos(angle)*r;
                    const y=cy+Math.sin(angle)*r*flat;

                    nodes.push({
                        x,y,px:x,py:y,hx:x,hy:y,
                        fixed:ring===0||ring===rings.length-1
                    });

                    const i=base+ray*rings.length+ring;
                    if (ring) join(i-1,i,false,ring,cx,cy);

                    if (ray&&ring) {
                        join(i-rings.length,i,true,ring,cx,cy);
                    }
                }
            }
        }

        web(
            W-5,WEB_TOP,
            Math.min(235,W*.56,H*.33),
            10,[0,.10,.22,.37,.55,.76,1],
            Math.PI/2,Math.PI/2,1,1
        );

        const menu=document
            .getElementById('menuPrincipal')
            ?.getBoundingClientRect();

        const bottom=menu&&menu.height>0
            ? Math.min(H-85,menu.top-top-18)
            : H-110;

        web(
            7,Math.max(260,bottom),
            Math.min(195,W*.46,H*.27),
            8,[0,.16,.34,.57,.80,1],
            -Math.PI/2,Math.PI/2,.80,4
        );
    }

    function join(a,b,arc,ring,cx,cy) {
        strands.push({
            a,b,arc,ring,cx,cy,
            length:Math.hypot(
                nodes[a].x-nodes[b].x,
                nodes[a].y-nodes[b].y
            ),
            cut:0
        });
    }

    function resize() {
        const r=map
            ? map.getBoundingClientRect()
            : {
                width:innerWidth,
                height:innerHeight,
                left:0,
                top:0
            };

        W=Math.max(1,r.width);
        H=Math.max(1,r.height);
        left=r.left;
        top=r.top;

        Object.assign(canvas.style,{
            left:left+'px',
            top:top+'px',
            width:W+'px',
            height:H+'px'
        });

        const dpr=Math.min(devicePixelRatio||1,2);
        canvas.width=Math.round(W*dpr);
        canvas.height=Math.round(H*dpr);
        ctx.setTransform(dpr,0,0,dpr,0,0);

        actors=[];
        stains=[];
        finger=null;
        restoreAt=0;
        webActiveUntil=0;
        lastPhysics=0;

        makeWeb();
        request();
    }

    function distance(x,y,a,b) {
        const dx=b.x-a.x,dy=b.y-a.y;
        const n=dx*dx+dy*dy;

        const t=n
            ? clamp(((x-a.x)*dx+(y-a.y)*dy)/n,0,1)
            : 0;

        return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
    }

    function nearWeb(x,y) {
        return strands.some(s=>
            !s.cut&&distance(x,y,nodes[s.a],nodes[s.b])<12
        );
    }

    function haptic(speed=0) {
        if (
            !running||
            document.hidden||
            reduce.matches||
            hapticBusy
        ) return;

        const now=performance.now();
        const level=speed>.85?2:speed>.30?1:0;

        if (now-lastHaptic<[320,250,180][level]) return;
        lastHaptic=now;

        const type=['shutter','interaction','heySent'][level];

        try {
            const cap=window.Capacitor;

            if (
                cap?.isNativePlatform?.()&&
                cap.isPluginAvailable?.('MargotHaptics')
            ) {
                hapticPlugin ||=
                    cap.Plugins?.MargotHaptics||
                    cap.registerPlugin('MargotHaptics');

                hapticBusy=true;

                Promise.resolve(hapticPlugin.play({type}))
                    .catch(()=>{})
                    .finally(()=>{hapticBusy=false;});
            } else {
                navigator.vibrate?.([8,12,18][level]);
            }
        } catch (_) {
            hapticBusy=false;
        }
    }

    function grab(x,y) {
        return nodes
            .map((p,i)=>({i,d:Math.hypot(p.x-x,p.y-y)}))
            .filter(n=>!nodes[n.i].fixed&&n.d<40)
            .sort((a,b)=>a.d-b.d)
            .slice(0,2)
            .map(n=>({
                i:n.i,
                dx:nodes[n.i].x-x,
                dy:nodes[n.i].y-y
            }));
    }

    function disturb(x,y) {
        const now=performance.now();

        const speed=Math.hypot(x-finger.x,y-finger.y)/
            Math.max(16,now-finger.at);

        if (speed>.06&&finger.grips.length) haptic(speed);

        finger.x=x;
        finger.y=y;
        finger.at=now;

        restoreAt=0;
        webActiveUntil=Infinity;

        nodes.forEach(p=>{
            delete p.rx;
            delete p.ry;
        });

        request();
    }

    function simulateWeb(now) {
        const steps=Math.min(
            4,
            Math.max(1,Math.round((now-lastPhysics)/16.67))
        );
        lastPhysics=now;

        for (let step=0;step<steps;step++) {
            nodes.forEach(p=>{
                if (p.fixed) return;

                const vx=clamp((p.x-p.px)*.9,-5,5);
                const vy=clamp((p.y-p.py)*.9,-5,5);

                p.px=p.x;
                p.py=p.y;

                const pull=Math.hypot(p.x-p.hx,p.y-p.hy);
                const spring=.0015+Math.min(pull,100)*.000045;

                p.x+=vx+(p.hx-p.x)*spring;
                p.y+=vy+(p.hy-p.y)*spring;
            });

            if (finger) {
                finger.grips.forEach(g=>{
                    const p=nodes[g.i];
                    const dx=finger.x+g.dx-p.hx;
                    const dy=finger.y+g.dy-p.hy;
                    const d=Math.hypot(dx,dy);

                    // A resistência aumenta suavemente com o puxão.
                    const k=d
                        ? 120*(1-Math.exp(-d/120))/d
                        : 0;

                    p.x+=(p.hx+dx*k-p.x)*.38;
                    p.y+=(p.hy+dy*k-p.y)*.38;
                });
            }

            let broken=0;

            strands.forEach(s=>{
                if (s.cut) return;

                const a=nodes[s.a],b=nodes[s.b];
                const len=Math.hypot(b.x-a.x,b.y-a.y);

                const displacement=Math.max(
                    Math.hypot(a.x-a.hx,a.y-a.hy),
                    Math.hypot(b.x-b.hx,b.y-b.hy)
                );

                if (
                    finger&&
                    displacement>34&&
                    len>s.length*1.36+3&&
                    broken<2
                ) {
                    s.cut=now;
                    s.mx=(a.x+b.x)/2;
                    s.my=(a.y+b.y)/2;
                    broken++;
                }
            });

            for (let pass=0;pass<3;pass++) {
                strands.forEach(s=>{
                    if (s.cut) return;

                    const a=nodes[s.a],b=nodes[s.b];
                    const dx=b.x-a.x,dy=b.y-a.y;
                    const len=Math.hypot(dx,dy)||1;

                    const tension=clamp((len/s.length-1)/.8,0,1);
                    const stiffness=.09+.11*tension;
                    const f=(len-s.length)/len*stiffness;
                    const w=a.fixed||b.fixed?1:.5;

                    if (!a.fixed) {
                        a.x+=dx*f*w;
                        a.y+=dy*f*w;
                    }
                    if (!b.fixed) {
                        b.x-=dx*f*w;
                        b.y-=dy*f*w;
                    }
                });
            }

            nodes.forEach(p=>{
                const dx=p.x-p.hx,dy=p.y-p.hy;
                const d=Math.hypot(dx,dy);

                if (d>125) {
                    p.x=p.hx+dx*125/d;
                    p.y=p.hy+dy*125/d;
                    p.px=p.x;
                    p.py=p.y;
                }
            });
        }
    }

    function drawWeb(now) {
        const healing=restoreAt&&now>=restoreAt;
        const t=healing
            ? clamp((now-restoreAt)/2400,0,1)
            : 0;

        if (healing) {
            nodes.forEach(p=>{
                if (p.rx===undefined) {
                    p.rx=p.x;
                    p.ry=p.y;
                }

                p.x=p.rx+(p.hx-p.rx)*ease(t);
                p.y=p.ry+(p.hy-p.ry)*ease(t);
                p.px=p.x;
                p.py=p.y;
            });
        } else if (now<webActiveUntil) {
            simulateWeb(now);
        }

        ctx.lineCap='round';

        strands.forEach(s=>{
            const a=nodes[s.a],b=nodes[s.b];
            let alpha=.42+.07*Math.sin(s.a*1.7);
            let grow=1;

            ctx.lineWidth=.65+.12*Math.sin(s.b*.9);

            if (s.cut&&!healing) {
                const age=clamp((now-s.cut)/1300,0,1);
                if (age===1) return;

                ctx.strokeStyle=
                    'rgba(222,231,246,'+
                    alpha*(1-ease(age))+')';

                [a,b].forEach((p,i)=>{
                    const k=1-ease(age)*.85;
                    const ex=p.x+(s.mx-p.x)*k;
                    const ey=p.y+(s.my-p.y)*k;

                    const wave=
                        Math.sin(age*12+i*Math.PI)*(1-age)*7;

                    ctx.beginPath();
                    ctx.moveTo(p.x,p.y);
                    ctx.quadraticCurveTo(
                        (p.x+ex)/2+wave,
                        (p.y+ey)/2+age*10,
                        ex,ey
                    );
                    ctx.stroke();
                });
                return;
            }

            if (s.cut) {
                grow=ease(clamp(
                    (t-(s.ring-1)*.075)/.60,0,1
                ));
                alpha*=grow;
            }

            if (alpha<.005) return;

            const bend=s.arc?.045:0;
            const cx=
                (a.x+b.x)/2+(s.cx-(a.x+b.x)/2)*bend;
            const cy=
                (a.y+b.y)/2+(s.cy-(a.y+b.y)/2)*bend;

            const ex=
                (1-grow)**2*a.x+
                2*(1-grow)*grow*cx+grow*grow*b.x;
            const ey=
                (1-grow)**2*a.y+
                2*(1-grow)*grow*cy+grow*grow*b.y;

            ctx.strokeStyle='rgba(222,231,246,'+alpha+')';
            ctx.beginPath();
            ctx.moveTo(a.x,a.y);
            ctx.quadraticCurveTo(
                a.x+(cx-a.x)*grow,
                a.y+(cy-a.y)*grow,
                ex,ey
            );
            ctx.stroke();
        });

        if (t===1) {
            strands.forEach(s=>s.cut=0);
            nodes.forEach(p=>{
                delete p.rx;
                delete p.ry;
            });
            restoreAt=0;
            webActiveUntil=0;
        }
    }

    function sprite(kind,view,height,alpha=1) {
        const r=frames[kind][view];
        const width=height*r[2]/r[3];

        ctx.save();
        ctx.globalAlpha*=alpha;
        ctx.drawImage(
            pictures[kind],
            r[0],r[1],r[2],r[3],
            -width/2,-height,width,height
        );
        ctx.restore();
    }

    function drawPumpkin(a,now) {
        const p=clamp((now-a.start)/a.duration,0,1);
        const cycle=p*a.hops;
        const index=Math.min(a.hops-1,Math.floor(cycle));
        const u=cycle-index;

        const air=clamp((u-.12)/.68,0,1);
        const flying=u>=.12&&u<.80;

        const lift=flying
            ? 4*a.jumps[index]*air*(1-air)
            : 0;

        const anticipation=u<.12
            ? Math.sin(Math.PI*u/.12)*.09
            : 0;

        const landing=u>=.80
            ? Math.sin(Math.PI*(u-.80)/.20)*.18
            : 0;

        const squash=anticipation+landing;
        const stretch=flying
            ? Math.sin(air*Math.PI*2)*.035
            : 0;

        const position=(index+ease(air))/a.hops;

        a.x=a.dir>0
            ? -60+(W+120)*position
            : W+60-(W+120)*position;

        a.y=a.floor-lift-a.size/2;

        ctx.save();
        ctx.globalAlpha=.28*(1-lift/(a.jumps[index]*1.4));
        ctx.fillStyle='#000';
        ctx.beginPath();
        ctx.ellipse(
            a.x,a.floor+2,
            15-lift*.06,3,0,0,Math.PI*2
        );
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(a.x,a.floor-lift);

        ctx.scale(
            1.14*(1+squash-stretch*.6),
            .96*(1-squash+stretch)
        );

        ctx.transform(
            1,0,
            flying?a.dir*Math.sin(air*Math.PI*2)*.045:0,
            1,0,0
        );

        sprite('pumpkin',a.dir>0?1:3,a.size);
        ctx.restore();

        return p<1;
    }

    function makeBatLayers() {
        const r=frames.bat[0],w=r[2],h=r[3];

        function layer(path) {
            const c=document.createElement('canvas');
            c.width=w;
            c.height=h;

            const g=c.getContext('2d');
            g.beginPath();
            path(g,w,h);
            g.clip();
            g.drawImage(
                pictures.bat,
                r[0],r[1],w,h,
                0,0,w,h
            );
            return c;
        }

        function wing(g,mirror) {
            const pts=[
                [0,0],[260,0],[260,132],[342,172],
                [354,250],[240,330],[0,330]
            ];

            pts.forEach(([x,y],i)=>{
                x=mirror?w-x:x;
                if (i) g.lineTo(x,y);
                else g.moveTo(x,y);
            });
            g.closePath();
        }

        const l=layer(g=>wing(g,false));
        const rgt=layer(g=>wing(g,true));

        const body=layer(g=>{
            g.ellipse(395,179,88,128,0,0,Math.PI*2);
            g.moveTo(385,74);
            g.ellipse(345,74,43,80,-.25,0,Math.PI*2);
            g.moveTo(488,74);
            g.ellipse(445,74,43,80,.25,0,Math.PI*2);
        });

        return {left:l,right:rgt,body,w,h};
    }

    function drawBat(a,now) {
        const p=clamp((now-a.start)/a.duration,0,1);
        const travel=W+170;

        a.x=a.dir>0
            ? -85+travel*p
            : W+85-travel*p;

        const phase=
            (now-a.start)/1000*Math.PI*2*a.flaps;

        a.y=
            a.y0+(a.y1-a.y0)*p+
            Math.sin(p*Math.PI)*a.bend+
            Math.sin(p*Math.PI*2)*a.wave;

        ctx.save();
        ctx.translate(a.x,a.y);
        ctx.rotate(a.dir*clamp(
            (
                a.y1-a.y0+
                Math.cos(p*Math.PI)*a.bend*Math.PI
            )/travel,
            -1,1
        )*.18);

        const scale=a.size/batLayers.h;
        ctx.scale(scale,scale);
        ctx.translate(-395,-165);

        const angle=.78*Math.sin(phase);

        function wing(image,pivot,sign) {
            ctx.save();
            ctx.translate(pivot,177);
            ctx.rotate(sign*angle);
            ctx.scale(.92+.08*Math.cos(phase),1);
            ctx.translate(-pivot,-177);
            ctx.drawImage(image,0,0);
            ctx.restore();
        }

        wing(batLayers.left,326,1);
        wing(batLayers.right,464,-1);
        ctx.drawImage(batLayers.body,0,0);
        ctx.restore();

        return p<1;
    }

    function splat(a) {
        const drops=Array.from({length:16},()=>({
            angle:Math.random()*Math.PI*2,
            radius:10+Math.random()*37,
            size:8+Math.random()*10,
            drip:25+Math.random()*65
        }));

        stains.push({
            x:a.x,
            y:a.y,
            start:performance.now(),
            color:a.kind==='pumpkin'?'255,91,0':'217,5,41',
            drops
        });

        actors=actors.filter(item=>item!==a);
        request();
    }

    function drawStains(now) {
        stains=stains.filter(s=>{
            const age=(now-s.start)/1000;
            if (age>=6) return false;

            const spread=
                1-Math.pow(1-clamp(age/.22,0,1),3);
            const fade=clamp((6-age)/1.8,0,1);

            ctx.save();
            ctx.globalAlpha=fade;
            ctx.fillStyle='rgb('+s.color+')';
            ctx.beginPath();
            ctx.ellipse(
                s.x,s.y,29*spread,24*spread,
                0,0,Math.PI*2
            );
            ctx.fill();

            s.drops.forEach(d=>{
                const x=
                    s.x+Math.cos(d.angle)*d.radius*spread;
                const y=
                    s.y+Math.sin(d.angle)*d.radius*spread;
                const drip=
                    d.drip*Math.pow(clamp(age/5,0,1),1.65);

                ctx.beginPath();
                ctx.ellipse(
                    x,y,d.size*spread,d.size*spread,
                    0,0,Math.PI*2
                );
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(x-d.size*.3,y);
                ctx.bezierCurveTo(
                    x-2,y+drip*.6,
                    x-4,y+drip,
                    x,y+drip+4
                );
                ctx.bezierCurveTo(
                    x+4,y+drip,
                    x+2,y+drip*.6,
                    x+d.size*.3,y
                );
                ctx.fill();
            });

            ctx.fillStyle='rgba(255,229,185,.32)';
            ctx.beginPath();
            ctx.ellipse(
                s.x-8,s.y-10,
                7*spread,3*spread,-.4,0,Math.PI*2
            );
            ctx.fill();
            ctx.restore();

            return true;
        });
    }

    function draw(now) {
        raf=0;
        if (!running) return;

        if (now-last<(actors.length||finger?16:32)) {
            request();
            return;
        }
        last=now;

        ctx.clearRect(0,0,W,H);
        drawWeb(now);

        actors=actors.filter(a=>
            now<a.start||
            (
                a.kind==='pumpkin'
                    ? drawPumpkin(a,now)
                    : drawBat(a,now)
            )
        );

        drawStains(now);

        if (
            actors.length||
            stains.length||
            now<webActiveUntil
        ) request();
    }

    function newActor(kind,index) {
        const a={
            kind,
            start:performance.now()+index*550,
            x:-200,
            y:-200
        };

        if (kind==='pumpkin') {
            previousFloor=different(
                previousFloor,.36,.78,.14
            );

            Object.assign(a,{
                dir:pumpkinDirection,
                floor:H*previousFloor,
                size:random(43,49),
                duration:random(7200,8500),
                hops:Math.floor(random(6,9))
            });

            a.jumps=Array.from(
                {length:a.hops},
                ()=>random(14,24)
            );
            pumpkinDirection*=-1;
        } else {
            previousCenter=different(
                previousCenter,.32,.68,.13
            );

            const span=
                Math.min(
                    H*.53,
                    (W+170)*random(.60,1.0)
                )*(Math.random()<.5?-1:1);

            Object.assign(a,{
                dir:batDirection,
                size:random(31,37),
                duration:random(6200,7800),
                flaps:random(2.2,2.9),
                y0:clamp(
                    H*previousCenter-span/2,
                    90,H-120
                ),
                y1:clamp(
                    H*previousCenter+span/2,
                    90,H-120
                ),
                bend:random(-45,45),
                wave:random(-12,12)
            });

            batDirection*=-1;
        }
        return a;
    }

    function schedule(delay=15000) {
        clearTimeout(timer);
        timer=0;
        if (!running||!ready) return;

        timer=setTimeout(()=>{
            timer=0;
            if (!running) return;

            if (actors.length||stains.length) {
                schedule();
                return;
            }

            passages++;

            const group=
                passages-lastGroup>=3&&Math.random()<.18;

            const count=group
                ? Math.random()<.25?3:2
                : 1;

            if (group) lastGroup=passages;

            actors=Array.from({length:count},(_,i)=>
                newActor(
                    i===0
                        ? nextKind
                        : Math.random()<.5?'pumpkin':'bat',
                    i
                )
            );

            nextKind=nextKind==='pumpkin'?'bat':'pumpkin';

            request();
            schedule();
        },delay);
    }

    function refresh() {
        const next=eligible();
        if (next===running) return;

        running=next;
        cancelAnimationFrame(raf);
        raf=0;
        clearTimeout(timer);
        timer=0;

        actors=[];
        stains=[];
        finger=null;
        canvas.hidden=!running;
        ctx.clearRect(0,0,W,H);

        if (running) {
            makeWeb();
            restoreAt=0;
            webActiveUntil=0;
            last=0;
            lastPhysics=performance.now();
            request();
            schedule(30000);
        }
    }

    function allowed(target) {
        return (
            target instanceof Element&&
            !target.closest(
                'button,a,input,textarea,select,'+
                '[contenteditable="true"],[role="button"],'+
                'video,audio,.foto,#menuPrincipal,#heys-area,'+
                '.mini-menu,#chat-form,.chat-cabecalho'
            )
        );
    }

    function start(x,y,target,e) {
        if (!running||!allowed(target)) return;

        const px=x-left,py=y-top;
        if (px<0||py<0||px>W||py>H) return;

        let caught=false;

        const hit=actors.find(a=>
            performance.now()>=a.start&&
            Math.hypot(
                (px-a.x)/(a.kind==='bat'?47:30),
                (py-a.y)/30
            )<1
        );

        if (hit) {
            haptic();
            splat(hit);
            caught=true;
        } else if (nearWeb(px,py)) {
            finger={
                x:px,
                y:py,
                at:performance.now(),
                grips:grab(px,py)
            };
            disturb(px,py);
            caught=true;
        }

        if (caught) {
            swallowed={x,y};
            swallowUntil=performance.now()+500;
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
        }
    }

    function move(x,y,e) {
        if (!finger||!running) return;
        disturb(x-left,y-top);
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
    }

    function end() {
        if (finger) {
            swallowed={
                x:finger.x+left,
                y:finger.y+top
            };
            swallowUntil=performance.now()+400;
            restoreAt=performance.now()+4000;
            webActiveUntil=restoreAt+2450;
            request();
        }
        finger=null;
    }

    const capture={
        capture:true,
        passive:false,
        signal
    };

    document.addEventListener('touchstart',e=>{
        if (e.touches.length===1) {
            start(
                e.touches[0].clientX,
                e.touches[0].clientY,
                e.target,e
            );
        }
    },capture);

    document.addEventListener('touchmove',e=>{
        if (e.touches.length===1) {
            move(
                e.touches[0].clientX,
                e.touches[0].clientY,e
            );
        } else {
            end();
        }
    },capture);

    document.addEventListener('touchend',end,{signal});
    document.addEventListener('touchcancel',end,{signal});

    document.addEventListener('pointerdown',e=>{
        if (e.pointerType!=='touch') {
            start(e.clientX,e.clientY,e.target,e);
        }
    },capture);

    document.addEventListener('pointermove',e=>{
        if (e.pointerType!=='touch') {
            move(e.clientX,e.clientY,e);
        }
    },capture);

    document.addEventListener('pointerup',end,{signal});
    document.addEventListener('pointercancel',end,{signal});

    document.addEventListener('click',e=>{
        if (
            swallowed&&
            performance.now()<swallowUntil&&
            Math.hypot(
                e.clientX-swallowed.x,
                e.clientY-swallowed.y
            )<45&&
            allowed(e.target)
        ) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    },{capture:true,signal});

    function destroy() {
        disposed=true;
        running=false;
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        controller.abort();
        observer?.disconnect();

        dark.removeEventListener('change',refresh);
        reduce.removeEventListener('change',refresh);
        canvas.remove();

        if (window.MargotHalloweenEffects===api) {
            window.MargotHalloweenEffects=null;
        }
    }

    const api={
        destroy,
        getState:()=>({
            version:7,
            running,
            ready,
            failures:failures.slice(),
            dark:dark.matches,
            reducedMotion:reduce.matches,
            active:actors.map(a=>a.kind),
            webs:map?2:0
        })
    };

    window.MargotHalloweenEffects=api;

    dark.addEventListener('change',refresh);
    reduce.addEventListener('change',refresh);

    document.addEventListener(
        'visibilitychange',refresh,{signal}
    );
    document.addEventListener('focusin',refresh,{signal});
    document.addEventListener('focusout',()=>{
        queueMicrotask(refresh);
    },{signal});

    document.addEventListener('margot:page-leave',destroy,{
        once:true,
        signal
    });

    window.addEventListener('blur',end,{signal});
    window.addEventListener('resize',resize,{signal});

    observer=new MutationObserver(records=>{
        if (records.some(r=>
            r.target!==canvas&&
            !(
                r.target instanceof Element&&
                r.target.closest('.foto')
            )
        )) refresh();
    });

    observer.observe(document.body,{
        attributes:true,
        childList:true,
        subtree:true,
        attributeFilter:[
            'class','style','hidden',
            'aria-hidden','aria-modal','open'
        ]
    });

    window.visualViewport?.addEventListener(
        'resize',refresh,{signal}
    );

    resize();
    canvas.hidden=true;
    refresh();

    Promise.all(['pumpkin','bat'].map(kind=>
        new Promise(resolve=>{
            const image=new Image();

            image.onload=()=>{
                pictures[kind]=image;
                resolve();
            };

            image.onerror=()=>{
                failures.push(kind);
                console.warn(
                    'Halloween: imagem indisponível:',
                    kind
                );
                resolve();
            };

            image.src=new URL(
                kind+'-turnaround.png',
                assetRoot
            ).href;
        })
    )).then(()=>{
        if (disposed) return;
        ready=failures.length===0;
        if (ready) batLayers=makeBatLayers();
        if (ready&&running) schedule(30000);
    });
})();