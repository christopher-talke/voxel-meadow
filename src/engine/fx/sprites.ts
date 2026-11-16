import * as THREE from 'three';
import { scene } from '../render/stage';

// ================= sprites =================
function canvasTex(draw) { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); }
export const zTex = canvasTex(g => { g.font = '800 92px Nunito, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = 'rgba(38,48,80,0.5)'; g.strokeText('z', 64, 66); g.fillStyle = '#ffffff'; g.fillText('z', 64, 66); });
export const heartTex = canvasTex(g => {
  g.beginPath(); g.moveTo(64, 110); g.bezierCurveTo(18, 80, 6, 50, 24, 30); g.bezierCurveTo(40, 12, 60, 20, 64, 40); g.bezierCurveTo(68, 20, 88, 12, 104, 30); g.bezierCurveTo(122, 50, 110, 80, 64, 110); g.closePath();
  g.lineWidth = 9; g.strokeStyle = '#ffffff'; g.stroke(); g.fillStyle = '#ff7aa2'; g.fill();
});
export const dropTex = canvasTex(g => { g.fillStyle = 'rgba(220,240,255,0.95)'; g.beginPath(); g.arc(64, 64, 26, 0, 6.283); g.fill(); });
const fxs: any[] = [];
// sprites are recycled: splashes and drips come in bursts, and building a sprite and material each time churns memory
const pool: THREE.Sprite[] = [];
export function puff(tex, pos, size, life, vy, drift, vx = 0, vz = 0, grav = 0) {
  let s = pool.pop();
  if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })); scene.add(s); }
  const m = s.material; if (m.map !== tex) { m.map = tex; m.needsUpdate = true; } m.opacity = 0;
  s.visible = true; s.position.copy(pos); s.scale.setScalar(size);
  fxs.push({ s, t: 0, life, vy, drift, size, vx, vz, grav });
}
export function updateFx(dt) {
  for (let i = fxs.length - 1; i >= 0; i--) {
    const f = fxs[i]; f.t += dt; const p = f.t / f.life;
    if (p >= 1) { f.s.visible = false; pool.push(f.s); fxs[i] = fxs[fxs.length - 1]; fxs.pop(); continue; }
    f.vy -= f.grav * dt;
    f.s.position.x += (f.vx + Math.sin(f.t * 2.2) * f.drift) * dt; f.s.position.y += f.vy * dt; f.s.position.z += f.vz * dt;
    f.s.material.opacity = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
    f.s.scale.setScalar(f.size * (f.grav ? 1 : 0.7 + 0.6 * p));
  }
}
