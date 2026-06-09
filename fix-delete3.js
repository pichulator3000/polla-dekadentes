const fs = require('fs');
let html = fs.readFileSync('C:\\Users\\valen\\polla-dekadentes\\index.html', 'utf8');

const START = 'async function eliminarTorneo(tournament) {';
const END = 'async function toggleTournamentVisibility(tournament) {';
const s = html.indexOf(START);
const e = html.indexOf(END);
if (s === -1 || e === -1) { console.error('Not found:', s, e); process.exit(1); }

console.log('Replacing from', s, 'to', e);

const NEW_FUNC = `async function eliminarTorneo(tournament) {
  const matches = CACHE.matches.filter(m => (m.tournament || 'Sin Torneo') === tournament);
  const n = matches.length;
  if (!n) return toast('No hay partidos del torneo "' + tournament + '"', 'info');

  const matchIds = new Set(matches.map(m => m.id));
  const preds = CACHE.preds.filter(p => matchIds.has(p.matchId));

  // Paso 1: Confirmar eliminacion
  const confirmed = await new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.id = 'deleteTournamentOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
    overlay.innerHTML = '<div style="background:#0f1b2d;border:1px solid rgba(56,189,248,0.2);border-radius:16px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5)">' +
      '<div style="font-size:18px;font-weight:800;color:#f87171;margin-bottom:16px">Eliminar Torneo</div>' +
      '<div style="font-size:14px;color:#e8edf5;margin-bottom:12px">Eliminar <strong>"' + tournament + '"</strong>?</div>' +
      '<div style="font-size:12px;color:#8899b0;margin-bottom:20px;line-height:1.6">' +
      'Se borraran:<br>- ' + n + ' partidos<br>- ' + preds.length + ' predicciones<br><br>' +
      '<span style="color:#f87171;font-weight:700">Esta accion NO se puede deshacer.</span></div>' +
      '<div style="display:flex;gap:10px">' +
      '<button id="cancelDelete" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(56,189,248,0.2);background:transparent;color:#8899b0;font-weight:700;cursor:pointer">Cancelar</button>' +
      '<button id="confirmDelete" style="flex:1;padding:10px;border-radius:8px;border:none;background:#7f1d1d;color:#fee2e2;font-weight:700;cursor:pointer">Eliminar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    document.getElementById('cancelDelete').onclick = function() { var el = document.getElementById('deleteTournamentOverlay'); if (el) el.remove(); resolve(false); };
    document.getElementById('confirmDelete').onclick = function() { var el = document.getElementById('deleteTournamentOverlay'); if (el) el.remove(); resolve(true); };
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); resolve(false); } };
  });
  if (!confirmed) return;

  // Paso 2: Pedir nombre exacto para confirmar
  var confirmText = await new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.id = 'confirmTournamentOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
    overlay.innerHTML = '<div style="background:#0f1b2d;border:1px solid rgba(56,189,248,0.2);border-radius:16px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5)">' +
      '<div style="font-size:18px;font-weight:800;color:#38bdf8;margin-bottom:16px">Confirmar Eliminacion</div>' +
      '<div style="font-size:13px;color:#8899b0;margin-bottom:8px">Escribe el nombre EXACTO del torneo:</div>' +
      '<div style="font-size:14px;font-weight:700;color:#e8edf5;margin-bottom:16px;font-family:monospace;background:rgba(56,189,248,0.1);padding:8px 12px;border-radius:6px">' + tournament + '</div>' +
      '<input id="tconfirm" type="text" placeholder="Nombre del torneo..." style="width:100%;padding:10px;border-radius:8px;border:1.5px solid rgba(56,189,248,0.2);background:#0a0f1c;color:#e8edf5;font-size:14px;margin-bottom:16px;box-sizing:border-box">' +
      '<div style="display:flex;gap:10px">' +
      '<button id="cancelInput" style="flex:1;padding:10px;border-radius:8px;border:1px solid rgba(56,189,248,0.2);background:transparent;color:#8899b0;font-weight:700;cursor:pointer">Cancelar</button>' +
      '<button id="confirmInput" style="flex:1;padding:10px;border-radius:8px;border:none;background:#38bdf8;color:#0a0f1c;font-weight:700;cursor:pointer">Confirmar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    var inp = document.getElementById('tconfirm');
    if (inp) inp.focus();
    document.getElementById('cancelInput').onclick = function() { var el = document.getElementById('confirmTournamentOverlay'); if (el) el.remove(); resolve(null); };
    document.getElementById('confirmInput').onclick = function() { var v = inp ? inp.value : ''; var el = document.getElementById('confirmTournamentOverlay'); if (el) el.remove(); resolve(v); };
    if (inp) { inp.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { var v = inp.value; var el = document.getElementById('confirmTournamentOverlay'); if (el) el.remove(); resolve(v); } }); }
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); resolve(null); } };
  });

  if (confirmText !== tournament) return toast('Nombre incorrecto, cancelado', 'err');

  // Paso 3: Eliminar TODOS los partidos del torneo
  toast('Eliminando "' + tournament + '" (' + n + ' partidos)...', 'info');

  try {
    // Eliminar todos los matches y sus predicciones de Firebase de una vez
    var deletePromises = matches.map(function(m) { return DB.delMatch(m.id); });
    await Promise.all(deletePromises);

    // Actualizar cache local
    CACHE.matches = CACHE.matches.filter(m => (m.tournament || 'Sin Torneo') !== tournament);

    if (currentUser && currentUser.isAdmin) {
      logActivity(currentUser.code, 'EliminoTorneo', tournament + ' (' + n + ' partidos, ' + preds.length + ' preds)');
    }

    toast('Torneo "' + tournament + '" eliminado completamente', 'ok');

    if (selectedTournament === tournament) selectedTournament = null;
    renderAdmin();
  } catch (err) {
    toast('Error al eliminar: ' + err.message, 'err');
  }
}
`;

html = html.substring(0, s) + NEW_FUNC + html.substring(e);
fs.writeFileSync('C:\\Users\\valen\\polla-dekadentes\\index.html', html, 'utf8');
console.log('Done!');
