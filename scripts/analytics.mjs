/**
 * ═══════════════════════════════════════════════════════════════
 * POLLA DEKADENTES — SISTEMA DE MONITOREO Y ANALYTICS
 * 
 * Registra sesiones de usuarios, detecta bots y proporciona
 * estadísticas de uso sin almacenar datos sensibles.
 * 
 * Estructura Firebase:
 * /analytics/sessions/{sessionId}
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Genera un UUID v4 simple
 * @returns {string} UUID
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Detecta si el User-Agent pertenece a un bot/scraper conocido
 * @param {string} userAgent - User-Agent del navegador
 * @returns {object} { isBot: boolean, botName?: string, reason?: string }
 */
export function detectBot(userAgent = navigator.userAgent) {
  if (!userAgent) return { isBot: false };

  const ua = userAgent.toLowerCase();

  // Bots de búsqueda y scrapers conocidos
  const botPatterns = [
    { name: 'GoogleBot', pattern: /googlebot|google-read-aloud|gsa-crawl/ },
    { name: 'Bingbot', pattern: /bingbot|bingebot/ },
    { name: 'Yandex', pattern: /yandexbot|yandex/ },
    { name: 'Facebook', pattern: /facebookexternalhit|facebookplatform/ },
    { name: 'Twitter', pattern: /twitterbot|t.co\/web/ },
    { name: 'LinkedInBot', pattern: /linkedinbot/ },
    { name: 'Slurp', pattern: /slurp|indy library/ },
    { name: 'DuckDuckBot', pattern: /duckduckbot/ },
    { name: 'Baidu', pattern: /baiduspider|baidu/ },
    { name: 'Scrapy', pattern: /scrapy/ },
    { name: 'Python', pattern: /python-|python\/|requests\/|urllib/ },
    { name: 'cURL', pattern: /curl\/|libcurl/ },
    { name: 'Wget', pattern: /wget\/|wget/ },
    { name: 'Phantom', pattern: /phantomjs|phantom\.js/ },
    { name: 'Headless', pattern: /headlesschrome|wdio/ },
    { name: 'Selenium', pattern: /webdriver|selenium/ },
    { name: 'Puppeteer', pattern: /puppeteer|chrome-lighthouse/ },
    { name: 'Sentry', pattern: /sentry/ },
    { name: 'Pingdom', pattern: /pingdom\.com|pagerduty|uptimerobot/ },
    { name: 'Monitoring', pattern: /monitoring|monitor|healthcheck|statuspage/ },
    { name: 'Archive', pattern: /archive|wayback/ },
  ];

  for (const bot of botPatterns) {
    if (bot.pattern.test(ua)) {
      return {
        isBot: true,
        botName: bot.name,
        reason: `Detected bot pattern: ${bot.name}`,
      };
    }
  }

  return { isBot: false };
}

/**
 * Obtiene la zona horaria del cliente
 * @returns {string} Nombre de la zona horaria (ej: "America/Santiago")
 */
export function getTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Obtiene el idioma del navegador
 * @returns {string} Código de idioma (ej: "es-CL")
 */
export function getLanguage() {
  return navigator.language || navigator.userLanguage || 'en-US';
}

/**
 * Obtiene el tamaño de la pantalla
 * @returns {object} { width, height, devicePixelRatio }
 */
export function getScreenSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

/**
 * Obtiene información de pantalla adicional
 * @returns {object} Información de pantalla disponible
 */
export function getScreenInfo() {
  const screen = window.screen || {};
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    screenWidth: screen.width,
    screenHeight: screen.height,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    devicePixelRatio: window.devicePixelRatio || 1,
    orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
  };
}

/**
 * Calcula métricas de comportamiento sospechoso
 * @returns {object} { suspicionScore: 0-100, indicators: string[] }
 */
