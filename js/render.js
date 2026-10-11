'use strict';
// Renderer: low-res HDR scene pass + first-person viewmodel pass + retro horror post-process.
const R = (() => {
  const POOL = 6, REMOTE_FLASH = 3;
  const fx = { fear: 0, damage: 0, fade: 0, leech: 0, flash: 0, static: 0, lowhp: 0, exposure: 1, health: 1, bloom: 0.3, white: 0, heat: 0, cabin: 1, warp: 0, heatCol: new THREE.Color(1.2, 0.4, 0.1), peek: 0, peekUV: new THREE.Vector2(), sun: 0, sunDir: new THREE.Vector3(0, 1, 0) };
  let renderer, scene, camera, vmScene, vmCamera, rt, post, postScene, postCam, hemi, sun, flash, remote = [], beams = [], pool = [], vmHemi, vmPoint;
  let glowLocal, glowRemote = [], dust, dustMat;
  let poolSel = [], poolT = 0;
  // space backdrop: its own scene + camera (near 20 / far 40000) so the planet, clouds and rings keep full depth precision
  let bgScene, bgCam, bgSun, bgHemi, backdrop = null, sunObj = null, bgNear = 20;
  const _sv = new THREE.Vector3(), _ss = new THREE.Vector3();

  // ---- atmospheric fog for every material ----
  // three's fog chunks are replaced with exponential height fog (thick in hollows, thinning with altitude) that
  // also scatters sunlight toward the sun. The parameters live in two shared Float32Arrays that every material's
  // uniform list references, so one write per frame reaches all of them.
  const FOG_A = new Float32Array([0, 1, 0, 0]);   // sun dir xyz, height falloff (0 = classic fog)
  const FOG_B = new Float32Array([0, 0, 0, 0]);   // sun scatter rgb, fog base height
  // scanner pulse, drawn into every lit surface: origin xyz + wave radius (0 = off); intensity, progress
  const SCAN_A = new Float32Array([0, 0, 0, 0]);
  const SCAN_B = new Float32Array([0, 0, 0, 0]);
  // the ship's cabin keeps the outside mist out: world -> ship matrix, and how clear the cabin air is (0..1)
  const SHIP_INV = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const SHIP_C = new Float32Array([0, 0.85, 0, 0]);   // y: how much sky light the cabin keeps out; w: cabin air clarity
  let scanState = null;
  function installFog() {
    const C = THREE.ShaderChunk;
    C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogWorld;\n#endif';
    C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogWorld = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;\n#endif';
    C.fog_pars_fragment = `#ifdef USE_FOG
      uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld; uniform vec4 uFogA; uniform vec4 uFogB; uniform vec4 uScanA; uniform vec4 uScanB; uniform mat4 uShipInv; uniform vec4 uShipC;
      #ifdef FOG_EXP2
        uniform float fogDensity;
      #else
        uniform float fogNear; uniform float fogFar;
      #endif
      // inside the ship's cabin (in ship coordinates: the bay, then the tapering cockpit) the hull keeps the sky's
      // ambient light out; the cabin is lit by its own lamps and whatever comes through the hatch and windows
      float cabinSky() {
        vec3 sl = ( uShipInv * vec4( vFogWorld, 1.0 ) ).xyz;
        float hw = sl.x < 3.65 ? 4.1 : 3.32 - ( sl.x - 3.7 ) * 0.2889;
        float inCab = step( -7.2, sl.x ) * step( sl.x, 8.2 ) * step( abs( sl.z ), hw ) * step( -0.2, sl.y ) * step( sl.y, 3.45 );
        return 1.0 - inCab * uShipC.y;
      }
    #else
      float cabinSky() { return 1.0; }
    #endif`;
    C.lights_fragment_begin = C.lights_fragment_begin.replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );', 'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * cabinSky();');
    C.fog_fragment = `#ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogAmt = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        vec3 fogCol = fogColor;
        if ( uFogA.w > 0.0 ) {
          vec3 fr = vFogWorld - cameraPosition; float fd = length( fr );
          float k = uFogA.w, kdy = k * fr.y;
          float hf = exp( - k * clamp( cameraPosition.y - uFogB.w, -25.0, 60.0 ) ) * ( abs( kdy ) > 0.001 ? ( 1.0 - exp( - kdy ) ) / kdy : 1.0 );
          fogAmt = 1.0 - exp( - fogDensity * fogDensity * fd * fd * clamp( hf, 0.0, 4.0 ) );
          float sd = max( dot( fr / max( fd, 0.001 ), uFogA.xyz ), 0.0 );
          fogCol += uFogB.rgb * ( pow( sd, 5.0 ) * 0.55 + pow( sd, 40.0 ) * 0.9 );
        }
      #else
        float fogAmt = smoothstep( fogNear, fogFar, vFogDepth ); vec3 fogCol = fogColor;
      #endif
      // standing in the ship, its cabin clears of mist (surfaces inside the hull lose their fog)
      if ( uShipC.w > 0.0 ) {
        vec3 sl = ( uShipInv * vec4( vFogWorld, 1.0 ) ).xyz;
        float cab = step( -12.6, sl.x ) * step( sl.x, 10.0 ) * step( abs( sl.z ), 4.6 ) * step( -0.6, sl.y ) * step( sl.y, 5.0 );
        fogAmt *= 1.0 - cab * uShipC.w;
      }
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogAmt );
      // scanner: a bright wavefront rolls out over every surface, leaving a fading topographic net behind it.
      // Flat ground reads cool, walls and steep slopes warm, so the shape of the place pops out of the dark.
      if ( uScanA.w > 0.0 ) {
        vec3 sp = vFogWorld - uScanA.xyz; float sd = length( sp ), R = uScanA.w;
        float behind = R - sd;
        // the wavefront: a thin bright rim with a short soft tail
        float rim = ( 1.0 - smoothstep( 0.0, 0.35, abs( behind - 0.12 ) ) );
        float tailF = ( 1.0 - smoothstep( 0.0, 1.6, behind ) ) * step( 0.0, behind );
        float front = ( rim * 1.0 + tailF * 0.35 ) * ( 1.0 - smoothstep( 0.82, 1.0, uScanB.y ) );
        // the net: contour lines every metre of height and rings every 2.5 m out from you, hair-thin, fading behind the wave
        float hy = vFogWorld.y, hr = sd * 0.4;
        float lh = abs( fract( hy ) - 0.5 ) / max( fwidth( hy ), 1e-4 ), lr = abs( fract( hr ) - 0.5 ) / max( fwidth( hr ), 1e-4 );
        float net = ( 1.0 - clamp( min( lh, lr ) * 1.4, 0.0, 1.0 ) ) * step( 0.0, behind ) * exp( - behind * 0.09 );
        vec3 fn = normalize( cross( dFdx( vFogWorld ), dFdy( vFogWorld ) ) );
        vec3 sc = mix( vec3( 1.0, 0.6, 0.25 ), vec3( 0.35, 0.85, 1.0 ), smoothstep( 0.55, 0.92, abs( fn.y ) ) );
        gl_FragColor.rgb += sc * ( front + net * 0.2 ) * uScanB.x * ( 1.0 - fogAmt * 0.6 );
      }
    #endif`;
    for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u) { u.uFogA = { value: FOG_A }; u.uFogB = { value: FOG_B }; u.uScanA = { value: SCAN_A }; u.uScanB = { value: SCAN_B }; u.uShipInv = { value: SHIP_INV }; u.uShipC = { value: SHIP_C }; } }
  }
  // where the ship is (its world matrix) and how clear its cabin air is right now
  const _inv = new THREE.Matrix4();
  function setShipFog(shipMatrix, clear) { _inv.copy(shipMatrix).invert(); SHIP_INV.set(_inv.elements); SHIP_C[3] = clear; }
  // start a scanner pulse from a point; the wave runs out to maxR at speed m/s, then fades
  function startScan(origin, maxR, speed) { scanState = { o: origin.clone(), maxR, speed, t0: performance.now() / 1000 }; }
  function updateScan(t) {
    if (!scanState) return;
    const s = scanState, age = t - s.t0, R = Math.min(s.maxR, age * s.speed), tail = age - s.maxR / s.speed;
    const k = tail > 0 ? Math.max(0, 1 - tail / 1.6) : 1;
    SCAN_A[0] = s.o.x; SCAN_A[1] = s.o.y; SCAN_A[2] = s.o.z; SCAN_A[3] = Math.max(0.001, R);
    SCAN_B[0] = k; SCAN_B[1] = R / s.maxR;
    if (k <= 0) { scanState = null; SCAN_A[3] = 0; SCAN_B[0] = 0; }
  }
  function setFog(sunDir, scatter, falloff, base) {
    FOG_A[0] = sunDir ? sunDir.x : 0; FOG_A[1] = sunDir ? sunDir.y : 1; FOG_A[2] = sunDir ? sunDir.z : 0; FOG_A[3] = falloff || 0;
    FOG_B[0] = scatter ? scatter.r : 0; FOG_B[1] = scatter ? scatter.g : 0; FOG_B[2] = scatter ? scatter.b : 0; FOG_B[3] = base || 0;
  }

  // ---- bloom: bright pass at quarter resolution, separable blur, added before tone mapping ----
  const BLOOM_PRE = `uniform sampler2D tSrc; uniform vec2 uTx; varying vec2 vUv;
    void main(){ vec3 c = vec3(0.0);
      c += texture2D(tSrc, vUv + uTx * vec2(-1.0, -1.0)).rgb; c += texture2D(tSrc, vUv + uTx * vec2(1.0, -1.0)).rgb;
      c += texture2D(tSrc, vUv + uTx * vec2(-1.0, 1.0)).rgb; c += texture2D(tSrc, vUv + uTx * vec2(1.0, 1.0)).rgb; c *= 0.25;
      float l = max(c.r, max(c.g, c.b)); float w = smoothstep(0.85, 2.2, l);
      gl_FragColor = vec4(min(c * w, vec3(24.0)), 1.0); }`;
  const BLOOM_BLUR = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
      c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
      c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
      gl_FragColor = vec4(c, 1.0); }`;

  const POST_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const POST_FS = `
    uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform sampler2D tVol; uniform float uVolOn; uniform float uBloom; uniform vec2 uRes; uniform float uTime, uFear, uDamage, uFade, uLeech, uFlash, uBright, uStatic, uExposure, uLowHp, uHealth, uSun, uWhite, uHeat, uWarp, uPeek; uniform vec2 uSunUV, uPeekUV; uniform vec3 uHeatCol;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
    float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    void main(){
      vec2 c0 = vUv - 0.5;
      vec2 uv = 0.5 + c0 * (1.0 - 0.14 * dot(c0, c0));
      uv += vec2(sin(uv.y * 40.0 + uTime * 7.0), cos(uv.x * 30.0 + uTime * 5.0)) * 0.0014 * uFear;
      if (uLeech > 0.0) uv += vec2(sin(uv.y * 9.0 + uTime * 3.0), cos(uv.x * 7.0 + uTime * 2.3)) * 0.012 * uLeech;
      // re-entry: the air outside burning shimmers the view
      if (uHeat > 0.0) uv += (vec2(vnoise(uv * 14.0 + uTime * 6.0), vnoise(uv * 13.0 - uTime * 5.0)) - 0.5) * 0.006 * uHeat;
      // the jump: space bends round the ship; the view is drawn out from the middle, more and more the deeper in
      if (uWarp > 0.0) {
        float rr = length(c0), ang = uWarp * (0.05 * (1.0 - rr) * sin(uTime * 1.3) + 0.015 * sin(uTime * 4.0 + rr * 9.0));
        uv = 0.5 + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (uv - 0.5) * (1.0 - uWarp * (0.22 * rr + 0.02 * sin(uTime * 5.0)));
      }
      vec2 c = uv - 0.5;
      float ca = uFear * 0.006 + uDamage * 0.012 + uWarp * 0.018;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // the air between you and everything: what's lost on the way (alpha) and the light it scatters toward you (rgb)
      if (uVolOn > 0.5) { vec4 fv = texture2D(tVol, uv); col = col * fv.a + fv.rgb; }
      // ...smeared outward in long streaks, with just a hint of colour at the edges
      if (uWarp > 0.0) {
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 8; i++) { vec2 u2 = 0.5 + (uv - 0.5) * (1.0 - float(i) * 0.024 * uWarp);
          acc += vec3(texture2D(tDiffuse, u2 + c * ca).r, texture2D(tDiffuse, u2).g, texture2D(tDiffuse, u2 - c * ca).b); }
        col = mix(col, acc / 8.0, min(1.0, uWarp * 1.4));
      }
      // sun glare: only when the sun's disc is actually unblocked (its HDR core is sampled straight from the frame)
      if (uSun > 0.0) {
        vec2 tx = 1.0 / uRes; float v = 0.0;
        v += step(5.0, dot(texture2D(tDiffuse, uSunUV).rgb, vec3(0.3333)));
        v += step(5.0, dot(texture2D(tDiffuse, uSunUV + vec2(tx.x, 0.0)).rgb, vec3(0.3333)));
        v += step(5.0, dot(texture2D(tDiffuse, uSunUV - vec2(tx.x, 0.0)).rgb, vec3(0.3333)));
        v += step(5.0, dot(texture2D(tDiffuse, uSunUV + vec2(0.0, tx.y)).rgb, vec3(0.3333)));
        v += step(5.0, dot(texture2D(tDiffuse, uSunUV - vec2(0.0, tx.y)).rgb, vec3(0.3333)));
        v *= 0.2 * uSun * (uVolOn > 0.5 ? texture2D(tVol, uSunUV).a : 1.0);
        vec2 dv = (uv - uSunUV) * vec2(uRes.x / uRes.y, 1.0);
        float d = length(dv);
        float gl = 3.2 * exp(-d * 28.0) + 0.7 * exp(-d * 8.0) + 0.09 * exp(-d * 2.2);
        float streak = 0.2 * exp(-abs(dv.y) * 120.0) * exp(-abs(dv.x) * 3.0);
        col += vec3(1.0, 0.93, 0.82) * v * (gl + streak);
      }
      // the sun just peeking out past the edge of something in its way (the world, a moon): a lens flare, a soft glow
      // where it is and a few faint ghosts strung across the view through the middle, strongest when only a sliver shows
      if (uPeek > 0.0) {
        vec2 asp = vec2(uRes.x / uRes.y, 1.0), ax = vec2(0.5) - uPeekUV;
        vec3 f = vec3(1.0, 0.9, 0.75) * 0.45 * exp(-length((uv - uPeekUV) * asp) * 14.0);
        for (int i = 0; i < 5; i++) {
          float k = float(i), r = 0.02 + 0.018 * mod(k * 1.7, 3.0), gd = length((uv - (uPeekUV + ax * (0.55 + k * 0.4))) * asp);
          vec3 tint = mix(vec3(1.0, 0.75, 0.5), vec3(0.55, 0.75, 1.0), mod(k, 2.0));
          f += tint * (0.07 * smoothstep(r, r * 0.55, gd) + 0.04 * exp(-abs(gd - r * 1.5) * 110.0)) * (1.0 - k * 0.12);
        }
        col += f * uPeek;
      }
      col += texture2D(tBloom, uv).rgb * uBloom;
      if (uWarp > 0.0) { float rr = length(c0); col += uWarp * 0.06 * smoothstep(0.25, 0.8, rr) * (0.5 + 0.5 * cos(6.2832 * (rr * 1.6 + atan(c0.y, c0.x) * 0.16 - uTime * 0.45 + vec3(0.0, 0.33, 0.67)))); }
      // ...and its glow floods in around the edges of everything, flickering
      if (uHeat > 0.0) { float rr = length(c0); col += uHeatCol * uHeat * (0.55 + 0.45 * vnoise(uv * 5.0 + uTime * 3.0)) * smoothstep(0.35, 0.85, rr) * 0.6; }
      col = aces(col * uExposure);
      col = pow(col, vec3(1.0 / 2.2));
      col = pow(col, vec3(1.0 / uBright));
      // through the cloud deck: everything goes to a bright grey-white
      col = mix(col, vec3(0.84, 0.86, 0.88), uWhite);
      // health: colour drains toward black and white, the edges close in and bleed
      float hurt = 1.0 - clamp(uHealth, 0.0, 1.0);
      float r = length(c0);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum), smoothstep(0.08, 0.85, hurt) * 0.97);
      float splat = vnoise(uv * vec2(7.0, 4.5) + 3.1) * 0.55 + vnoise(uv * 19.0) * 0.25;
      float blood = smoothstep(0.62, 0.9, r * 1.25 + splat * 0.45 - (1.0 - hurt) * 0.55) * smoothstep(0.12, 0.55, hurt);
      col = mix(col, vec3(0.16, 0.0, 0.01) + col * 0.1, clamp(blood, 0.0, 0.92));
      col *= 1.0 - smoothstep(0.2, 0.75, r) * hurt * 0.8;
      vec2 px = floor(vUv * uRes);
      float d = bayer4(px) - 0.5;
      col = floor(col * 30.0 + d + 0.5) / 30.0;
      float g = hash(px + fract(uTime * 1.3) * 91.0) - 0.5;
      col += g * (0.035 + uFear * 0.07 + hurt * 0.04);
      if (uStatic > 0.0) {
        float line = step(0.97, hash(vec2(floor(px.y / 2.0), floor(uTime * 24.0))));
        col = mix(col, vec3(hash(px * 1.31 + uTime)), clamp(uStatic * 0.85 + line * uStatic * 0.4, 0.0, 1.0));
      }
      col *= 0.95 + 0.05 * sin(px.y * 3.14159);
      col *= mix(0.2, 1.0, smoothstep(0.82, 0.22, r * (1.0 + uFear * 0.4)));
      col = mix(col, vec3(0.42, 0.0, 0.0), clamp(uDamage, 0.0, 1.0) * smoothstep(0.1, 0.65, r));
      col = mix(col, col * vec3(1.0, 0.45, 0.45), uLowHp * (0.5 + 0.5 * sin(uTime * 5.0)) * smoothstep(0.25, 0.75, r));
      if (uLeech > 0.0) {
        float v = 0.5 + 0.5 * sin(uv.x * 26.0 + sin(uv.y * 11.0 + uTime * 2.7) * 3.0) * sin(uv.y * 19.0 - uTime * 1.9);
        vec3 flesh = mix(vec3(0.07, 0.01, 0.015), vec3(0.32, 0.12, 0.12), v * v) * (0.8 + 0.2 * sin(uTime * 7.0));
        float hole = smoothstep(0.06, 0.32, r + (v - 0.5) * 0.08);
        col = mix(col, flesh, uLeech * mix(0.55, 1.0, hole));
      }
      col += uFlash;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`;

  function makeBeam() {
    const h = 9;
    const geo = new THREE.ConeGeometry(1.9, h, 24, 1, true); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, h / 2);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uH: { value: h }, uCol: { value: new THREE.Color(0xfff2dc) } },
      vertexShader: 'uniform float uH; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = position.z / uH; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; uniform vec3 uCol; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(vN, vV)), 1.3); float a = uA * pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.06, vT) * e; gl_FragColor = vec4(uCol * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    m.frustumCulled = false; m.visible = false;
    return m;
  }
  function makeDust() {
    const n = 700, p = new Float32Array(n * 3), s = new Float32Array(n), rr = new RNG(77);
    for (let i = 0; i < n; i++) { p.set([rr.range(-5, 5), rr.range(-5, 5), rr.range(-5, 5)], i * 3); s[i] = rr.next(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    dustMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFP: { value: new THREE.Vector3() }, uFD: { value: new THREE.Vector3(0, 0, -1) }, uCos: { value: 0.9 }, uOn: { value: 0 } },
      vertexShader: `uniform float uTime; uniform vec3 uCam; uniform vec3 uFP; uniform vec3 uFD; uniform float uCos; uniform float uOn; attribute float aSeed; varying float vA;
        void main(){ vec3 p = position + vec3(sin(uTime * 0.13 + aSeed * 6.0), sin(uTime * 0.09 + aSeed * 3.0) * 0.6, cos(uTime * 0.11 + aSeed * 4.0)) * 0.45;
          p = mod(p - uCam + 5.0, 10.0) - 5.0 + uCam;
          vec3 d = p - uFP; float l = length(d);
          float inCone = smoothstep(uCos, uCos + 0.04, dot(d / max(l, 0.001), uFD));
          vA = inCone * uOn * smoothstep(8.0, 1.2, l) * smoothstep(0.35, 0.9, l) * (0.4 + aSeed * 0.6);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); gl_PointSize = 1.6; }`,
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * vA * 0.55, vA); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, dustMat); pts.frustumCulled = false;
    return pts;
  }

  // ---- the air, volumetric: each pixel's line of sight marched out through it to whatever it hits (the depth buffer)
  // or far out over the land, adding up what the air takes away and the light it scatters back toward you. The air is
  // thickest on the ground and thins as it goes up; drifting patches of mist lie low over the land; cloud banks hang
  // among the far hills; and where the sun's shadow map says a point is shaded, it scatters no sunlight, so light comes
  // through the trees in shafts. Drawn at half the frame's size and laid over it in post.
  const VOL_FS = `
    #include <packing>
    precision highp sampler3D;
    uniform sampler2D tDepth, tH, tShadow; uniform sampler3D tN; uniform mat4 uProjInv, uViewInv, uShadowM, uShipInv;
    uniform vec3 uCam, uSunDir, uFogCol, uScat, uOrg; uniform vec4 uHB, uDen, uCloud; uniform vec2 uHR, uWind, uRes; uniform float uTime, uFar, uShadowOn, uFrame;
    varying vec2 vUv;
    float groundH(vec2 xz) { return mix(uHR.x, uHR.y, texture2D(tH, (xz - uOrg.xz - uHB.xy) / uHB.z).r) + uOrg.y; }
    float noise3(vec3 q) { return texture(tN, q).r; }
    // uDen: x the air's density on the ground, y how fast it thins with height, z the low mist's density, w its depth (m)
    // uCloud: x the cloud banks' density, y the height they hang at, z how deep they are, w how far out they start
    float density(vec3 p, out float n) {
      vec3 q = p * 0.03 + vec3(uWind.x, 0.0, uWind.y) * uTime * 0.03;
      n = noise3(q) * 0.62 + noise3(q * 2.63 + 3.7) * 0.38;
      float air = uDen.x * exp(-clamp(p.y - uOrg.y, -20.0, 400.0) * uDen.y) * (0.7 + 0.6 * n);
      float gh = groundH(p.xz), above = p.y - gh;
      float mist = uDen.z * exp(-max(above, 0.0) / uDen.w) * smoothstep(0.38, 0.72, n) * step(-1.0, above);
      float r = length(p.xz - uOrg.xz), cl = 0.0;
      if (uCloud.x > 0.0 && r > uCloud.w) {
        float y = p.y - uOrg.y - uCloud.y, band = smoothstep(-uCloud.z * 0.45, 0.0, y) * (1.0 - smoothstep(0.0, uCloud.z, y));
        vec3 cq = p * 0.0065 + vec3(uTime * 0.0014, 0.0, uTime * 0.0006);
        float cn = noise3(cq) * 0.6 + noise3(cq * 2.4 + 1.3) * 0.4;
        cl = uCloud.x * band * smoothstep(0.48, 0.7, cn + 0.15 * n) * smoothstep(uCloud.w, uCloud.w + 60.0, r);
      }
      // (none of it inside the ship)
      vec3 sl = (uShipInv * vec4(p, 1.0)).xyz;
      if (sl.x > -18.6 && sl.x < 12.6 && abs(sl.z) < 5.2 && sl.y > -1.1 && sl.y < 5.3) return 0.0;
      return air + mist + cl;
    }
    float sunLit(vec3 p) {
      if (uShadowOn < 0.5) return 1.0;
      vec4 sc = uShadowM * vec4(p, 1.0); sc.xyz /= sc.w;
      if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
      return step(sc.z - 0.002, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
    }
    void main() {
      float d = texture2D(tDepth, vUv).r;
      vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
      vec3 end = (uViewInv * v).xyz, rd = end - uCam; float L = length(rd); rd /= max(L, 1e-4);
      if (d >= 1.0) L = uFar; L = min(L, uFar);
      // (steps bunched up near you, where it matters most; each pixel starting a little differently so no bands show)
      float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * 5.588238, vec2(0.06711056, 0.00583715))));
      float mu = max(dot(rd, uSunDir), 0.0), glow = pow(mu, 5.0) * 0.55 + pow(mu, 40.0) * 0.9;
      vec3 acc = vec3(0.0); float T = 1.0;
      const int N = 30;
      for (int i = 0; i < N; i++) {
        float t0 = L * pow(float(i) / float(N), 2.0), t1 = L * pow(float(i + 1) / float(N), 2.0), dt = t1 - t0;
        vec3 p = uCam + rd * mix(t0, t1, jit);
        float n, den = density(p, n);
        if (den < 1e-6) continue;
        // light scattered toward you here: the sky's grey light all round, and the sun's (where it reaches), brightest
        // looking toward it; thicker mist a shade darker inside
        vec3 Ls = uFogCol * (1.08 - 0.16 * n) + uScat * (0.1 + glow * 1.4) * sunLit(p);
        float a = exp(-den * dt);
        acc += T * (1.0 - a) * Ls; T *= a;
        if (T < 0.01) break;
      }
      gl_FragColor = vec4(acc, T);
    }`;
  const vol = { on: false, rt: null, mat: null, scene: null, frame: 0 };
  let bloomA, bloomB, bloomPre, bloomBlur, quadScene, quad, shadowSize = 15;
  function init(canvas) {
    installFog();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.08);
    camera = new THREE.PerspectiveCamera(Settings.fov, 1, 0.05, 700);
    scene.add(camera);
    hemi = new THREE.HemisphereLight(0x9aa6b4, 0x1a1712, 0.0); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 0); sun.position.set(40, 80, 20); scene.add(sun); scene.add(sun.target);
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 120 });
    flash = new THREE.SpotLight(0xfff2dc, 0, 24, 0.42, 0.6, 1.5);
    flash.map = TEX.get('cookie');
    flash.castShadow = true; flash.shadow.mapSize.set(512, 512); flash.shadow.bias = -0.0006; flash.shadow.camera.near = 0.2; flash.shadow.camera.far = 40;
    flash.position.set(0.22, -0.18, 0.05); flash.target.position.set(0.05, -0.08, -6);
    camera.add(flash); camera.add(flash.target);
    for (let i = 0; i < REMOTE_FLASH; i++) { const s = new THREE.SpotLight(0xfff2dc, 0, 24, 0.42, 0.5, 1.5); scene.add(s); scene.add(s.target); remote.push(s); const b = makeBeam(); scene.add(b); beams.push(b); }
    for (let i = 0; i < POOL; i++) { const p = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(p); pool.push(p); }
    glowLocal = new THREE.PointLight(0xffffff, 0, 4.5, 2); scene.add(glowLocal);
    for (let i = 0; i < 2; i++) { const g = new THREE.PointLight(0xffffff, 0, 4.5, 2); scene.add(g); glowRemote.push(g); }
    dust = makeDust(); scene.add(dust);
    bgScene = new THREE.Scene();
    bgCam = new THREE.PerspectiveCamera(Settings.fov, 1, 20, 40000);
    bgSun = new THREE.DirectionalLight(0xfff1dc, 5); bgScene.add(bgSun); bgScene.add(bgSun.target);
    bgHemi = new THREE.HemisphereLight(0x2a3448, 0x000000, 0.3); bgScene.add(bgHemi);
    vmScene = new THREE.Scene();
    vmCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    vmHemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.3); vmScene.add(vmHemi);
    vmPoint = new THREE.PointLight(0xfff2dc, 0, 3, 2); vmPoint.position.set(0.3, 0.2, 0.2); vmScene.add(vmPoint);
    rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    // (the frame's depth, kept so the air can be marched out to whatever each pixel hits)
    rt.depthTexture = new THREE.DepthTexture(16, 16); rt.depthTexture.type = THREE.UnsignedIntType;
    vol.rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    {
      // (tiling 3D noise for the mist and the clouds: smooth value noise on a wrapping lattice, three octaves)
      const S = 32, d = new Uint8Array(S * S * S), r = new RNG(4242), lat = [4, 8, 16].map((P) => ({ P, g: Array.from({ length: P * P * P }, () => r.next()) }));
      const sm = (t) => t * t * (3 - 2 * t), at = (L, a, b, c) => { const P = L.P, m = (k) => ((k % P) + P) % P; return L.g[(m(c) * P + m(b)) * P + m(a)]; };
      const vn = (L, x, y, z) => { const P = L.P, fx = x * P, fy = y * P, fz = z * P, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), u = sm(fx - ix), v = sm(fy - iy), w = sm(fz - iz);
        const l = (a, b, t) => a + (b - a) * t;
        return l(l(l(at(L, ix, iy, iz), at(L, ix + 1, iy, iz), u), l(at(L, ix, iy + 1, iz), at(L, ix + 1, iy + 1, iz), u), v), l(l(at(L, ix, iy, iz + 1), at(L, ix + 1, iy, iz + 1), u), l(at(L, ix, iy + 1, iz + 1), at(L, ix + 1, iy + 1, iz + 1), u), v), w); };
      for (let k = 0; k < S; k++) for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const x = i / S, y = j / S, z = k / S; d[(k * S + j) * S + i] = Math.round((vn(lat[0], x, y, z) * 0.55 + vn(lat[1], x, y, z) * 0.3 + vn(lat[2], x, y, z) * 0.15) * 255); }
      const nt = new THREE.Data3DTexture(d, S, S, S); nt.format = THREE.RedFormat; nt.type = THREE.UnsignedByteType; nt.minFilter = nt.magFilter = THREE.LinearFilter; nt.wrapS = nt.wrapT = nt.wrapR = THREE.RepeatWrapping; nt.needsUpdate = true;
      const blank = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType); blank.needsUpdate = true;
      const U = (x) => ({ value: x });
      vol.mat = new THREE.ShaderMaterial({
        uniforms: { tDepth: U(rt.depthTexture), tH: U(blank), tShadow: U(null), tN: U(nt), uProjInv: U(new THREE.Matrix4()), uViewInv: U(new THREE.Matrix4()), uShadowM: U(new THREE.Matrix4()), uShipInv: U(new THREE.Matrix4()),
          uCam: U(new THREE.Vector3()), uSunDir: U(new THREE.Vector3(0, 1, 0)), uFogCol: U(new THREE.Color()), uScat: U(new THREE.Color()), uOrg: U(new THREE.Vector3()), uHB: U(new THREE.Vector4(-490, -490, 980, 0)),
          uDen: U(new THREE.Vector4(0.008, 0.065, 0.01, 2.5)), uCloud: U(new THREE.Vector4(0, 40, 40, 220)), uHR: U(new THREE.Vector2(-30, 230)), uWind: U(new THREE.Vector2(0.9, 0.35)), uRes: U(new THREE.Vector2()), uTime: U(0), uFar: U(600), uShadowOn: U(0), uFrame: U(0) },
        vertexShader: POST_VS, fragmentShader: VOL_FS, depthTest: false, depthWrite: false,
      });
      vol.scene = new THREE.Scene(); const vq = new THREE.Mesh(new THREE.BufferGeometry().copy(new THREE.PlaneGeometry(2, 2)), vol.mat); vq.frustumCulled = false; vol.scene.add(vq);
    }
    const bopt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    bloomA = new THREE.WebGLRenderTarget(8, 8, bopt); bloomB = new THREE.WebGLRenderTarget(8, 8, bopt);
    bloomPre = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: rt.texture }, uTx: { value: new THREE.Vector2() } }, vertexShader: POST_VS, fragmentShader: BLOOM_PRE, depthTest: false, depthWrite: false });
    bloomBlur = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: POST_VS, fragmentShader: BLOOM_BLUR, depthTest: false, depthWrite: false });
    post = new THREE.ShaderMaterial({
      uniforms: { tBloom: { value: bloomA.texture }, tVol: { value: vol.rt.texture }, uVolOn: { value: 0 }, uBloom: { value: 0.32 }, tDiffuse: { value: rt.texture }, uRes: { value: new THREE.Vector2(16, 16) }, uTime: { value: 0 }, uFear: { value: 0 }, uDamage: { value: 0 }, uFade: { value: 0 }, uLeech: { value: 0 }, uFlash: { value: 0 }, uBright: { value: 1 }, uStatic: { value: 0 }, uExposure: { value: 1 }, uLowHp: { value: 0 }, uHealth: { value: 1 }, uSun: { value: 0 }, uSunUV: { value: new THREE.Vector2() }, uPeek: { value: 0 }, uPeekUV: { value: new THREE.Vector2() }, uWhite: { value: 0 }, uHeat: { value: 0 }, uWarp: { value: 0 }, uHeatCol: { value: fx.heatCol } },
      vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    postScene = new THREE.Scene(); const pm = new THREE.Mesh(tri, post); pm.frustumCulled = false; postScene.add(pm);
    quadScene = new THREE.Scene(); quad = new THREE.Mesh(tri, bloomPre); quad.frustumCulled = false; quadScene.add(quad);
    postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    window.addEventListener('resize', resize);
    resize();
  }
  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight), a = w / h;
    renderer.setSize(w, h, false);
    const ih = RES_LEVELS[clamp(Settings.res, 0, RES_LEVELS.length - 1)].h;
    const rh = Math.min(h, ih), rw = Math.round(rh * a);
    rt.setSize(rw, rh);
    vol.rt.setSize(Math.max(4, Math.ceil(rw / 2)), Math.max(4, Math.ceil(rh / 2)));
    post.uniforms.uRes.value.set(rw, rh);
    const bw = Math.max(4, Math.round(rw / 4)), bh = Math.max(4, Math.round(rh / 4));
    bloomA.setSize(bw, bh); bloomB.setSize(bw, bh);
    bloomPre.uniforms.uTx.value.set(1.5 / rw, 1.5 / rh);
    camera.aspect = a; camera.fov = Settings.fov; camera.updateProjectionMatrix();
    vmCamera.aspect = a; vmCamera.updateProjectionMatrix();
    flash.castShadow = !!Settings.shadows;
  }
  function flickerOf(src, t) {
    switch (src.state) {
      case 'off': return 0;
      case 'emergency': return 0.55 + 0.45 * Math.sin(t * 2.2 + src.phase);
      // (fire: always moving, never quite steady)
      case 'fire': return 0.72 + 0.2 * Math.sin(t * 13.1 + src.phase) * Math.sin(t * 7.3 + src.phase * 2.1) + Math.random() * 0.1;
      case 'flicker': {
        const n = Math.sin(t * 11.3 + src.phase) * Math.sin(t * 4.1 + src.phase * 1.7) + Math.sin(t * 0.37 + src.phase) * 0.9;
        return n > -0.15 ? (Math.random() < 0.04 ? 0.15 : 1) : (Math.random() < 0.3 ? 0.6 : 0.03);
      }
      default: return 1;
    }
  }
  // choose the nearest light sources (in the camera's zone) for the point light pool.
  // Lamps the camera has no line of sight to count as much further away, so light from the
  // next corridor over doesn't creep under the walls.
  function updateLights(sources, cam, zone, t, dt, power, onVisual, losFn) {
    poolT -= dt;
    if (poolT <= 0) {
      poolT = 0.25;
      const cands = [];
      for (const s of sources) {
        if (s.zone !== zone || s.state === 'off') continue;
        if (s.fac && !power && s.state !== 'emergency') continue;
        let d = (s.x - cam.x) ** 2 + (s.y - cam.y) ** 2 + (s.z - cam.z) ** 2;
        if (d > (s.far || 40) ** 2) continue;
        // a lamp you have no line of sight to (behind a wall or a closed door) must not light your side; one seen only
        // through a door's window spills some of its light through
        const vis = losFn && d > 6 ? +losFn(s) : 1;
        if (!vis) continue;
        s.through = vis;
        cands.push([d, s]);
      }
      cands.sort((a, b) => a[0] - b[0]);
      poolSel = cands.slice(0, POOL).map((c) => c[1]);
    }
    for (let i = 0; i < POOL; i++) {
      const L = pool[i], s = poolSel[i];
      if (!s) { L.intensity = 0; continue; }
      let f = flickerOf(s, t);
      if (s.fac && !power && s.state !== 'emergency') f = 0;
      s.lit = f;
      L.position.set(s.x, s.y, s.z); L.color.set(s.color);
      L.distance = s.range || 11;
      L.intensity = f * (s.power || 1) * (s.ship ? 34 * fx.cabin : s.zone === 'out' ? 60 : 26) * (s.through ?? 1);
      if (onVisual) onVisual(s, f);
    }
  }
  // A body-cam's view from somewhere else (deep in the facility while you're up in the ship) is lit the way it is
  // there while it's drawn. rig() keeps how the lights are set for your own view; rig(true) puts them all back.
  const _rig = { pool: [], rem: [], hc: new THREE.Color(), hg: new THREE.Color(), fc: new THREE.Color(), bg: new THREE.Color(), fa: new Float32Array(4), fb: new Float32Array(4), hi: 0, si: 0, fd: 0 };
  function rig(back) {
    const K = _rig, fog = scene.fog;
    if (!back) {
      pool.forEach((L, i) => { const k = K.pool[i] || (K.pool[i] = { p: new THREE.Vector3(), c: new THREE.Color() }); k.p.copy(L.position); k.c.copy(L.color); k.d = L.distance; k.i = L.intensity; });
      remote.forEach((s, i) => { const k = K.rem[i] || (K.rem[i] = { p: new THREE.Vector3(), t: new THREE.Vector3() }); k.p.copy(s.position); k.t.copy(s.target.position); k.i = s.intensity; k.d = s.distance; k.a = s.angle; k.b = beams[i].visible; });
      K.hi = hemi.intensity; K.hc.copy(hemi.color); K.hg.copy(hemi.groundColor); K.si = sun.intensity; K.fc.copy(fog.color); K.fd = fog.density; K.bg.copy(scene.background); K.fa.set(FOG_A); K.fb.set(FOG_B);
      return;
    }
    pool.forEach((L, i) => { const k = K.pool[i]; L.position.copy(k.p); L.color.copy(k.c); L.distance = k.d; L.intensity = k.i; });
    remote.forEach((s, i) => { const k = K.rem[i]; s.position.copy(k.p); s.target.position.copy(k.t); s.intensity = k.i; s.distance = k.d; s.angle = k.a; beams[i].visible = k.b; });
    hemi.intensity = K.hi; hemi.color.copy(K.hc); hemi.groundColor.copy(K.hg); sun.intensity = K.si; fog.color.copy(K.fc); fog.density = K.fd; scene.background.copy(K.bg); FOG_A.set(K.fa); FOG_B.set(K.fb);
  }
  // the lamps nearest a spot lighting it, for that one view: picked the way updateLights picks them (only those it can
  // see), but at once, and leaving what your own view has picked alone
  const _at = [];
  function lightsAt(sources, at, zone, t, power, losFn) {
    _at.length = 0;
    for (const s of sources) {
      if (s.zone !== zone || s.state === 'off' || (s.fac && !power && s.state !== 'emergency')) continue;
      const d = (s.x - at.x) ** 2 + (s.y - at.y) ** 2 + (s.z - at.z) ** 2;
      if (d > (s.far || 40) ** 2) continue;
      const vis = losFn && d > 6 ? +losFn(s) : 1;
      if (vis) _at.push([d, s, vis]);
    }
    _at.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < POOL; i++) {
      const L = pool[i], c = _at[i];
      if (!c) { L.intensity = 0; continue; }
      const s = c[1], f = s.fac && !power && s.state !== 'emergency' ? 0 : flickerOf(s, t);
      L.position.set(s.x, s.y, s.z); L.color.set(s.color); L.distance = s.range || 11;
      L.intensity = f * (s.power || 1) * (s.ship ? 34 * fx.cabin : s.zone === 'out' ? 60 : 26) * c[2];
    }
  }
  function setGlow(i, pos, color, k) {
    const L = i < 0 ? glowLocal : glowRemote[i];
    if (!L) return;
    if (!pos) { L.intensity = 0; return; }
    L.position.copy(pos); L.color.set(color); L.intensity = 1.6 * k;
  }
  function setBeam(i, s, on) {
    const b = beams[i]; if (!b) return;
    b.visible = on;
    if (!on) return;
    b.position.copy(s.position); b.lookAt(s.target.position);
    b.material.uniforms.uA.value = 0.07;
  }
  function updateDust(t, on) {
    const u = dustMat.uniforms;
    u.uTime.value = t; u.uCam.value.copy(camera.position);
    flash.getWorldPosition(u.uFP.value);
    const tp = flash.target.getWorldPosition(new THREE.Vector3());
    u.uFD.value.copy(tp).sub(u.uFP.value).normalize();
    u.uCos.value = Math.cos(flash.angle * 0.95);
    u.uOn.value = on;
  }
  function render(t) {
    updateScan(performance.now() / 1000);
    const u = post.uniforms;
    u.uTime.value = t; u.uFear.value = fx.fear; u.uDamage.value = fx.damage; u.uFade.value = fx.fade; u.uLeech.value = fx.leech;
    u.uPeek.value = fx.peek; u.uPeekUV.value.copy(fx.peekUV);
    u.uFlash.value = fx.flash; u.uStatic.value = fx.static; u.uExposure.value = fx.exposure; u.uLowHp.value = fx.lowhp; u.uBright.value = Settings.bright; u.uHealth.value = fx.health; u.uWhite.value = fx.white; u.uHeat.value = fx.heat; u.uWarp.value = fx.warp;
    renderer.setRenderTarget(rt);
    renderer.clear();
    u.uSun.value = 0; u.uVolOn.value = 0;
    if (backdrop && backdrop.visible) {
      camera.updateMatrixWorld();
      // the backdrop is seen from the ship's middle, whatever the eye does: a world that size shows no parallax at all
      // as you walk about the cabin (only which way you look matters)
      camera.matrixWorld.decompose(_bgp, bgCam.quaternion, _ss); bgCam.position.set(0, 1.6, 0);
      if (bgCam.fov !== camera.fov || bgCam.aspect !== camera.aspect || bgCam.near !== bgNear) { bgCam.fov = camera.fov; bgCam.aspect = camera.aspect; bgCam.near = bgNear; bgCam.updateProjectionMatrix(); }
      renderer.render(bgScene, bgCam);
      renderer.clearDepth();
      if (sunObj && sunObj.visible && sunObj.material.opacity > 0.01) {
        sunObj.getWorldPosition(_sv).project(bgCam);
        const x = _sv.x * 0.5 + 0.5, y = _sv.y * 0.5 + 0.5;
        if (_sv.z < 1 && x > 0.002 && x < 0.998 && y > 0.002 && y < 0.998) { u.uSun.value = sunObj.material.opacity; u.uSunUV.value.set(x, y); }
      }
      const bg = scene.background; scene.background = null;
      renderer.render(scene, camera);
      scene.background = bg;
    } else {
      renderer.render(scene, camera);
      // the air, marched through (outdoors, when it's on): into its own target, then back to the frame for the hands
      if (vol.on) {
        const vu = vol.mat.uniforms; camera.updateMatrixWorld();
        vu.uProjInv.value.copy(camera.projectionMatrixInverse); vu.uViewInv.value.copy(camera.matrixWorld); camera.getWorldPosition(vu.uCam.value);
        const sm = sun.shadow && sun.shadow.map; vu.tShadow.value = sm ? sm.texture : null; vu.uShadowOn.value = sm && sun.castShadow && sun.intensity > 0.01 ? 1 : 0; if (sm) vu.uShadowM.value.copy(sun.shadow.matrix);
        vu.uTime.value = t; vu.uFrame.value = (vol.frame = (vol.frame + 1) % 64);
        renderer.setRenderTarget(vol.rt); renderer.render(vol.scene, postCam); renderer.setRenderTarget(rt);
      }
      u.uVolOn.value = vol.on ? 1 : 0;
      // (on the ground with no air, the sun in the sky glares the same way, while its disc can be seen)
      if (fx.sun > 0) {
        camera.getWorldPosition(_sv).addScaledVector(fx.sunDir, 100).project(camera);
        const x = _sv.x * 0.5 + 0.5, y = _sv.y * 0.5 + 0.5;
        if (_sv.z < 1 && x > 0.002 && x < 0.998 && y > 0.002 && y < 0.998) { u.uSun.value = fx.sun; u.uSunUV.value.set(x, y); }
      }
    }
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
    // bloom: bright pass into A, then blur A -> B -> A twice with a widening kernel
    u.uBloom.value = fx.bloom;
    if (fx.bloom > 0) {
      quad.material = bloomPre; renderer.setRenderTarget(bloomA); renderer.render(quadScene, postCam);
      quad.material = bloomBlur;
      for (let i = 0; i < 2; i++) {
        bloomBlur.uniforms.tSrc.value = bloomA.texture; bloomBlur.uniforms.uDir.value.set((1 + i * 1.5) / bloomA.width, 0);
        renderer.setRenderTarget(bloomB); renderer.render(quadScene, postCam);
        bloomBlur.uniforms.tSrc.value = bloomB.texture; bloomBlur.uniforms.uDir.value.set(0, (1 + i * 1.5) / bloomA.height);
        renderer.setRenderTarget(bloomA); renderer.render(quadScene, postCam);
      }
    }
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(postScene, postCam);
  }
  // a secondary view (the crew body-cams): the scene, and the space backdrop when it's showing, into a region of a
  // render target. Shadow maps are reused from the main view rather than re-rendered.
  const _feedBg = new THREE.PerspectiveCamera(70, 1, 20, 40000), _bgp = new THREE.Vector3();
  function renderView(cam, target, x, y, w, h) {
    const sa = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    target.viewport.set(x, y, w, h); target.scissor.set(x, y, w, h); target.scissorTest = true;
    renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 1); renderer.clear();
    cam.updateMatrixWorld();
    if (backdrop && backdrop.visible) {
      cam.matrixWorld.decompose(_bgp, _feedBg.quaternion, _ss); _feedBg.position.set(0, 1.6, 0);
      if (_feedBg.fov !== cam.fov || _feedBg.aspect !== cam.aspect) { _feedBg.fov = cam.fov; _feedBg.aspect = cam.aspect; _feedBg.updateProjectionMatrix(); }
      renderer.render(bgScene, _feedBg); renderer.clearDepth();
      const bg = scene.background; scene.background = null; renderer.render(scene, cam); scene.background = bg;
    } else renderer.render(scene, cam);
    renderer.shadowMap.autoUpdate = sa;
    renderer.setRenderTarget(null);
  }
  // render a small preview of an object to a data URL (inventory icons, suit previews)
  function snapshot(obj, size = 96, raw = false) {
    const t = new THREE.WebGLRenderTarget(size, size);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 2.5); dl.position.set(raw ? -0.8 : 1, 2, raw ? -2 : 2); sc.add(dl);
    sc.add(obj);
    const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
    const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    cam.position.copy(c).add((raw ? new THREE.Vector3(0.35, 0.25, -1) : new THREE.Vector3(0.7, 0.55, 1)).normalize().multiplyScalar(s * (raw ? 1.25 : 1.55))); cam.lookAt(c);
    renderer.setRenderTarget(t); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
    const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(t, 0, 0, size, size, px);
    renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); t.dispose();
    const [cv, g] = TEX.canvas(size, size); const id = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
      if (raw) { for (let k = 0; k < 3; k++) id.data[di + k] = Math.min(255, Math.pow(px[si + k] / 255, 0.75) * 255); }
      else {
        const l = Math.pow((px[si] * 0.3 + px[si + 1] * 0.55 + px[si + 2] * 0.15) / 255, 0.6);
        id.data[di] = 255 * l; id.data[di + 1] = 190 * l; id.data[di + 2] = 120 * l;
      }
      id.data[di + 3] = px[si + 3];
    }
    g.putImageData(id, 0, 0);
    return cv.toDataURL();
  }
  return {
    init, resize, render, renderView, updateLights, lightsAt, rig, flickerOf, snapshot, setGlow, setBeam, updateDust, fx,
    // the volumetric air (see VOL_FS): on or off, and its uniforms to fill in
    get vol() { return vol; },
    setBackdrop(group, sun) { backdrop = group; sunObj = sun; bgScene.add(group); },
    // the backdrop's near plane: pulled in when the planet's surface comes close (falling toward it), out again after
    setBgNear(n) { bgNear = n; },
    setFog, setShipFog, startScan,
    // compile what a new object needs before it is ever drawn: where the browser can, off the main thread, so the
    // first frame that shows it doesn't stall. Calls back once it's ready (or after a while regardless).
    precompile(obj, cb) {
      let fired = false; const go = () => { if (!fired) { fired = true; cb(); } };
      setTimeout(go, 4000);
      try { renderer.compileAsync(obj, camera, scene).then(go, go); } catch (e) { go(); }
    },
    // the sun's shadow frustum: tight in the ship (sunlight through the windows), wide outdoors
    setSunShadow(size, far) {
      if (size === shadowSize) return; shadowSize = size;
      Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, far });
      sun.shadow.camera.updateProjectionMatrix();
    },
    get renderer() { return renderer; }, get scene() { return scene; }, get camera() { return camera; },
    get bgScene() { return bgScene; }, get bgSun() { return bgSun; },
    get vmScene() { return vmScene; }, get vmCamera() { return vmCamera; },
    get hemi() { return hemi; }, get sun() { return sun; }, get flash() { return flash; }, get remote() { return remote; },
    get vmHemi() { return vmHemi; }, get vmPoint() { return vmPoint; },
  };
})();
