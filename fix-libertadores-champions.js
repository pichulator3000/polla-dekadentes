// Ejecutar en consola del navegador (F12) logueado como admin
// Elimina todos los partidos y predicciones de Copa Libertadores y Champions League

async function limpiarTorneos() {
  const torneos = ['Copa Libertadores 2026', 'Champions League'];
  
  for (const torneo of torneos) {
    const matches = CACHE.matches.filter(m => m.tournament === torneo);
    console.log(`Encontrados ${matches.length} partidos de "${torneo}"`);
    
    if (matches.length === 0) {
      console.log(`  → No hay partidos de "${torneo}" en cache local`);
      continue;
    }
    
    for (const m of matches) {
      // Eliminar predicciones del partido
      const preds = CACHE.preds.filter(p => p.matchId === m.id);
      for (const p of preds) {
        await RT.ref('pf/preds/' + p.userId + '__' + p.matchId).remove();
      }
      // Eliminar partido
      await RT.ref('pf/matches/' + m.id).remove();
      console.log(`  ✓ Eliminado: ${m.home} vs ${m.away}`);
    }
    
    // Actualizar cache local
    CACHE.matches = CACHE.matches.filter(m => m.torneo !== torneo);
    console.log(`  ✓ Torneo "${torneo}" eliminado completamente`);
  }
  
  // Limpiar hiddenTournaments si están ahí
  const settings = await RT.ref('pf/settings').once('value');
  const s = settings.val() || {};
  if (s.hiddenTournaments) {
    s.hiddenTournaments = s.hiddenTournaments.filter(t => !torneos.includes(t));
    await RT.ref('pf/settings/hiddenTournaments').set(s.hiddenTournaments);
    console.log('  ✓ Limpiado hiddenTournaments');
  }
  
  console.log('LISTO - Recarga la página');
}

limpiarTorneos();