export function calculateSuspicionScore() {
  const indicators = [];
  let suspicionScore = 0;

  // 1. Verificar User-Agent
  const botCheck = detectBot();
  if (botCheck.isBot) {
    indicators.push(`bot:${botCheck.botName}`);
    suspicionScore += 50;
  }

  // 2. Verificar si no hay pantalla (headless)
  if (window.innerWidth === 0 || window.innerHeight === 0) {
    indicators.push('zero-screen-size');
    suspicionScore += 30;
  }

  // 3. Verificar Navigator
  if (!navigator.cookieEnabled) {
    indicators.push('cookies-disabled');
    suspicionScore += 15;
  }

  // 4. Verificar doNotTrack
  if (navigator.doNotTrack === '1') {
    indicators.push('do-not-track-enabled');
    suspicionScore += 5;
  }

  // 5. Verificar si está siendo debugged (heurística simple)
  let startTime = performance.now();
  debugger; // eslint-disable-line no-debugger
  let endTime = performance.now();
  if (endTime - startTime > 100) {
    indicators.push('debugger-detected');
    suspicionScore += 20;
  }

  // 6. Verificar plugin WebDriver (Selenium, etc.)
  if (navigator.webdriver) {
    indicators.push('webdriver-detected');
    suspicionScore += 40;
  }

  // Clamp score entre 0 y 100
  suspicionScore = Math.min(suspicionScore, 100);

  return {
    suspicionScore: Math.max(0, suspicionScore),
    indicators: indicators.length > 0 ? indicators : ['normal-user'],
  };
}

/**
 * Crea el objeto de sesión con toda la información del cliente
 * @param {string} userId - ID del usuario
 * @returns {object} Objeto de sesión
 */
export function createSessionData(userId = null) {
  const suspicion = calculateSuspicionScore();

  return {
    sessionId: generateUUID(),
    userId: userId || null,
    timestamp: new Date().toISOString(),
    timestampMs: Date.now(),
    
    // Información del navegador
    userAgent: navigator.userAgent,
    language: getLanguage(),
    timezone: getTimezone(),
    
    // Información de pantalla
    ...getScreenInfo(),
    
    // Información de la sesión
    url: window.location.href,
    origin: window.location.origin,
    pathname: window.location.pathname,
    referrer: document.referrer || null,
    
    // Navegador capabilidades
    onLine: navigator.onLine,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: navigator.deviceMemory || null,
    
    // Detección de bots
    ...detectBot(),
    
    // Score de sospecha
    suspicionScore: suspicion.suspicionScore,
    suspicionIndicators: suspicion.indicators,
  };
}

/**
 * Registra una sesión en Firebase
 * @param {object} databaseRef - Referencia a Firebase Realtime Database
 * @param {string} userId - ID del usuario
 * @returns {Promise<string>} sessionId
 */
export async function captureSession(databaseRef, userId = null) {
  try {
    const sessionData = createSessionData(userId);
    const { sessionId } = sessionData;

    // Guardar en Firebase bajo /analytics/sessions
    await databaseRef.ref(`analytics/sessions/${sessionId}`).set(sessionData);

    // Guardar sessionId en sessionStorage para evitar duplicados
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('polla_session_id', sessionId);
    }

    return sessionId;
  } catch (error) {
    console.error('Error capturing session:', error);
    return null;
  }
}

/**
 * Verifica si ya existe una sesión registrada
 * @returns {string|null} sessionId o null
 */
export function getExistingSessionId() {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage.getItem('polla_session_id');
  }
  return null;
}

/**
 * FUNCIONES DE ESTADÍSTICAS
 */

/**
 * Obtiene sesiones en un rango de tiempo
 * @param {object} databaseRef - Referencia Firebase
 * @param {number} hoursBack - Cuántas horas atrás buscar (default: 24)
 * @returns {Promise<Array>} Array de sesiones
 */
export async function getSessionsInTimeRange(databaseRef, hoursBack = 24) {
  try {
    const snap = await databaseRef.ref('analytics/sessions').once('value');
    const sessions = snap.val() ? Object.values(snap.val()) : [];

    const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
    return sessions.filter(s => s.timestampMs >= cutoffTime);
  } catch (error) {
    console.error('Error getting sessions:', error);
    return [];
  }
}

/**
 * Calcula estadísticas de sesiones
 * @param {object} databaseRef - Referencia Firebase
 * @param {number} hoursBack - Cuántas horas atrás (default: 24)
 * @returns {Promise<object>} Estadísticas completas
 */
