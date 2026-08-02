/* GAUTAM TALKS · THE ROOM — a low-poly night in the life. All geometry generated in code. */
window.GT_ROOM = window.GT_ROOM || (() => {
  "use strict";
  let inited = false, running = false, raf = 0, skipFlag = false;
  let scene, cam, ren, clock, G, F, props = {}, bub = {};
  const $ = s => document.querySelector(s);
  const V3 = (x,y,z) => new THREE.Vector3(x,y,z);
  const M = (c,e) => new THREE.MeshStandardMaterial({color:c, emissive:e||0x000000, roughness:.9});
  const box = (w,h,d,c,p) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), M(c)); if(p)p.add(m); return m; };
  const cyl = (rt,rb,h,c,p) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,10), M(c)); if(p)p.add(m); return m; };

  /* ---------- character ---------- */
  function makeChar(shirt, skin, hair){
    const g = new THREE.Group();
    const legL = box(.16,.5,.18,0x2b2d4a); legL.geometry.translate(0,-.25,0); legL.position.set(-.11,.5,0); g.add(legL);
    const legR = legL.clone(); legR.position.x = .11; g.add(legR);
    const torso = box(.46,.5,.26,shirt); torso.position.y=.75; g.add(torso);
    const armL = box(.13,.46,.15,shirt); armL.geometry.translate(0,-.2,0); armL.position.set(-.3,.96,0); g.add(armL);
    const armR = armL.clone(); armR.position.x=.3; g.add(armR);
    const head = box(.34,.32,.3,skin); head.position.y=1.18; g.add(head);
    const hairM = box(.36,.12,.32,hair); hairM.position.set(0,1.36,0); g.add(hairM);
    const eyeL = box(.05,.05,.01,0x14141a); eyeL.position.set(-.08,1.2,.155); g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x=.08; g.add(eyeR);
    const hand = new THREE.Group(); hand.position.set(0,-.42,0); armR.add(hand);
    return { g, legL, legR, armL, armR, torso, head, hand,
      walking:false, talking:false, seated:false, base:{x:0,z:0},
      set(x,z,ry){ g.position.set(x,0,z); if(ry!==undefined) g.rotation.y=ry; } };
  }
  function limbTick(c, t){
    if(c.walking){ const s = Math.sin(t*9);
      c.legL.rotation.x = s*.7; c.legR.rotation.x = -s*.7;
      c.armL.rotation.x = -s*.6; c.armR.rotation.x = s*.6;
      c.g.position.y = Math.abs(Math.sin(t*9))*.05;
    } else if(c.talking){ const s = Math.sin(t*7);
      c.armR.rotation.x = -.9 + s*.25; c.armL.rotation.x = -.4 - s*.15;
      c.head.rotation.y = Math.sin(t*3)*.12;
    } else if(c.seated){
      c.legL.rotation.x = -1.55; c.legR.rotation.x = -1.55;
      c.armL.rotation.x *= .85; c.armR.rotation.x *= .85;
    } else {
      ['legL','legR','armL','armR'].forEach(k=>c[k].rotation.x*= .8);
      c.head.rotation.y *= .8; c.g.position.y *= .8;
    }
  }

  /* ---------- room build ---------- */
  function build(){
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b16);
    scene.fog = new THREE.Fog(0x0a0b16, 14, 26);
    cam = new THREE.PerspectiveCamera(40, 1, .1, 60);
    cam.position.set(7.2, 6.4, 9.2); cam.lookAt(0,1.2,-.4);

    scene.add(new THREE.AmbientLight(0x6a72c8,.5));
    const moon = new THREE.DirectionalLight(0x9db4ff,.5); moon.position.set(-6,8,4); scene.add(moon);
    const lamp = new THREE.PointLight(0xffc46b,1.1,9); lamp.position.set(2.6,2.2,-2.6); scene.add(lamp);
    props.screenLight = new THREE.PointLight(0x3140f5,0,6); props.screenLight.position.set(2.4,1.6,-2.2); scene.add(props.screenLight);
    props.ringLight = new THREE.PointLight(0xfff2c8,0,7); props.ringLight.position.set(-.4,1.5,1.2); scene.add(props.ringLight);

    // floor + walls
    const floor = box(10,.2,8,0x1d2038); floor.position.y=-.1; scene.add(floor);
    const wallB = box(10,4.4,.2,0x232748); wallB.position.set(0,2.2,-4); scene.add(wallB);
    const wallL = box(.2,4.4,8,0x20244a); wallL.position.set(-5,2.2,0); scene.add(wallL);
    const rug = cyl(1.5,1.5,.05,0xff5747); rug.position.set(-.3,.03,1.1); scene.add(rug);
    // window + moon
    const win = box(2.2,1.7,.06,0x0d1330); win.position.set(-2.4,2.5,-3.92); scene.add(win);
    const moonDisc = cyl(.32,.32,.05,0xfff6d8); moonDisc.rotation.x=Math.PI/2; moonDisc.material.emissive.set(0xfff2c0); moonDisc.material.emissiveIntensity=.9; moonDisc.position.set(-2.9,2.8,-3.87); scene.add(moonDisc);
    // posters (brand)
    const p1 = box(1.1,1.5,.05,0x3140f5); p1.position.set(1.1,2.6,-3.92); scene.add(p1);
    const p2 = box(1.1,1.5,.05,0xffd23f); p2.position.set(2.5,2.4,-3.92); scene.add(p2);
    const boltShape = new THREE.Shape();
    [[0,.45],[ -.16,.06],[ -.02,.06],[ -.2,-.45],[ .16,.02],[ .02,.02]].forEach((p,i)=> i? boltShape.lineTo(p[0],p[1]) : boltShape.moveTo(p[0],p[1]));
    const boltGeo = new THREE.ExtrudeGeometry(boltShape,{depth:.05,bevelEnabled:false});
    const bolt1 = new THREE.Mesh(boltGeo, M(0xffd23f)); bolt1.position.set(1.1,2.55,-3.88); scene.add(bolt1);
    const bolt2 = new THREE.Mesh(boltGeo, M(0x14141a)); bolt2.position.set(2.5,2.35,-3.88); scene.add(bolt2);

    // bed (left)
    const bed = new THREE.Group(); bed.position.set(-3.4,0,-1.2); scene.add(bed);
    box(2.4,.35,1.5,0x3a2d22,bed).position.y=.35;
    const matt = box(2.3,.22,1.4,0xe9e4d8,bed); matt.position.y=.62;
    box(.5,.14,1.1,0xffffff,bed).position.set(-.85,.78,0);       // pillow
    props.blanket = box(1.5,.16,1.42,0x3140f5,bed); props.blanket.position.set(.35,.74,0);
    props.bed = bed;

    // desk (right-back) + chair + monitor + laptop
    const desk = new THREE.Group(); desk.position.set(2.5,0,-2.7); scene.add(desk);
    box(2.6,.12,1.1,0x4a3527,desk).position.y=1.02;
    [[-1.2,-.45],[1.2,-.45],[-1.2,.45],[1.2,.45]].forEach(p=>{ const l=box(.1,1,.1,0x3a2a1f,desk); l.position.set(p[0],.5,p[1]); });
    const mon = new THREE.Group(); mon.position.set(-.35,1.08,-.25); desk.add(mon);
    box(.5,.06,.3,0x14141a,mon); cyl(.05,.05,.3,0x14141a,mon).position.y=.18;
    box(1.3,.8,.07,0x14141a,mon).position.y=.72;
    props.screen = box(1.18,.68,.02,0x0a0c1e,mon); props.screen.position.set(0,.72,.045);
    props.upload = box(.9,.1,.015,0xffd23f,mon); props.upload.position.set(-0,.6,.06); props.upload.scale.x=0.001; props.upload.visible=false;
    const lap = new THREE.Group(); lap.position.set(.75,1.08,.1); lap.rotation.y=-.5; desk.add(lap);
    box(.66,.04,.46,0x2b2d4a,lap); const lapScr=box(.66,.44,.03,0x2b2d4a,lap); lapScr.position.set(0,.24,-.22); lapScr.rotation.x=-.3;
    const chair = new THREE.Group(); chair.position.set(2.4,0,-1.55); scene.add(chair);
    box(.7,.1,.7,0xff5747,chair).position.y=.55; box(.7,.8,.1,0xff5747,chair).position.set(0,1,.32);
    cyl(.06,.06,.55,0x14141a,chair).position.y=.27; cyl(.3,.3,.06,0x14141a,chair).position.y=.03;
    props.chair = chair;

    // shelf + trophy
    const shelf = box(1.6,.1,.5,0x4a3527); shelf.position.set(-4.7,2.4,1.4); scene.add(shelf);
    const troph = new THREE.Group(); troph.position.set(-4.7,2.45,1.4); scene.add(troph);
    cyl(.12,.16,.1,0xd4a017,troph).position.y=.05; cyl(.09,.12,.22,0xd4a017,troph).position.y=.2;
    const cup = cyl(.14,.08,.16,0xd4a017,troph); cup.position.y=.36;

    // tripod + ring light + phone (front-center)
    const tri = new THREE.Group(); tri.position.set(-.4,0,1.2); scene.add(tri);
    for(let i=0;i<3;i++){ const l=cyl(.03,.03,1.5,0x14141a,tri); l.position.y=.7; l.rotation.z=.28; l.rotation.y=i*2.09; l.translateX(.32); }
    cyl(.05,.05,.5,0x14141a,tri).position.y=1.55;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.42,.05,10,28), M(0xf2ead6)); ring.position.y=1.55; ring.position.z=.0; tri.add(ring);
    props.ring = ring;
    props.phone = box(.16,.3,.03,0x14141a); props.phone.position.set(0,1.55,.06); tri.add(props.phone);
    const phScr = box(.13,.26,.01,0x101228); phScr.position.z=.02; props.phone.add(phScr);
    props.phoneHome = tri; props.recDot = cyl(.03,.03,.01,0xff2b1f); props.recDot.rotation.x=Math.PI/2;
    props.recDot.position.set(0,.1,.025); props.recDot.material.emissive.set(0xff2b1f); props.recDot.visible=false; props.phone.add(props.recDot);
    props.tri = tri;

    // characters
    G = makeChar(0x3140f5,0xc98d5e,0x14141a); scene.add(G.g);
    F = makeChar(0xff5747,0xdba06b,0x2b1c12); scene.add(F.g); F.g.visible=false;
    // Gautam asleep on bed
    G.g.position.set(-2.72,.86,-1.2); G.g.rotation.set(0,0,Math.PI/2);

    // door mark (front-left) for friend entry
    const door = box(.1,2.6,1.2,0x2b1c12); door.position.set(-5,1.3,2.6); scene.add(door);
    // platform logo cards (hidden, rise on cue)
    function logoCard(kind){
      const glow=(m,c,i)=>{m.material.emissive.set(c);m.material.emissiveIntensity=i;return m;};
      const g = new THREE.Group();
      const bc = kind==="yt"?0xff0000:kind==="ig"?0xe1306c:kind==="x"?0x14141a:0x0a66c2;
      const base = glow(kind==="yt" ? box(.44,.31,.06,bc,g) : box(.36,.36,.06,bc,g), bc, kind==="x"?.25:.6);
      const white = c => { c.material.color.set(0xffffff); return glow(c,0xffffff,.5); };
      if(kind==="yt"){
        const tsh = new THREE.Shape(); tsh.moveTo(-.07,.09); tsh.lineTo(-.07,-.09); tsh.lineTo(.1,0);
        const tri = new THREE.Mesh(new THREE.ExtrudeGeometry(tsh,{depth:.02,bevelEnabled:false}), M(0xffffff,0xffffff)); tri.material.emissiveIntensity=.5;
        tri.position.z=.03; g.add(tri);
      } else if(kind==="ig"){
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.09,.022,10,24), M(0xffffff,0xffffff)); ring.material.emissiveIntensity=.5;
        ring.position.z=.035; g.add(ring);
        white(box(.045,.045,.02,0,g)).position.set(.11,.11,.035);
      } else if(kind==="x"){
        const b1 = white(box(.05,.34,.02,0,g)); b1.position.z=.035; b1.rotation.z=Math.PI/4;
        const b2 = white(box(.05,.34,.02,0,g)); b2.position.z=.035; b2.rotation.z=-Math.PI/4;
      } else { // linkedin "in"
        white(box(.055,.055,.02,0,g)).position.set(-.1,.09,.035);
        white(box(.055,.15,.02,0,g)).position.set(-.1,-.045,.035);
        white(box(.055,.15,.02,0,g)).position.set(.0,-.045,.035);
        white(box(.13,.055,.02,0,g)).position.set(.04,.04,.035);
        white(box(.055,.12,.02,0,g)).position.set(.095,-.06,.035);
      }
      g.visible=false; scene.add(g); return g;
    }
    props.socials = ["yt","ig","x","li"].map(logoCard);
    // confetti pool
    props.confetti = [];
  }

  /* ---------- timeline engine ---------- */
  const cap = t => { const el=$("#roomCaption"); el.textContent=t; el.classList.add("show"); };
  const capOff = () => $("#roomCaption").classList.remove("show");
  function bubble(el, char, text, on){
    if(!on){ el.hidden=true; delete bub[el.id]; return; }
    el.textContent=text; el.hidden=false; bub[el.id]=char;
  }
  const lerp=(a,b,k)=>a+(b-a)*k, ease=k=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
  let steps=[], si=0, st=0;
  const S=(dur,start,update,end)=>steps.push({dur,start,update,end});
  function walkStep(c,x,z,dur,ry){ let fx,fz;
    S(dur,()=>{fx=c.g.position.x;fz=c.g.position.z;c.walking=true;
      c.g.rotation.y=Math.atan2(x-fx,z-fz);},
      k=>{const e=ease(k);c.g.position.x=lerp(fx,x,e);c.g.position.z=lerp(fz,z,e);},
      ()=>{c.walking=false; if(ry!==undefined)c.g.rotation.y=ry;});
  }

  function script(){
    steps=[]; si=0; st=0; skipFlag=false;
    // 1 asleep
    S(2.6,()=>{cap("The alarm goes off.");},
      k=>{G.torso.scale.y=1+Math.sin(clock.elapsedTime*2)*.03;});
    // 2 wake: sit up, then step off the bed
    S(2.2,()=>{cap("Gautam Talks gets up.");},
      k=>{const e=ease(k);
        if(e<.5){const p=e/.5;G.g.rotation.z=lerp(Math.PI/2,0,p);}
        else{const p=(e-.5)/.5;G.g.rotation.z=0;
          G.g.position.y=lerp(.86,0,p);G.g.position.z=lerp(-1.2,-.2,p);G.g.position.x=-2.72;G.g.rotation.y=0;}},
      ()=>{G.g.rotation.set(0,0,0);G.g.position.set(-2.72,0,-.2);});
    // 3 stretch
    S(1.4,()=>{},k=>{const s=Math.sin(k*Math.PI);G.armL.rotation.x=-2.6*s;G.armR.rotation.x=-2.6*s;},
      ()=>{G.armL.rotation.x=0;G.armR.rotation.x=0;});
    // 4 walk to desk + sit + research
    walkStep(G,2.35,-1.55,2.2,Math.PI);
    S(.6,()=>{G.seated=true;G.g.position.set(2.4,.5,-1.5);G.g.rotation.set(.12,Math.PI,0);G.legL.rotation.x=-1.55;G.legR.rotation.x=-1.55;G.head.rotation.x=.15;});
    S(3,()=>{cap("First: research.");props.screen.material.color.set(0x3140f5);props.screen.material.emissive.set(0x3140f5);props.screen.material.emissiveIntensity=.8;props.screenLight.intensity=1.4;},
      k=>{G.armR.rotation.x=-1+Math.sin(clock.elapsedTime*12)*.1;G.armL.rotation.x=-1+Math.cos(clock.elapsedTime*11)*.1;});
    // 5 stand, walk to tripod, record
    S(.5,()=>{G.seated=false;G.legL.rotation.x=0;G.legR.rotation.x=0;G.g.position.set(2.4,0,-1.55);G.g.rotation.set(0,Math.PI,0);G.head.rotation.x=0;G.armL.rotation.x=0;G.armR.rotation.x=0;});
    walkStep(G,-1.2,2.1,2.2,2.4);
    S(3.6,()=>{cap("Then: hit record.");props.ring.material.emissive.set(0xfff2c8);props.ring.material.emissiveIntensity=1;props.ringLight.intensity=1.6;props.recDot.visible=true;G.talking=true;},
      k=>{props.recDot.material.emissiveIntensity=(Math.sin(clock.elapsedTime*8)>0)?1:.1;},
      ()=>{G.talking=false;});
    // 6 grab phone, back to desk, edit
    S(.8,()=>{cap("Cut. He grabs the footage.");props.recDot.visible=false;props.ringLight.intensity=.3;
      props.tri.remove(props.phone);G.hand.add(props.phone);props.phone.position.set(0,0,.1);props.phone.rotation.set(0,0,0);G.armR.rotation.x=-.9;});
    walkStep(G,2.35,-1.55,2,Math.PI);
    S(.5,()=>{G.seated=true;G.g.position.set(2.4,.5,-1.5);G.g.rotation.set(.12,Math.PI,0);G.legL.rotation.x=-1.55;G.legR.rotation.x=-1.55;G.head.rotation.x=.15;G.armR.rotation.x=0;});
    S(2.8,()=>{cap("Time to edit.");},
      k=>{props.screen.material.color.setHSL(.55+Math.sin(clock.elapsedTime*9)*.06,.9,.5);props.screen.material.emissive.copy(props.screen.material.color);G.armR.rotation.x=-1+Math.sin(clock.elapsedTime*14)*.12;});
    // 7 upload
    S(2.6,()=>{cap("Uploading.");props.upload.visible=true;},
      k=>{props.upload.scale.x=Math.max(.001,k);},
      ()=>{props.screen.material.color.set(0x18c964);props.screen.material.emissive.set(0x18c964);});
    // 8 post everywhere
    S(3,()=>{cap("Posting everywhere.");G.armR.rotation.x=-1.4;
      props.socials.forEach((s,i)=>{s.visible=true;s.position.set(1.75+i*.46,1.6,-1.25);s.rotation.set(0,0,0);s.userData.t=i*.18;});},
      k=>{props.socials.forEach((s,i)=>{const kk=Math.max(0,k-s.userData.t);s.position.y=1.6+kk*1.4;s.rotation.y+=.04;});},
      ()=>{props.socials.forEach(s=>s.visible=false);});
    // 9 friend enters, slumped
    S(.4,()=>{capOff();G.seated=false;G.legL.rotation.x=0;G.legR.rotation.x=0;G.g.position.y=0;G.g.rotation.x=0;G.head.rotation.x=0;G.armR.rotation.x=0;
      props.tri.add(props.phone);props.phone.position.set(0,1.55,.06);
      F.g.visible=true;F.set(-4.6,2.6,Math.PI/2);F.torso.rotation.x=.5;F.head.rotation.x=.5;});
    walkStep(F,-1.6,1.6,2.4,.9);
    S(2.6,()=>{bubble($("#bubbleA"),F,"bro... I don't feel ready for anything.",true);});
    // 10 gautam responds
    S(.2,()=>{bubble($("#bubbleA"),F,"",false);});
    walkStep(G,-.7,1.5,1.6,-1.6);
    S(3.2,()=>{G.armR.rotation.x=-.9;bubble($("#bubbleB"),G,"Nobody ever feels ready. Start anyway, I'll climb with you. \u26A1",true);},
      k=>{},()=>{bubble($("#bubbleB"),G,"",false);G.armR.rotation.x=0;});
    // 11 friend rises + both jump + confetti
    S(1.2,()=>{cap("Every single day.");},
      k=>{F.torso.rotation.x=lerp(.5,0,ease(k));F.head.rotation.x=lerp(.5,0,ease(k));});
    S(1.8,()=>{for(let i=0;i<46;i++){const c=box(.09,.14,.02,[0xffd23f,0x3140f5,0xff5747,0xffffff][i%4]);
        c.position.set(-1.1+(Math.random()-.5)*3,2.6+Math.random()*2,1.5+(Math.random()-.5)*2);
        c.userData={vx:(Math.random()-.5)*.03,vy:-.02-Math.random()*.03,rz:(Math.random()-.5)*.2};
        scene.add(c);props.confetti.push(c);}},
      k=>{const j=Math.abs(Math.sin(k*Math.PI*2))*.45;G.g.position.y=j;F.g.position.y=j;},
      ()=>{G.g.position.y=0;F.g.position.y=0;});
    // 12 title card
    S(.4,()=>{capOff();$("#roomTitle").hidden=false;});
  }

  /* ---------- loop ---------- */
  function showErr(m){ let e=document.getElementById("roomErr");
    if(!e){ e=document.createElement("div"); e.id="roomErr";
      e.style.cssText="position:absolute;left:16px;bottom:16px;font:600 11px/1.4 monospace;color:#ff8a80;max-width:70vw;z-index:5";
      document.getElementById("room").appendChild(e); }
    e.textContent="ROOM ERROR: "+m; }
  function tick(){
    raf = requestAnimationFrame(tick);
   try{
    const dt = Math.min(clock.getDelta(), .1), t = clock.elapsedTime;
    if(si < steps.length){
      const s = steps[si];
      if(st===0 && s.start) s.start();
      st += dt;
      const k = Math.min(1, st/s.dur);
      if(s.update) s.update(k);
      if(skipFlag){ if(s.update)s.update(1); if(s.end)s.end(); si=steps.length-1; st=0; skipFlag=false;
        steps[si].start&&steps[si].start(); si++; }
      else if(k>=1){ if(s.end)s.end(); si++; st=0; }
    }
    limbTick(G,t); if(F.g.visible) limbTick(F,t);
    props.confetti.forEach(c=>{c.position.x+=c.userData.vx;c.position.y+=c.userData.vy;c.rotation.z+=c.userData.rz;});
    // bubbles follow heads
    for(const id in bub){ const el=document.getElementById(id), c=bub[id];
      const p=c.head.getWorldPosition(new THREE.Vector3()).project(cam);
      el.style.left=((p.x*.5+.5)*innerWidth)+"px";
      el.style.top=((-p.y*.5+.5)*innerHeight)+"px"; }
    ren.render(scene,cam);
   }catch(e){ showErr(e.message); cancelAnimationFrame(raf); }
  }
  function size(){ if(!ren)return; cam.aspect=innerWidth/innerHeight; cam.updateProjectionMatrix(); ren.setSize(innerWidth,innerHeight); }

  /* ---------- public ---------- */
  function open(){
    const root=$("#room"); root.hidden=false; document.body.style.overflow="hidden";
    $("#roomTitle").hidden=true;
    if(!inited){
      ren=new THREE.WebGLRenderer({antialias:true});
      $("#roomCanvas").appendChild(ren.domElement);
      ren.setPixelRatio(Math.min(devicePixelRatio,2));
      build(); clock=new THREE.Clock(); addEventListener("resize",size); inited=true;
    } else {
      // reset scene state
      G.g.position.set(-2.72,.86,-1.2);G.g.rotation.set(0,0,Math.PI/2);G.walking=false;G.talking=false;
      F.g.visible=false;F.torso.rotation.x=0;F.head.rotation.x=0;
      props.screen.material.color.set(0x0a0c1e);props.screen.material.emissive.set(0x000000);props.screenLight.intensity=0;
      props.ring.material.emissive.set(0x000000);props.ringLight.intensity=0;props.upload.visible=false;props.upload.scale.x=.001;
      props.confetti.forEach(c=>scene.remove(c));props.confetti.length=0;
      if(props.phone.parent!==props.tri){props.phone.parent.remove(props.phone);props.tri.add(props.phone);}
      props.phone.position.set(0,1.55,.06);
      bubble($("#bubbleA"),null,"",false);bubble($("#bubbleB"),null,"",false);
    }
    size(); script(); clock.getDelta(); $("#roomLoading").style.display="none";
    running=true; cancelAnimationFrame(raf); tick();
  }
  function close(){
    running=false; cancelAnimationFrame(raf);
    $("#room").hidden=true; document.body.style.overflow="";
    capOff(); $("#roomTitle").hidden=true;
  }
  function state(){
    if(!inited) return {inited:false};
    const scr = o => { const v = o.getWorldPosition(new THREE.Vector3()).project(cam);
      return { x: Math.round((v.x*.5+.5)*innerWidth), y: Math.round((-v.y*.5+.5)*innerHeight) }; };
    const pose = c => ({ p:[+c.g.position.x.toFixed(2),+c.g.position.y.toFixed(2),+c.g.position.z.toFixed(2)],
      rx:+c.g.rotation.x.toFixed(2), ry:+c.g.rotation.y.toFixed(2), rz:+c.g.rotation.z.toFixed(2),
      legs:+c.legL.rotation.x.toFixed(2), head:scr(c.head) });
    return { inited:true, G:pose(G), Fvis:F.g.visible,
      phone: props.phone.parent===props.tri ? "tripod":"hand",
      socials: props.socials.map(o=>({v:o.visible, y:+o.position.y.toFixed(2), scr:scr(o)})) };
  }
  return { open, close, skip:()=>{skipFlag=true;}, state };
})();