export async function getAnalyticsStats(databaseRef, hoursBack = 24) {
  const sessions = await getSessionsInTimeRange(databaseRef, hoursBack);

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      uniqueUsers: 0,
      averageSuspicionScore: 0,
      possibleBots: 0,
      sessionsByUserAgent: {},
      sessionsByLanguage: {},
      sessionsByTimezone: {},
      sessionsByOrientation: {},
      sessionsByDay: {},
      lastHourSessions: 0,
      lastMinuteSessions: 0,
      suspiciousSessions: [],
    };
  }

  // Groupings y cálculos
  const userIds = new Set();
  const userAgents = {};
  const languages = {};
  const timezones = {};
  const orientations = {};
  const dayGroups = {};
  const sessionsByUser = {};
  const now = Date.now();
  const lastHourMs = now - 3600000;
  const lastMinuteMs = now - 60000;
  let lastHourCount = 0;
  let lastMinuteCount = 0;
  let totalSuspicion = 0;
  let botCount = 0;
  const suspiciousList = [];

  for (const session of sessions) {
    // Contar usuarios únicos
    if (session.userId) userIds.add(session.userId);

    // Agrupar por usuario
    const userId = session.userId || 'anonymous';
    if (!sessionsByUser[userId]) {
      sessionsByUser[userId] = {
        totalSessions: 0,
        botSessions: 0,
        suspiciousSessions: 0,
        maxSuspicion: 0,
        lastSeen: null,
      };
    }
    sessionsByUser[userId].totalSessions++;
    if (session.isBot) sessionsByUser[userId].botSessions++;
    const suspicion = session.suspicionScore || 0;
    if (suspicion > 30) sessionsByUser[userId].suspiciousSessions++;
    if (suspicion > sessionsByUser[userId].maxSuspicion) {
      sessionsByUser[userId].maxSuspicion = suspicion;
    }
    sessionsByUser[userId].lastSeen = session.timestamp;

    // User-Agent stats
    const ua = session.userAgent || 'unknown';
    userAgents[ua] = (userAgents[ua] || 0) + 1;

    // Language stats
    const lang = session.language || 'unknown';
    languages[lang] = (languages[lang] || 0) + 1;

    // Timezone stats
    const tz = session.timezone || 'unknown';
    timezones[tz] = (timezones[tz] || 0) + 1;

    // Orientation stats
    const orientation = session.orientation || 'unknown';
    orientations[orientation] = (orientations[orientation] || 0) + 1;

    // Day grouping (YYYY-MM-DD)
    const date = new Date(session.timestamp);
    const dayKey = date.toISOString().split('T')[0];
    dayGroups[dayKey] = (dayGroups[dayKey] || 0) + 1;

    // Last hour/minute
    if (session.timestampMs >= lastHourMs) lastHourCount++;
    if (session.timestampMs >= lastMinuteMs) lastMinuteCount++;

    // Suspicion scores
    const score = session.suspicionScore || 0;
    totalSuspicion += score;
    if (session.isBot) botCount++;
    if (score > 30) {
      suspiciousList.push({
        sessionId: session.sessionId,
        score: score,
        indicators: session.suspicionIndicators,
        timestamp: session.timestamp,
        userAgent: ua,
      });
    }
  }

  // Mapear userAgent -> Set de userIds
  const uaToUserIds = {};
  for (const session of sessions) {
    const ua = session.userAgent || 'unknown';
    const uid = session.userId || 'anonymous';
    if (!uaToUserIds[ua]) uaToUserIds[ua] = new Set();
    uaToUserIds[ua].add(uid);
  }

  // Ordenar User-Agents por frecuencia y detectar bots
  const topUserAgents = Object.entries(userAgents)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ua, count]) => ({
      userAgent: ua,
      count,
      isBot: detectBot(ua).isBot,
      botName: detectBot(ua).botName,
      userIds: Array.from(uaToUserIds[ua] || []),
    }));

  return {
    totalSessions: sessions.length,
    uniqueUsers: userIds.size,
    averageSuspicionScore: Math.round(totalSuspicion / sessions.length),
    possibleBots: botCount,
    sessionsByUser: sessionsByUser,
    sessionsByUserAgent: userAgents,
    topUserAgents,
    sessionsByLanguage: languages,
    sessionsByTimezone: timezones,
    sessionsByOrientation: orientations,
    sessionsByDay: dayGroups,
    lastHourSessions: lastHourCount,
    lastMinuteSessions: lastMinuteCount,
    suspiciousSessions: suspiciousList.sort((a, b) => b.score - a.score),
    timeRange: {
      hoursBack,
      from: new Date(now - hoursBack * 60 * 60 * 1000).toISOString(),
      to: new Date(now).toISOString(),
    },
  };
}

/**
 * Detecta patrones de scraping/ataque automático
 * @param {object} databaseRef - Referencia Firebase
 * @param {object} options - { minAccesses = 5, timeWindow = 60 (segundos) }
 * @returns {Promise<Array>} Array de patrones sospechosos
 */
export async function detectScrapingPatterns(databaseRef, options = {}) {
  const {
    minAccesses = 5,
    timeWindowSeconds = 60,
  } = options;

  try {
    const snap = await databaseRef.ref('analytics/sessions').once('value');
    const sessions = snap.val() ? Object.values(snap.val()) : [];

    const patterns = {};

    // Agrupar por User-Agent y buscar múltiples accesos en poco tiempo
    for (const session of sessions) {
      const ua = session.userAgent || 'unknown';
      if (!patterns[ua]) patterns[ua] = [];
      patterns[ua].push(session);
    }

    // Analizar patrones sospechosos
    const suspiciousPatterns = [];
    const timeWindowMs = timeWindowSeconds * 1000;

    for (const [ua, sessionList] of Object.entries(patterns)) {
      // Ordenar por timestamp
      sessionList.sort((a, b) => a.timestampMs - b.timestampMs);

      // Buscar múltiples accesos en corto tiempo
      for (let i = 0; i < sessionList.length - minAccesses + 1; i++) {
        const firstTime = sessionList[i].timestampMs;
        const windowSessions = sessionList.filter(
          s => s.timestampMs >= firstTime && s.timestampMs <= firstTime + timeWindowMs
        );

        if (windowSessions.length >= minAccesses) {
          const botInfo = detectBot(ua);
          suspiciousPatterns.push({
            userAgent: ua,
            accessCount: windowSessions.length,
            timeWindow: `${timeWindowSeconds}s`,
            startTime: new Date(firstTime).toISOString(),
            endTime: new Date(windowSessions[windowSessions.length - 1].timestampMs).toISOString(),
            isKnownBot: botInfo.isBot,
            botName: botInfo.botName,
            sessionIds: windowSessions.map(s => s.sessionId),
            avgSuspicionScore: Math.round(
              windowSessions.reduce((sum, s) => sum + (s.suspicionScore || 0), 0) / windowSessions.length
            ),
          });
        }
      }
    }

    return suspiciousPatterns.sort((a, b) => b.accessCount - a.accessCount);
  } catch (error) {
    console.error('Error detecting scraping patterns:', error);
    return [];
  }
}

/**
 * Obtiene resumen ejecutivo de analytics
 * @param {object} databaseRef - Referencia Firebase
 * @returns {Promise<object>} Resumen completo
 */
export async function getExecutiveSummary(databaseRef) {
  const stats24h = await getAnalyticsStats(databaseRef, 24);
  const stats7d = await getAnalyticsStats(databaseRef, 24 * 7);
  const scrapingPatterns = await detectScrapingPatterns(databaseRef, {
    minAccesses: 5,
    timeWindowSeconds: 60,
  });

  return {
    summary: {
      title: 'Polla Dekadentes — Analytics Summary',
      generatedAt: new Date().toISOString(),
    },
    last24Hours: stats24h,
    last7Days: stats7d,
    scrapingThreats: scrapingPatterns,
    recommendations: generateRecommendations(stats24h, scrapingPatterns),
  };
}

/**
 * Genera recomendaciones basadas en datos
 * @param {object} stats - Estadísticas de últimas 24h
 * @param {Array} scrapingPatterns - Patrones detectados
 * @returns {Array<string>} Array de recomendaciones
 */
function generateRecommendations(stats, scrapingPatterns) {
  const recommendations = [];

  if (scrapingPatterns.length > 0) {
    recommendations.push(
      `⚠️ Detectados ${scrapingPatterns.length} patron(es) sospechoso(s) de scraping`
    );
  }

  if (stats.possibleBots > stats.totalSessions * 0.1) {
    recommendations.push(
      `⚠️ ${((stats.possibleBots / stats.totalSessions) * 100).toFixed(1)}% de sesiones son bots`
    );
  }

  if (stats.lastMinuteSessions > 10) {
    recommendations.push(`📈 Alto volumen en último minuto: ${stats.lastMinuteSessions} sesiones`);
  }

  if (stats.averageSuspicionScore > 20) {
    recommendations.push(
      `🔍 Score de sospecha promedio: ${stats.averageSuspicionScore}/100`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Todo parece normal');
  }

  return recommendations;
}

export default {
  generateUUID,
  detectBot,
  getTimezone,
  getLanguage,
  getScreenSize,
  getScreenInfo,
  calculateSuspicionScore,
  createSessionData,
  captureSession,
  getExistingSessionId,
  getSessionsInTimeRange,
  getAnalyticsStats,
  detectScrapingPatterns,
  getExecutiveSummary,
};
